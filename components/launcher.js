const child = require('child_process');
const path = require('path');
const handler = require('./handler');
const packager = require('./package');
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class MCLCore extends EventEmitter {
    constructor() {
        super();
    }

    async launch(options) {
        this.options = options;
        this.options.root = path.resolve(this.options.root);
        if(!this.options.overrides) this.options.overrides = {};
        this.options.overrides = {
            minecraftJar: this.options.overrides.minecraftJar ? path.join(this.options.root, this.options.overrides.minecraftJar): null,
            versionJson: this.options.overrides.versionJson ? path.join(this.options.root, this.options.overrides.versionJson): null,
            directory: this.options.overrides.directory ? path.join(this.options.root, this.options.overrides.directory): null,
            libraries: this.options.overrides.libraries ? path.join(this.options.root, this.options.overrides.libraries): null,
            natives: this.options.overrides.natives ? path.join(this.options.root, this.options.overrides.natives): null,
            assetRoot: this.options.overrides.assetRoot ? path.join(this.options.root, this.options.overrides.assetRoot): null,
        };
        this.handler = new handler(this);
        const override = this.options.overrides;

        if(!fs.existsSync(this.options.root)) {
            this.emit('debug', '[MCLC]: Attempting to create root folder');
            fs.mkdirSync(this.options.root);
        }

        if(this.options.clientPackage) {
            this.emit('debug', `[MCLC]: Extracting client package to ${this.options.root}`);
            await packager.extractPackage(this.options.root, this.options.clientPackage);
        }

        if(this.options.installer) {
            // So the forge installer can run without breaking :)
            fs.writeFileSync(path.join(this.options.root, 'launcher_profiles.json'), JSON.stringify({}, null, 4));
            await this.handler.runInstaller(this.options.installer)
        }

        const directory = override.directory || path.join(this.options.root, 'versions', this.options.version.number);
        this.options.directory = directory;

        // Version JSON for the main launcher folder
        const versionFile = await this.handler.getVersion();
        const mcPath = override.minecraftJar || (this.options.version.custom ? path.join(this.options.root, 'versions', this.options.version.custom , `${this.options.version.custom}.jar`):
            path.join(directory, `${this.options.version.number}.jar`));
        const nativePath = await this.handler.getNatives();

        if (!fs.existsSync(mcPath)) {
            this.emit('debug', '[MCLC]: Attempting to download Minecraft version jar');
            await this.handler.getJar();
        }

        let forge = null;
        let custom = null;
        if(this.options.forge) {
            this.emit('debug', '[MCLC]: Detected Forge in options, getting dependencies');
            forge = await this.handler.getForgeDependenciesLegacy();
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

        const classes = await handler.cleanUp(await this.handler.getClasses());
        let classPaths = ['-cp'];
        const separator = this.handler.getOS() === "windows" ? ";" : ":";
        this.emit('debug', `[MCLC]: Using ${separator} to separate class paths`);
        if(forge) {
            this.emit('debug', '[MCLC]: Setting Forge class paths');
            classPaths.push(`${path.resolve(this.options.forge)}${separator}${forge.paths.join(separator)}${separator}${classes.join(separator)}${separator}${mcPath}`);
            classPaths.push(forge.forge.mainClass)
        } else {
            const file = custom || versionFile;
            const jar = fs.existsSync(mcPath) ? `${mcPath}${separator}` : '';
            classPaths.push(`${jar}${classes.join(separator)}`);
            classPaths.push(file.mainClass);
        }

        // Download version's assets
        this.emit('debug', '[MCLC]: Attempting to download assets');
        await this.handler.getAssets();

        // Launch options. Thank you Lyrus for the reformat <3
        const modification = forge ? forge.forge : null || custom ? custom : null;
        const launchOptions = await this.handler.getLaunchOptions(modification);

        const launchArguments = args.concat(jvm, classPaths, launchOptions);
        this.emit('arguments', launchArguments);
        this.emit('debug', launchArguments.join(' '));

        const minecraft = child.spawn(this.options.javaPath ? this.options.javaPath : 'java', launchArguments);
        minecraft.stdout.on('data', (data) => this.emit('data', data));
        minecraft.stderr.on('data', (data) => this.emit('error', data));
        minecraft.on('close', (code) => this.emit('close', code));

        return minecraft;
    }
}

module.exports = MCLCore;
