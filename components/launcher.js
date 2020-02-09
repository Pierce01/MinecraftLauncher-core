const child = require('child_process');
const path = require('path');
const handler = require('./handler');
const fs = require('fs');
const EventEmitter = require('events').EventEmitter;

class MCLCore extends EventEmitter {
    constructor() {
        super();
    }

    async launch(options) {
        this.options = options;
        this.options.root = path.resolve(this.options.root);

        // Simplified overrides so launcher devs can set the paths to what ever they want. see docs for variable names.
        if(!this.options.overrides) this.options.overrides = { url: {} };
        if(!this.options.overrides.url) this.options.overrides.url = {};
        this.options.overrides.url = {
            meta: this.options.overrides.url.meta || "https://launchermeta.mojang.com",
            resource: this.options.overrides.url.resource || "https://resources.download.minecraft.net",
            mavenForge: this.options.overrides.url.mavenForge || "http://files.minecraftforge.net/maven/",
            defaultRepoForge: this.options.overrides.url.defaultRepoForge || "https://libraries.minecraft.net/",
            fallbackMaven: this.options.overrides.url.fallbackMaven || "https://search.maven.org/remotecontent?filepath="
        };
        this.handler = new handler(this);
        // Lets the events register. our magic switch!
        await void(0);

        this.emit('debug', `[MCLC]: MCLC version ${JSON.parse(fs.readFileSync(path.join(__dirname,'..', 'package.json'), { encoding: 'utf8' })).version}`);
        const java = await this.handler.checkJava(this.options.javaPath || 'java');
        if(!java.run) {
            this.emit('debug', `[MCLC]: Couldn't start Minecraft due to: ${java.message}`);
            this.emit('close', 1);
            return null;
        }

        if(!fs.existsSync(this.options.root)) {
            this.emit('debug', '[MCLC]: Attempting to create root folder');
            fs.mkdirSync(this.options.root);
        }

        if(this.options.clientPackage) {
            this.emit('debug', `[MCLC]: Extracting client package to ${this.options.root}`);
            await this.handler.extractPackage();
        }

        if(this.options.installer) {
            // So the forge installer can run without breaking :)
            const profilePath = path.join(this.options.root, 'launcher_profiles.json');
            if(!fs.existsSync(profilePath))
                fs.writeFileSync(profilePath, JSON.stringify({}, null, 4));
            await this.handler.runInstaller(this.options.installer)
        }

        const directory = this.options.overrides.directory || path.join(this.options.root, 'versions', this.options.version.number);
        this.options.directory = directory;

        // Version JSON for the main launcher folder
        const versionFile = await this.handler.getVersion();
        const mcPath = this.options.overrides.minecraftJar || (this.options.version.custom ? path.join(this.options.root, 'versions', this.options.version.custom , `${this.options.version.custom}.jar`):
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
            custom = JSON.parse(fs.readFileSync(path.join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.json`), { encoding: 'utf8' }));
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
        if(this.handler.getOS() === 'osx') {
            if(parseInt(versionFile.id.split('.')[1]) > 12) jvm.push(await this.handler.getJVM());
        } else jvm.push(await this.handler.getJVM());

        if(this.options.customArgs) jvm = jvm.concat(this.options.customArgs);

        const classes = this.options.overrides.classes || await handler.cleanUp(await this.handler.getClasses());
        let classPaths = ['-cp'];
        const separator = this.handler.getOS() === "windows" ? ";" : ":";
        this.emit('debug', `[MCLC]: Using ${separator} to separate class paths`);
        if(forge) {
            this.emit('debug', '[MCLC]: Setting Forge class paths');
            classPaths.push(`${path.resolve(this.options.forge)}${separator}${forge.paths.join(separator)}${separator}${classes.join(separator)}${separator}${mcPath}`);
            classPaths.push(forge.forge.mainClass)
        } else {
            const file = custom || versionFile;
            // So mods like fabric work.
            const jar = fs.existsSync(mcPath) ? `${separator}${mcPath}` : `${separator}${path.join(directory, `${this.options.version.number}.jar`)}`;
            classPaths.push(`${classes.join(separator)}${jar}`);
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

        const minecraft = child.spawn(this.options.javaPath ? this.options.javaPath : 'java', launchArguments,
            {cwd: this.options.overrides.cwd || this.options.root});
        minecraft.stdout.on('data', (data) => this.emit('data', data.toString('utf-8')));
        minecraft.stderr.on('data', (data) => this.emit('data', data.toString('utf-8')));
        minecraft.on('close', (code) => this.emit('close', code));

        return minecraft;
    }
}

module.exports = MCLCore;
