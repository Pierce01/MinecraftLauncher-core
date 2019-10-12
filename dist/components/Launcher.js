"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const path_1 = require("path");
const Handler_1 = require("./Handler");
const Constants_1 = require("./Constants");
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const { version } = require('../../package.json');
/**
 * MinecraftLauncher client
 * @extends {EventEmitter}
 * @property {LauncherOptions} options
 * @property {handler} handler
 */
class Client extends events_1.EventEmitter {
    /**
     * Launches Minecraft
     * @param {LauncherOptions} options Options to start the game with
     * @returns {Promise<ChildProcessWithoutNullStreams | null>}
     */
    // eslint-disable-next-line complexity
    launch(options) {
        return __awaiter(this, void 0, void 0, function* () {
            this.options = options;
            this.options.root = path_1.resolve(this.options.root);
            if (!this.options.overrides)
                this.options.overrides = { url: {} };
            if (!this.options.overrides.url)
                this.options.overrides.url = {};
            this.options.overrides.url = {
                meta: this.options.overrides.url.meta || 'https://launchermeta.mojang.com',
                resource: this.options.overrides.url.resource || 'https://resources.download.minecraft.net',
                mavenForge: this.options.overrides.url.mavenForge || 'http://files.minecraftforge.net/maven/',
                defaultRepoForge: this.options.overrides.url.defaultRepoForge || 'https://libraries.minecraft.net/',
            };
            this.handler = new Handler_1.Handler(this);
            yield (() => null)();
            this.emit(Constants_1.Events.DEBUG, `[MCLC]: MCLC version ${version}`);
            const java = yield this.handler.checkJava(this.options.javaPath || 'java');
            if (!java.run) {
                this.emit(Constants_1.Events.DEBUG, `[MCLC: Couldn't start Minecraft due to ${java.message}`);
                this.emit(Constants_1.Events.CLOSE, 1);
                return null;
            }
            if (!fs_1.existsSync(this.options.root)) {
                this.emit(Constants_1.Events.DEBUG, `[MCLC]: Attempting to create root folder at ${this.options.root}`);
                fs_1.mkdirSync(this.options.root);
            }
            if (this.options.cleanPackage) {
                this.emit(Constants_1.Events.DEBUG, `[MCLC]: Extracting client package to ${this.options.root}`);
                yield this.handler.extractPackage();
            }
            if (this.options.installer) {
                // So the forge installer can run without breaking :)
                const profilePath = path_1.join(this.options.root, 'launcher_profiles.json');
                if (!fs_1.existsSync(profilePath))
                    fs_1.writeFileSync(profilePath, JSON.stringify({}, null, 4));
                yield this.handler.runInstaller(this.options.installer);
            }
            const directory = this.options.overrides.directory || path_1.join(this.options.root, 'versions', this.options.version.number);
            this.options.directory = directory;
            // Version JSON for the main launcher folder
            const versionFile = yield this.handler.getVersion();
            const mcPath = this.options.overrides.minecraftJar || (this.options.version.custom ?
                path_1.join(this.options.version.custom, `${this.options.version.custom}.jar`) :
                path_1.join(directory, `${this.options.version.number}.jar`));
            const nativePath = yield this.handler.getNatives();
            if (!fs_1.existsSync(mcPath)) {
                this.emit(Constants_1.Events.DEBUG, '[MCLC]: Attempting to download Minecraft version jar');
                yield this.handler.getJar();
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let forge = null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let custom = null;
            if (this.options.forge) {
                this.emit(Constants_1.Events.DEBUG, '[MCLC]: Detected Forge in options, getting dependencies');
                forge = yield this.handler.getForgeDependenciesLegacy();
            }
            if (this.options.version.custom) {
                this.emit(Constants_1.Events.DEBUG, '[MCLC]: Detected custom in options, setting custom version file');
                custom = require(path_1.join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.json`));
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const args = [];
            // JVM
            let jvm = [
                '-XX:-UseAdaptiveSizePolicy',
                '-XX:-OmitStackTraceInFastThrow',
                '-Dfml.ignorePatchDiscrepancies=true',
                '-Dfml.ignoreInvalidMinecraftCertificates=true',
                `-Djava.library.path=${nativePath}`,
                `-Xmx${this.options.memory.max}M`,
                `-Xms${this.options.memory.min}M`,
            ];
            if (this.handler.getOS() === 'osx') {
                if (parseInt(versionFile.id.split('.')[1]) > 12)
                    jvm.push(yield this.handler.getJVM());
            }
            else {
                jvm.push(yield this.handler.getJVM());
            }
            if (this.options.customArgs)
                jvm = jvm.concat(this.options.customArgs);
            const classes = this.options.overrides.classes || (yield Handler_1.Handler.cleanUp(yield this.handler.getClasses()));
            const classPaths = ['-cp'];
            const separator = this.handler.getOS() === 'windows' ? ';' : ':';
            this.emit(Constants_1.Events.DEBUG, `[MCLC]: Using ${separator} to separate class paths`);
            if (this.options.forge && forge) {
                this.emit(Constants_1.Events.DEBUG, '[MCLC]: Setting Forge class paths');
                classPaths.push(`${path_1.resolve(this.options.forge)}${separator}${forge.paths.join(separator)}${separator}${classes.join(separator)}${separator}${mcPath}`);
                classPaths.push(forge.forge.mainClass);
            }
            else {
                const file = custom || versionFile;
                const jar = fs_1.existsSync(mcPath) ? `${mcPath}${separator}` : '';
                classPaths.push(`${jar}${classes.join(separator)}`);
                classPaths.push(file.mainClass);
            }
            // Download version's assets
            this.emit(Constants_1.Events.DEBUG, '[MCLC]: Attempting to download assets');
            yield this.handler.getAssets();
            // Launch options. Thank you Lyrus for the reformat <3
            const modification = forge ? forge.forge : null || custom ? custom : null;
            const launchOptions = yield this.handler.getLaunchOptions(modification);
            const launchArguments = args.concat(jvm, classPaths, launchOptions);
            this.emit('arguments', launchArguments);
            this.emit('debug', launchArguments.join(' '));
            const minecraft = child_process_1.spawn(this.options.javaPath ? this.options.javaPath : 'java', launchArguments, {
                cwd: this.options.overrides.cwd || this.options.root,
            });
            minecraft.stdout.on('data', data => this.emit(Constants_1.Events.DATA, data.toString('utf-8')));
            minecraft.stderr.on('data', data => this.emit(Constants_1.Events.DATA, data.toString('utf-8')));
            minecraft.on('close', code => this.emit(Constants_1.Events.CLOSE, code));
            return minecraft;
        });
    }
}
exports.Client = Client;
