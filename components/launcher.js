const child = require('child_process')
const path = require('path')
const Handler = require('./handler')
const fs = require('fs')
const EventEmitter = require('events').EventEmitter

class MCLCore extends EventEmitter {
  async launch (options) {
    this.options = { ...options }
    this.options.root = path.resolve(this.options.root)
    this.options.overrides = {
      detached: true,
      ...this.options.overrides,
      url: {
        meta: 'https://launchermeta.mojang.com',
        resource: 'https://resources.download.minecraft.net',
        mavenForge: 'http://files.minecraftforge.net/maven/',
        defaultRepoForge: 'https://libraries.minecraft.net/',
        fallbackMaven: 'https://search.maven.org/remotecontent?filepath=',
        ...this.options.overrides
          ? this.options.overrides.url
          : undefined
      }
    }
    this.options.fw = {
      baseUrl: 'https://github.com/ZekerZhayard/ForgeWrapper/releases/download/',
      version: '1.4.2',
      sh1: '79ff9c1530e8743450c5c3ebc6e07b535437aa6e',
      size: 22346
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

    if (this.options.installer) {
      // So installers that create a profile in launcher_profiles.json can run without breaking.
      const profilePath = path.join(this.options.root, 'launcher_profiles.json')
      if (!fs.existsSync(profilePath)) { fs.writeFileSync(profilePath, JSON.stringify({}, null, 4)) }
      await this.handler.runInstaller(this.options.installer)
    }

    const directory = this.options.overrides.directory || path.join(this.options.root, 'versions', this.options.version.number)
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
