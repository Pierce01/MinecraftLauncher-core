const fs = require('fs')
const path = require('path')
const request = require('request')
const checksum = require('checksum')
const Zip = require('adm-zip')
const child = require('child_process')
let counter = 0

class Handler {
  constructor (client) {
    this.client = client
    this.options = client.options
    this.baseRequest = request.defaults({
      pool: { maxSockets: this.options.overrides.maxSockets || 2 },
      timeout: this.options.timeout || 10000
    })
  }

  checkJava (java) {
    return new Promise(resolve => {
      child.exec(`"${java}" -version`, (error, stdout, stderr) => {
        if (error) {
          resolve({
            run: false,
            message: error
          })
        } else {
          this.client.emit('debug', `[MCLC]: Using Java version ${stderr.match(/"(.*?)"/).pop()} ${stderr.includes('64-Bit') ? '64-bit' : '32-Bit'}`)
          resolve({
            run: true
          })
        }
      })
    })
  }

  downloadAsync (url, directory, name, retry, type) {
    return new Promise(resolve => {
      fs.mkdirSync(directory, { recursive: true })

      const _request = this.baseRequest(url)

      let receivedBytes = 0
      let totalBytes = 0

      _request.on('response', (data) => {
        if (data.statusCode === 404) {
          this.client.emit('debug', `[MCLC]: Failed to download ${url} due to: File not found...`)
          resolve(false)
        }

        totalBytes = parseInt(data.headers['content-length'])
      })

      _request.on('error', async (error) => {
        this.client.emit('debug', `[MCLC]: Failed to download asset to ${path.join(directory, name)} due to\n${error}.` +
                    ` Retrying... ${retry}`)
        if (retry) await this.downloadAsync(url, directory, name, false, type)
        resolve()
      })

      _request.on('data', (data) => {
        receivedBytes += data.length
        this.client.emit('download-status', {
          name: name,
          type: type,
          current: receivedBytes,
          total: totalBytes
        })
      })

      const file = fs.createWriteStream(path.join(directory, name))
      _request.pipe(file)

      file.once('finish', () => {
        this.client.emit('download', name)
        resolve({
          failed: false,
          asset: null
        })
      })

      file.on('error', async (e) => {
        this.client.emit('debug', `[MCLC]: Failed to download asset to ${path.join(directory, name)} due to\n${e}.` +
                    ` Retrying... ${retry}`)
        if (fs.existsSync(path.join(directory, name))) fs.unlinkSync(path.join(directory, name))
        if (retry) await this.downloadAsync(url, directory, name, false, type)
        resolve()
      })
    })
  }

  checkSum (hash, file) {
    return new Promise((resolve, reject) => {
      checksum.file(file, (err, sum) => {
        if (err) {
          this.client.emit('debug', `[MCLC]: Failed to check file hash due to ${err}`)
          resolve(false)
        } else {
          resolve(hash === sum)
        }
      })
    })
  }

  getVersion () {
    return new Promise(resolve => {
      const versionJsonPath = this.options.overrides.versionJson || path.join(this.options.directory, `${this.options.version.number}.json`)
      if (fs.existsSync(versionJsonPath)) {
        this.version = JSON.parse(fs.readFileSync(versionJsonPath))
        return resolve(this.version)
      }

      const manifest = `${this.options.overrides.url.meta}/mc/game/version_manifest.json`
      request.get(manifest, (error, response, body) => {
        if (error) resolve(error)

        const parsed = JSON.parse(body)

        for (const desiredVersion in parsed.versions) {
          if (parsed.versions[desiredVersion].id === this.options.version.number) {
            request.get(parsed.versions[desiredVersion].url, (error, response, body) => {
              if (error) resolve(error)

              this.client.emit('debug', '[MCLC]: Parsed version from version manifest')
              this.version = JSON.parse(body)
              return resolve(this.version)
            })
          }
        }
      })
    })
  }

