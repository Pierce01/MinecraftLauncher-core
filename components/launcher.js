const child = require('child_process');
const event = require('./events');
const path = require('path');
const handler = require('./handler');
const packager = require('./package');
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class MCLCore extends EventEmitter {
    constructor(options) {
        super();

        this.options = options;
        this.handler = new handler(this);
    }

    async launch() {
        this.options.root = path.resolve(this.options.root);
        if(!fs.existsSync(this.options.root)) {
            this.emit('debug', '[MCLC]: Attempting to create root folder');
            fs.mkdirSync(this.options.root);
        }

        if(this.options.clientPackage) {
            this.emit('debug', `[MCLC]: Extracting client package to ${this.options.root}`);
            await packager.extractPackage(this.options.root, this.options.clientPackage);
        }

        const directory = path.join(this.options.root, 'versions', this.options.version.number);
        this.options.directory = directory;

        // Version JSON for the main launcher folder
        const versionFile = await this.handler.getVersion();
        const mcPath = this.options.version.custom ? path.join(this.options.root, 'versions', this.options.version.custom , `${this.options.version.custom}.jar`):
            path.join(directory, `${this.options.version.number}.jar`);
        const nativePath = await this.handler.getNatives();

        if (!fs.existsSync(mcPath)) {
            this.emit('debug', '[MCLC]: Attempting to download Minecraft version jar');
            await this.handler.getJar();
        }

        let forge = null;
        let custom = null;
        if(this.options.forge) {
            this.emit('debug', '[MCLC]: Detected Forge in options, getting dependencies');
            forge = await this.handler.getForgeDependencies();
        }
        if(this.options.version.custom) {
            this.emit('debug', '[MCLC]: Detected custom in options, setting custom version file');
            custom = require(path.join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.json`));
        }

        const args = [];

        // Jvm
        let jvm = [
            '-XX:-UseAdaptiveSizePolicy',
            '-XX:-OmitStackTraceInFastThrow',
            '-Dfml.ignorePatchDiscrepancies=true',
            '-Dfml.ignoreInvalidMinecraftCertificates=true',
            `-Djava.library.path=${nativePath}`,
            `-Xmx${this.options.memory.max}M`,
            `-Xms${this.options.memory.min}M`
        ];
        jvm.push(await this.handler.getJVM());
        if(this.options.customArgs) jvm = jvm.concat(this.options.customArgs);

        const classes = await this.handler.getClasses();
        let classPaths = ['-cp'];
        const separator = this.options.os === "windows" ? ";" : ":";
        this.emit('debug', `[MCLC]: Using ${separator} to separate class paths`);
        if(forge) {
            this.emit('debug', '[MCLC]: Setting Forge class paths');
            classPaths.push(`${this.options.forge.path || this.options.forge}${separator}${forge.paths.join(separator)}${separator}${classes.join(separator)}${separator}${mcPath}`);
            classPaths.push(forge.forge.mainClass)
        } else {
            const file = custom || versionFile;
            classPaths.push(`${mcPath}${separator}${classes.join(separator)}`);
            classPaths.push(file.mainClass);
        }
        classPaths = await handler.cleanUp(classPaths);

        // Download version's assets
        this.emit('debug', '[MCLC]: Attempting to download assets');
        await this.handler.getAssets();

        // Launch options. Thank you Lyrus for the reformat <3
        const modification = forge ? forge.forge : null || custom ? custom : null;
        const launchOptions = await this.handler.getLaunchOptions(modification);

        const launchArguments = args.concat(jvm, classPaths, launchOptions);
        event.emit('arguments', launchArguments);
        event.emit('debug', launchArguments.join(' '));

        const minecraft = child.spawn(this.options.javaPath ? this.options.javaPath : 'java', launchArguments);
        minecraft.stdout.on('data', (data) => this.emit('data', data));
        minecraft.stderr.on('data', (data) => this.emit('error', data));
        minecraft.on('close', (code) => this.emit('close', code));
    }
}

module.exports = MCLCore;