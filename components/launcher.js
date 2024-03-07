const child = require('child_process')
const path = require('path')
const Handler = require('./handler')
const fs = require('fs')
const EventEmitter = require('events').EventEmitter

class MCLCore extends EventEmitter {
  async launch (options) {
    try {
      this.options = { ...options }
      this.options.root = path.resolve(this.options.root)
      this.options.overrides = {
        detached: true,
        ...this.options.overrides,
        url: {
          meta: 'https://launchermeta.mojang.com',
          resource: 'https://resources.download.minecraft.net',
          mavenForge: 'https://files.minecraftforge.net/maven/',
          defaultRepoForge: 'https://libraries.minecraft.net/',
          fallbackMaven: 'https://search.maven.org/remotecontent?filepath=',
          ...this.options.overrides
            ? this.options.overrides.url
            : undefined
        },
        fw: {
          baseUrl: 'https://github.com/ZekerZhayard/ForgeWrapper/releases/download/',
          version: '1.6.0',
          sh1: '035a51fe6439792a61507630d89382f621da0f1f',
          size: 28679,
          ...this.options.overrides
            ? this.options.overrides.fw
            : undefined
        }
      }

      this.handler = new Handler(this)

      this.printVersion()

      const java = await this.handler.checkJava(this.options.javaPath || 'java')
      if (!java.run) {
        this.emit('debug', `[MCLC]: Couldn't start Minecraft due to: ${java.message}`)
        this.emit('close', 1)
        return null
      }

      this.createRootDirectory()
      this.createGameDirectory()

      await this.extractPackage()

      const directory = this.options.overrides.directory || path.join(this.options.root, 'versions', this.options.version.custom ? this.options.version.custom : this.options.version.number)
      this.options.directory = directory

      const versionFile = await this.handler.getVersion()
      const mcPath = this.options.overrides.minecraftJar || (this.options.version.custom
        ? path.join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.jar`)
        : path.join(directory, `${this.options.version.number}.jar`))
      this.options.mcPath = mcPath
      const nativePath = await this.handler.getNatives()

      if (!fs.existsSync(mcPath)) {
        this.emit('debug', '[MCLC]: Attempting to download Minecraft version jar')
        await this.handler.getJar()
      }

      const modifyJson = await this.getModifyJson()

      const args = []

      let jvm = [
        '-XX:-UseAdaptiveSizePolicy',
        '-XX:-OmitStackTraceInFastThrow',
        '-Dfml.ignorePatchDiscrepancies=true',
        '-Dfml.ignoreInvalidMinecraftCertificates=true',
        `-Djava.library.path=${nativePath}`,
        `-Xmx${this.handler.getMemory()[0]}`,
        `-Xms${this.handler.getMemory()[1]}`
      ]
      if (this.handler.getOS() === 'osx') {
        if (parseInt(versionFile.id.split('.')[1]) > 12) jvm.push(await this.handler.getJVM())
      } else jvm.push(await this.handler.getJVM())

      if (this.options.customArgs) jvm = jvm.concat(this.options.customArgs)
      if (this.options.overrides.logj4ConfigurationFile) {
        jvm.push(`-Dlog4j.configurationFile=${path.resolve(this.options.overrides.logj4ConfigurationFile)}`)
      }
      // https://help.minecraft.net/hc/en-us/articles/4416199399693-Security-Vulnerability-in-Minecraft-Java-Edition
      if (parseInt(versionFile.id.split('.')[1]) === 18 && !parseInt(versionFile.id.split('.')[2])) jvm.push('-Dlog4j2.formatMsgNoLookups=true')
      if (parseInt(versionFile.id.split('.')[1]) === 17) jvm.push('-Dlog4j2.formatMsgNoLookups=true')
      if (parseInt(versionFile.id.split('.')[1]) < 17) {
        if (!jvm.find(arg => arg.includes('Dlog4j.configurationFile'))) {
          const configPath = path.resolve(this.options.overrides.cwd || this.options.root)
          const intVersion = parseInt(versionFile.id.split('.')[1])
          if (intVersion >= 12) {
            await this.handler.downloadAsync('https://launcher.mojang.com/v1/objects/02937d122c86ce73319ef9975b58896fc1b491d1/log4j2_112-116.xml',
              configPath, 'log4j2_112-116.xml', true, 'log4j')
            jvm.push('-Dlog4j.configurationFile=log4j2_112-116.xml')
          } else if (intVersion >= 7) {
            await this.handler.downloadAsync('https://launcher.mojang.com/v1/objects/dd2b723346a8dcd48e7f4d245f6bf09e98db9696/log4j2_17-111.xml',
              configPath, 'log4j2_17-111.xml', true, 'log4j')
            jvm.push('-Dlog4j.configurationFile=log4j2_17-111.xml')
          }
        }
      }

      const classes = this.options.overrides.classes || this.handler.cleanUp(await this.handler.getClasses(modifyJson))
      const classPaths = ['-cp']
      const separator = this.handler.getOS() === 'windows' ? ';' : ':'
      this.emit('debug', `[MCLC]: Using ${separator} to separate class paths`)
      // Handling launch arguments.
      const file = modifyJson || versionFile
      // So mods like fabric work.
      const jar = fs.existsSync(mcPath)
        ? `${separator}${mcPath}`
        : `${separator}${path.join(directory, `${this.options.version.number}.jar`)}`
      classPaths.push(`${this.options.forge ? this.options.forge + separator : ''}${classes.join(separator)}${jar}`)
      classPaths.push(file.mainClass)

      this.emit('debug', '[MCLC]: Attempting to download assets')
      await this.handler.getAssets()

      // Forge -> Custom -> Vanilla
      const launchOptions = await this.handler.getLaunchOptions(modifyJson)

      const launchArguments = args.concat(jvm, classPaths, launchOptions)
      this.emit('arguments', launchArguments)
      this.emit('debug', `[MCLC]: Launching with arguments ${launchArguments.join(' ')}`)

      return this.startMinecraft(launchArguments)
    } catch (e) {
      this.emit('debug', `[MCLC]: Failed to start due to ${e}, closing...`)
      return null
    }
  }

  printVersion () {
    if (fs.existsSync(path.join(__dirname, '..', 'package.json'))) {
      const { version } = require('../package.json')
      this.emit('debug', `[MCLC]: MCLC version ${version}`)
    } else { this.emit('debug', '[MCLC]: Package JSON not found, skipping MCLC version check.') }
  }

  createRootDirectory () {
    if (!fs.existsSync(this.options.root)) {
      this.emit('debug', '[MCLC]: Attempting to create root folder')
      fs.mkdirSync(this.options.root)
    }
  }

  createGameDirectory () {
    if (this.options.overrides.gameDirectory) {
      this.options.overrides.gameDirectory = path.resolve(this.options.overrides.gameDirectory)
      if (!fs.existsSync(this.options.overrides.gameDirectory)) {
        fs.mkdirSync(this.options.overrides.gameDirectory, { recursive: true })
      }
    }
  }

  async extractPackage () {
    if (this.options.clientPackage) {
      this.emit('debug', `[MCLC]: Extracting client package to ${this.options.root}`)
      await this.handler.extractPackage()
    }
  }

  async getModifyJson () {
    let modifyJson = null

    if (this.options.forge) {
      this.options.forge = path.resolve(this.options.forge)
      this.emit('debug', '[MCLC]: Detected Forge in options, getting dependencies')
      modifyJson = await this.handler.getForgedWrapped()
    } else if (this.options.version.custom) {
      this.emit('debug', '[MCLC]: Detected custom in options, setting custom version file')
      modifyJson = modifyJson || JSON.parse(fs.readFileSync(path.join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.json`), { encoding: 'utf8' }))
    }

    return modifyJson
  }

  startMinecraft (launchArguments) {
    const minecraft = child.spawn(this.options.javaPath ? this.options.javaPath : 'java', launchArguments,
      { cwd: this.options.overrides.cwd || this.options.root, detached: this.options.overrides.detached })
    minecraft.stdout.on('data', (data) => this.emit('data', data.toString('utf-8')))
    minecraft.stderr.on('data', (data) => this.emit('data', data.toString('utf-8')))
    minecraft.on('close', (code) => this.emit('close', code))
    return minecraft
  }
}

module.exports = MCLCore