  async getJar () {
    await this.downloadAsync(this.version.downloads.client.url, this.options.directory, `${this.options.version.number}.jar`, true, 'version-jar')

    fs.writeFileSync(path.join(this.options.directory, `${this.options.version.number}.json`), JSON.stringify(this.version, null, 4))

    return this.client.emit('debug', '[MCLC]: Downloaded version jar and wrote version json')
  }

  async getAssets () {
    const assetDirectory = path.resolve(this.options.overrides.assetRoot || path.join(this.options.root, 'assets'))
    if (!fs.existsSync(path.join(assetDirectory, 'indexes', `${this.version.assetIndex.id}.json`))) {
      await this.downloadAsync(this.version.assetIndex.url, path.join(assetDirectory, 'indexes'),
                  `${this.version.assetIndex.id}.json`, true, 'asset-json')
    }

    const index = JSON.parse(fs.readFileSync(path.join(assetDirectory, 'indexes', `${this.version.assetIndex.id}.json`), { encoding: 'utf8' }))

    this.client.emit('progress', {
      type: 'assets',
      task: 0,
      total: Object.keys(index.objects).length
    })

    await Promise.all(Object.keys(index.objects).map(async asset => {
      const hash = index.objects[asset].hash
      const subhash = hash.substring(0, 2)
      const subAsset = path.join(assetDirectory, 'objects', subhash)

      if (!fs.existsSync(path.join(subAsset, hash)) || !await this.checkSum(hash, path.join(subAsset, hash))) {
        await this.downloadAsync(`${this.options.overrides.url.resource}/${subhash}/${hash}`, subAsset, hash,
          true, 'assets')
        counter++
        this.client.emit('progress', {
          type: 'assets',
          task: counter,
          total: Object.keys(index.objects).length
        })
      }
    }))
    counter = 0

    // Copy assets to legacy if it's an older Minecraft version.
    if (this.isLegacy()) {
      if (fs.existsSync(path.join(assetDirectory, 'legacy'))) {
        this.client.emit('debug', '[MCLC]: The \'legacy\' directory is no longer used as Minecraft looks ' +
          'for the resouces folder regardless of what is passed in the assetDirecotry launch option. I\'d ' +
          `recommend removing the directory (${path.join(assetDirectory, 'legacy')})`)
      }

      const legacyDirectory = path.join(this.options.root, 'resources')
      this.client.emit('debug', `[MCLC]: Copying assets over to ${legacyDirectory}`)

      this.client.emit('progress', {
        type: 'assets-copy',
        task: 0,
        total: Object.keys(index.objects).length
      })

      await Promise.all(Object.keys(index.objects).map(async asset => {
        const hash = index.objects[asset].hash
        const subhash = hash.substring(0, 2)
        const subAsset = path.join(assetDirectory, 'objects', subhash)

        const legacyAsset = asset.split('/')
        legacyAsset.pop()

        if (!fs.existsSync(path.join(legacyDirectory, legacyAsset.join('/')))) {
          fs.mkdirSync(path.join(legacyDirectory, legacyAsset.join('/')), { recursive: true })
        }

        if (!fs.existsSync(path.join(legacyDirectory, asset))) {
          fs.copyFileSync(path.join(subAsset, hash), path.join(legacyDirectory, asset))
        }
        counter++
        this.client.emit('progress', {
          type: 'assets-copy',
          task: counter,
          total: Object.keys(index.objects).length
        })
      }))
    }
    counter = 0

    this.client.emit('debug', '[MCLC]: Downloaded assets')
  }

  parseRule (lib) {
    if (lib.rules) {
      if (lib.rules.length > 1) {
        if (lib.rules[0].action === 'allow' &&
                    lib.rules[1].action === 'disallow' &&
                    lib.rules[1].os.name === 'osx') {
          return this.getOS() === 'osx'
        } else {
          return true
        }
      } else {
        if (lib.rules[0].action === 'allow' && lib.rules[0].os) return this.getOS() !== 'osx'
      }
    } else {
      return false
    }
  }

  async getNatives () {
    const nativeDirectory = path.resolve(this.options.overrides.natives || path.join(this.options.root, 'natives', this.version.id))

    if (!fs.existsSync(nativeDirectory) || !fs.readdirSync(nativeDirectory).length) {
      fs.mkdirSync(nativeDirectory, { recursive: true })

      const natives = async () => {
        const natives = []
        await Promise.all(this.version.libraries.map(async (lib) => {
          if (!lib.downloads || !lib.downloads.classifiers) return
          if (this.parseRule(lib)) return

          const native = this.getOS() === 'osx'
            ? lib.downloads.classifiers['natives-osx'] || lib.downloads.classifiers['natives-macos']
            : lib.downloads.classifiers[`natives-${this.getOS()}`]

          natives.push(native)
        }))
        return natives
      }
      const stat = await natives()

      this.client.emit('progress', {
        type: 'natives',
        task: 0,
        total: stat.length
      })

      await Promise.all(stat.map(async (native) => {
        if (!native) return
        const name = native.path.split('/').pop()
        await this.downloadAsync(native.url, nativeDirectory, name, true, 'natives')
        if (!await this.checkSum(native.sha1, path.join(nativeDirectory, name))) {
          await this.downloadAsync(native.url, nativeDirectory, name, true, 'natives')
        }
        try {
          new Zip(path.join(nativeDirectory, name)).extractAllTo(nativeDirectory, true)
        } catch (e) {
          // Only doing a console.warn since a stupid error happens. You can basically ignore this.
          // if it says Invalid file name, just means two files were downloaded and both were deleted.
          // All is well.
          console.warn(e)
        }
        fs.unlinkSync(path.join(nativeDirectory, name))
        counter++
        this.client.emit('progress', {
          type: 'natives',
          task: counter,
          total: stat.length
        })
      }))
      this.client.emit('debug', '[MCLC]: Downloaded and extracted natives')
    }

    counter = 0
    this.client.emit('debug', `[MCLC]: Set native path to ${nativeDirectory}`)

    return nativeDirectory
  }

  fwAddArgs () {
    const forgeWrapperAgrs = [
      `-Dforgewrapper.librariesDir=${path.resolve(this.options.overrides.libraryRoot || path.join(this.options.root, 'libraries'))}`,
      `-Dforgewrapper.installer=${this.options.forge}`,
      `-Dforgewrapper.minecraft=${this.options.mcPath}`
    ]
    this.options.customArgs
      ? this.options.customArgs = this.options.customArgs.concat(forgeWrapperAgrs)
      : this.options.customArgs = forgeWrapperAgrs
  }

  isModernForge (json) {
    return json.inheritsFrom && json.inheritsFrom.split('.')[1] >= 12 && !(json.inheritsFrom === '1.12.2' && (json.id.split('.')[json.id.split('.').length - 1]) === '2847')
  }

  async getForgedWrapped () {
    let json = null
    let installerJson = null
    const versionPath = path.join(this.options.root, 'forge', `${this.version.id}`, 'version.json')
    // Since we're building a proper "custom" JSON that will work nativly with MCLC, the version JSON will not
    // be re-generated on the next run.
    if (fs.existsSync(versionPath)) {
      try {
        json = JSON.parse(fs.readFileSync(versionPath))
        if (!json.forgeWrapperVersion || !(json.forgeWrapperVersion === this.options.fw.version)) {
          this.client.emit('debug', '[MCLC]: Old ForgeWrapper has generated this version JSON, re-generating')
        } else {
          // If forge is modern, add ForgeWrappers launch arguments and set forge to null so MCLC treats it as a custom json.
          if (this.isModernForge(json)) {
            this.fwAddArgs()
            this.options.forge = null
          }
          return json
        }
      } catch (e) {
        console.warn(e)
        this.client.emit('debug', '[MCLC]: Failed to parse Forge version JSON, re-generating')
      }
    }

    this.client.emit('debug', '[MCLC]: Generating a proper version json, this might take a bit')
    const zipFile = new Zip(this.options.forge)
    json = zipFile.readAsText('version.json')
    if (zipFile.getEntry('install_profile.json')) installerJson = zipFile.readAsText('install_profile.json')

    try {
      json = JSON.parse(json)
      if (installerJson) installerJson = JSON.parse(installerJson)
    } catch (e) {
      this.client.emit('debug', '[MCLC]: Failed to load json files for ForgeWrapper, using Vanilla instead')
      return null
    }
    // Adding the installer libraries as mavenFiles so MCLC downloads them but doesn't add them to the class paths.
    if (installerJson) {
      json.mavenFiles
        ? json.mavenFiles = json.mavenFiles.concat(installerJson.libraries)
        : json.mavenFiles = installerJson.libraries
    }

    // Holder for the specifc jar ending which depends on the specifc forge version.
    let jarEnding = 'universal'
    // We need to handle modern forge differently than legacy.
    if (this.isModernForge(json)) {
      // If forge is modern and above 1.12.2, we add ForgeWrapper to the libraries so MCLC includes it in the classpaths.
      if (json.inheritsFrom !== '1.12.2') {
        this.fwAddArgs()
        const fwName = `ForgeWrapper-${this.options.fw.version}.jar`
        const fwPathArr = ['io', 'github', 'zekerzhayard', 'ForgeWrapper', this.options.fw.version]
        json.libraries.push({
          name: fwPathArr.join(':'),
          downloads: {
            artifact: {
              path: [...fwPathArr, fwName].join('/'),
              url: `${this.options.fw.baseUrl}${this.options.fw.version}/${fwName}`,
              sha1: this.options.fw.sh1,
              size: this.options.fw.size
            }
          }
        })
        json.mainClass = 'io.github.zekerzhayard.forgewrapper.installer.Main'
        jarEnding = 'launcher'

        // Providing a download URL to the universal jar mavenFile so it can be downloaded properly.
        for (const library of json.mavenFiles) {
          const lib = library.name.split(':')
          if (lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) {
            library.downloads.artifact.url = 'https://files.minecraftforge.net/maven/' + library.downloads.artifact.path
            break
          }
        }
      } else {
        // Remove the forge dependent since we're going to overwrite the first entry anyways.
        for (const library in json.mavenFiles) {
          const lib = json.mavenFiles[library].name.split(':')
          if (lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) {
            delete json.mavenFiles[library]
            break
          }
        }
      }
    } else {
      // Modifying legacy library format to play nice with MCLC's downloadToDirectory function.
      await Promise.all(json.libraries.map(async library => {
        const lib = library.name.split(':')
        if (lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) return

        let url = this.options.overrides.url.mavenForge
        const name = `${lib[1]}-${lib[2]}.jar`

        if (!library.url) {
          if (library.serverreq || library.clientreq) {
            url = this.options.overrides.url.defaultRepoForge
          } else {
            return
          }
        }
        library.url = url
        const downloadLink = `${url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${name}`
        // Checking if the file still exists on Forge's server, if not, replace it with the fallback.
        // Not checking for sucess, only if it 404s.
        this.baseRequest(downloadLink, (error, response, body) => {
          if (error) {
            this.client.emit('debug', `[MCLC]: Failed checking request for ${downloadLink}`)
          } else {
            if (response.statusCode === 404) library.url = this.options.overrides.url.fallbackMaven
          }
        })
      }))
    }
    // If a downloads property exists, we modify the inital forge entry to include ${jarEnding} so ForgeWrapper can work properly.
    // If it doesn't, we simply remove it since we're already providing the universal jar.
    if (json.libraries[0].downloads) {
      json.libraries[0].name = json.libraries[0].name + `:${jarEnding}`
      json.libraries[0].downloads.artifact.path = json.libraries[0].downloads.artifact.path.replace('.jar', `-${jarEnding}.jar`)
      json.libraries[0].downloads.artifact.url = 'https://files.minecraftforge.net/maven/' + json.libraries[0].downloads.artifact.path
    } else {
      delete json.libraries[0]
    }

    // Removing duplicates and null types
    json.libraries = this.cleanUp(json.libraries)
    if (json.mavenFiles) json.mavenFiles = this.cleanUp(json.mavenFiles)

    // Saving file for next run!
    if (!fs.existsSync(path.join(this.options.root, 'forge', this.version.id))) {
      fs.mkdirSync(path.join(this.options.root, 'forge', this.version.id), { recursive: true })
    }
    fs.writeFileSync(versionPath, JSON.stringify(json, null, 4))

    // Make MCLC treat modern forge as a custom version json rather then legacy forge.
    if (this.isModernForge(json)) this.options.forge = null

    return json
  }

  runInstaller (path) {
    return new Promise(resolve => {
      const installer = child.exec(path)
      installer.on('close', (code) => resolve())
    })
  }

  async downloadToDirectory (directory, libraries, eventName) {
    const libs = []

    await Promise.all(libraries.map(async library => {
      if (!library) return
      const lib = library.name.split(':')

      let jarPath
      let name
      if (library.downloads && library.downloads.artifact && library.downloads.artifact.path) {
        name = library.downloads.artifact.path.split('/')[library.downloads.artifact.path.split('/').length - 1]
        jarPath = path.join(directory, this.popString(library.downloads.artifact.path))
      } else {
        name = `${lib[1]}-${lib[2]}${lib[3] ? '-' + lib[3] : ''}.jar`
        jarPath = path.join(directory, `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`)
      }

      if (!fs.existsSync(path.join(jarPath, name))) {
        // Simple lib support, forgot which addon needed this but here you go, Mr special.
        if (library.url) {
          const url = `${library.url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${name}`
          await this.downloadAsync(url, jarPath, name, true, eventName)
        } else if (library.downloads && library.downloads.artifact) {
          await this.downloadAsync(library.downloads.artifact.url, jarPath, name, true, eventName)
        }
      }

      counter++
      this.client.emit('progress', {
        type: eventName,
        task: counter,
        total: libraries.length
      })
      libs.push(`${jarPath}${path.sep}${name}`)
    }))
    counter = 0

    return libs
  }

  async getClasses (classJson) {
    let libs = []

    const libraryDirectory = path.resolve(this.options.overrides.libraryRoot || path.join(this.options.root, 'libraries'))

    if (classJson) {
      if (classJson.mavenFiles) {
        await this.downloadToDirectory(libraryDirectory, classJson.mavenFiles, 'classes-maven-custom')
      }
      libs = (await this.downloadToDirectory(libraryDirectory, classJson.libraries, 'classes-custom'))
    }

    const parsed = this.version.libraries.map(lib => {
      if (lib.downloads && lib.downloads.artifact && !this.parseRule(lib)) return lib
    })

    libs = libs.concat((await this.downloadToDirectory(libraryDirectory, parsed, 'classes')))
    counter = 0

    this.client.emit('debug', '[MCLC]: Collected class paths')
    return libs
  }

  popString (path) {
    const tempArray = path.split('/')
    tempArray.pop()
    return tempArray.join('/')
  }

  cleanUp (array) {
    const newArray = []
    for (const classPath in array) {
      if (newArray.includes(array[classPath]) || array[classPath] === null) continue
      newArray.push(array[classPath])
    }
    return newArray
  }

  async getLaunchOptions (modification) {
    const type = modification || this.version

    let args = type.minecraftArguments
      ? type.minecraftArguments.split(' ')
      : type.arguments.game
    const assetRoot = path.resolve(this.options.overrides.assetRoot || path.join(this.options.root, 'assets'))
    const assetPath = this.isLegacy()
      ? path.join(this.options.root, 'resources')
      : path.join(assetRoot)

    const minArgs = this.options.overrides.minArgs || this.isLegacy() ? 5 : 11
    if (args.length < minArgs) args = args.concat(this.version.minecraftArguments ? this.version.minecraftArguments.split(' ') : this.version.arguments.game)

    this.options.authorization = await Promise.resolve(this.options.authorization)

    const fields = {
      '${auth_access_token}': this.options.authorization.access_token,
      '${auth_session}': this.options.authorization.access_token,
      '${auth_player_name}': this.options.authorization.name,
      '${auth_uuid}': this.options.authorization.uuid,
      '${user_properties}': this.options.authorization.user_properties,
      '${user_type}': 'mojang',
      '${version_name}': this.options.version.number,
      '${assets_index_name}': this.version.assetIndex.id,
      '${game_directory}': this.options.overrides.gameDirectory || this.options.root,
      '${assets_root}': assetPath,
      '${game_assets}': assetPath,
      '${version_type}': this.options.version.type
    }

    for (let index = 0; index < args.length; index++) {
      if (typeof args[index] === 'object') args.splice(index, 2)
      if (Object.keys(fields).includes(args[index])) {
        args[index] = fields[args[index]]
      }
    }

    if (this.options.window) {
      this.options.window.fullscreen
        ? args.push('--fullscreen')
        : args.push('--width', this.options.window.width, '--height', this.options.window.height)
    }
    if (this.options.server) args.push('--server', this.options.server.host, '--port', this.options.server.port || '25565')
    if (this.options.proxy) {
      args.push(
        '--proxyHost',
        this.options.proxy.host,
        '--proxyPort',
        this.options.proxy.port || '8080',
        '--proxyUser',
        this.options.proxy.username,
        '--proxyPass',
        this.options.proxy.password
      )
    }
    if (this.options.customLaunchArgs) args = args.concat(this.options.customLaunchArgs)
    this.client.emit('debug', '[MCLC]: Set launch options')
    return args
  }

  async getJVM () {
    const opts = {
      windows: '-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
      osx: '-XstartOnFirstThread',
      linux: '-Xss1M'
    }
    return opts[this.getOS()]
  }

  isLegacy () {
    return this.version.assets === 'legacy' || this.version.assets === 'pre-1.6'
  }

  getOS () {
    if (this.options.os) {
      return this.options.os
    } else {
      switch (process.platform) {
        case 'win32': return 'windows'
        case 'darwin': return 'osx'
        default: return 'linux'
      }
    }
  }

  // To prevent launchers from breaking when they update. Will be reworked with rewrite.
  getMemory () {
    if (!this.options.memory) {
      this.client.emit('debug', '[MCLC]: Memory not set! Setting 1GB as MAX!')
      this.options.memory = {
        min: 512,
        max: 1023
      }
    }
    if (!isNaN(this.options.memory.max) && !isNaN(this.options.memory.min)) {
      if (this.options.memory.max < this.options.memory.min) {
        this.client.emit('debug', '[MCLC]: MIN memory is higher then MAX! Resetting!')
        this.options.memory.max = 1023
        this.options.memory.min = 512
      }
      return [`${this.options.memory.max}M`, `${this.options.memory.min}M`]
    } else { return [`${this.options.memory.max}`, `${this.options.memory.min}`] }
  }

  async extractPackage (options = this.options) {
    if (options.clientPackage.startsWith('http')) {
      await this.downloadAsync(options.clientPackage, options.root, 'clientPackage.zip', true, 'client-package')
      options.clientPackage = path.join(options.root, 'clientPackage.zip')
    }
    new Zip(options.clientPackage).extractAllTo(options.root, true)
    if (options.removePackage) fs.unlinkSync(options.clientPackage)

    return this.client.emit('package-extract', true)
  }
}

module.exports = Handler
