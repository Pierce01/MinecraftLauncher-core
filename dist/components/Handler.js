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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = __importDefault(require("request"));
const child_process_1 = require("child_process");
const shelljs_1 = require("shelljs");
const fs_1 = require("fs");
const path_1 = require("path");
const checksum_1 = __importDefault(require("checksum"));
const adm_zip_1 = __importDefault(require("adm-zip"));
const Constants_1 = require("./Constants");
let counter = 0;
/**
 * Internal function handler
 */
class Handler {
    constructor(client) {
        this.client = client;
        this.options = client.options;
        this.version = undefined;
        this.baseRequest = request_1.default.defaults({
            // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
            // @ts-ignore
            pool: { maxSockets: this.options.overrides.maxSockets || 2 },
            timeout: this.options.timeout || 10000,
        });
    }
    /**
     * Checks if Java is valid
     * @param {string} java Path to Java executable
     * @returns {Promise<{run: boolean, message: ExecException?}>}
     */
    checkJava(java) {
        return new Promise(resolve => {
            child_process_1.exec(`${java} -version`, (error, _, stderr) => {
                if (error) {
                    resolve({
                        run: false,
                        message: error,
                    });
                }
                this.client.emit('debug', `[MCLC]: Using Java version ${(stderr.match(/"(.*?)"/) || []).pop()} ${stderr.includes('64-Bit') ? '64-bit' : '32-Bit'}`);
                resolve({
                    run: true,
                });
            });
        });
    }
    /**
     * Downloads a file
     * @param {string} url URL
     * @param {string} directory Output directory
     * @param {string} name File name
     * @param {boolean} retry whether to retry or not
     * @param {*} type /shrug
     * @returns {Promise<void | {failed: boolean, asset: *}>}
     */
    downloadAsync(url, directory, name, retry, type) {
        return new Promise(resolve => {
            shelljs_1.mkdir('-p', directory);
            const _request = this.baseRequest(url);
            let receivedBytes = 0;
            let totalBytes = 0;
            _request.on('response', data => {
                totalBytes = parseInt(data.headers['content-length']);
            });
            _request.on('error', (error) => __awaiter(this, void 0, void 0, function* () {
                this.client.emit('debug', `[MCLC]: Failed to download asset to ${path_1.join(directory, name)} due to\n${error}. Retrying... ${retry}`);
                if (retry)
                    yield this.downloadAsync(url, directory, name, false, type);
                resolve();
            }));
            _request.on('data', data => {
                receivedBytes += data.length;
                this.client.emit('download-status', {
                    name: name,
                    type: type,
                    current: receivedBytes,
                    total: totalBytes,
                });
            });
            const file = fs_1.createWriteStream(path_1.join(directory, name));
            _request.pipe(file);
            file.once('finish', () => {
                this.client.emit('download', name);
                resolve({
                    failed: false,
                    asset: null,
                });
            });
            file.on('error', (e) => __awaiter(this, void 0, void 0, function* () {
                this.client.emit('debug', `[MCLC]: Failed to download asset to ${path_1.join(directory, name)} due to\n${e}. Retrying... ${retry}`);
                if (fs_1.existsSync(path_1.join(directory, name)))
                    shelljs_1.rm(path_1.join(directory, name));
                if (retry)
                    yield this.downloadAsync(url, directory, name, false, type);
                resolve();
            }));
        });
    }
    /**
     * Checks if a file's hash is the same as the one provided
     * @param {string} hash Hash
     * @param {string} file File to check the hash against
     * @returns {Promise<boolean>}
     */
    checkSum(hash, file) {
        return new Promise(resolve => {
            checksum_1.default.file(file, (_, sum) => resolve(hash === sum));
        });
    }
    /**
     * Gets the version of Minecraft specified in the options
     * @returns {Promise<Object>}
     */
    getVersion() {
        return new Promise(resolve => {
            const overrides = this.options.overrides;
            const versionJsonPath = overrides.versionJson || path_1.join(this.options.directory, `${this.options.version.number}.json`);
            if (fs_1.existsSync(versionJsonPath)) {
                this.version = require(versionJsonPath);
                resolve(this.version);
                return;
            }
            const manifest = `${overrides.url.meta}/mc/game/version_manifest.json`;
            request_1.default.get(manifest, (error, _, body) => {
                if (error)
                    resolve(error);
                const parsed = JSON.parse(body);
                for (const desiredVersion in parsed.versions) {
                    if (parsed.versions[desiredVersion].id === this.options.version.number) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        request_1.default.get(parsed.versions[desiredVersion].url, (_error, __, _body) => {
                            if (_error)
                                resolve(_error);
                            this.client.emit('debug', `[MCLC]: Parsed version from version manifest`);
                            this.version = JSON.parse(_body);
                            resolve(this.version);
                        });
                    }
                }
            });
        });
    }
    /**
     * Gets the jar for the specified version
     * @returns {Promise<void>}
     */
    getJar() {
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            yield this.downloadAsync(this.version.downloads.client.url, this.options.directory, `${this.options.version.number}.jar`, true, 'version-jar');
            fs_1.writeFileSync(path_1.join(this.options.directory, `${this.options.version.number}.json`), JSON.stringify(this.version, null, 4));
            this.client.emit('debug', '[MCLC]: Downloaded version jar and wrote version json');
            resolve();
        }));
    }
    /**
     * Fetches the assets for the version of Minecraft specified in options
     * @returns {Promise<void>}
     */
    getAssets() {
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            if (!fs_1.existsSync(path_1.join(this.options.root, 'assets', 'indexes', `${this.version.assetIndex.id}.json`))) {
                yield this.downloadAsync(this.version.assetIndex.url, path_1.join(this.options.root, 'assets', 'indexes'), `${this.version.assetIndex.id}.json`, true, 'asset-json');
            }
            const index = require(path_1.join(this.options.root, 'assets', 'indexes', `${this.version.assetIndex.id}.json`));
            this.client.emit('progress', {
                type: 'assets',
                task: 0,
                total: Object.keys(index.objects).length,
            });
            yield Promise.all(Object.keys(index.objects).map((asset) => __awaiter(this, void 0, void 0, function* () {
                const hash = index.objects[asset].hash;
                const subhash = hash.substring(0, 2);
                const assetDirectory = this.options.overrides.assetRoot || path_1.join(this.options.root, 'assets');
                const subAsset = path_1.join(assetDirectory, 'objects', subhash);
                if (!fs_1.existsSync(path_1.join(subAsset, hash)) || !(yield this.checkSum(hash, path_1.join(subAsset, hash)))) {
                    yield this.downloadAsync(`${this.options.overrides.url.resource}/${subhash}/${hash}`, subAsset, hash, true, 'assets');
                    counter += 1;
                    this.client.emit('progress', {
                        type: 'assets',
                        task: counter,
                        total: Object.keys(index.objects).length,
                    });
                }
            })));
            counter = 0;
            // Copy assets to legacy if it's an older Minecraft version.
            if (this.version.assets === 'legacy' || this.version.assets === 'pre-1.6') {
                const assetDirectory = this.options.overrides.assetRoot || path_1.join(this.options.root, 'assets');
                this.client.emit('debug', `[MCLC]: Copying assets over to ${path_1.join(assetDirectory, 'legacy')}`);
                this.client.emit('progress', {
                    type: 'assets-copy',
                    task: 0,
                    total: Object.keys(index.objects).length,
                });
                yield Promise.all(Object.keys(index.objects).map((asset) => __awaiter(this, void 0, void 0, function* () {
                    const hash = index.objects[asset].hash;
                    const subhash = hash.substring(0, 2);
                    const subAsset = path_1.join(assetDirectory, 'objects', subhash);
                    const legacyAsset = asset.split('/');
                    legacyAsset.pop();
                    if (!fs_1.existsSync(path_1.join(assetDirectory, 'legacy', legacyAsset.join('/')))) {
                        shelljs_1.mkdir('-p', path_1.join(assetDirectory, 'legacy', legacyAsset.join('/')));
                    }
                    if (!fs_1.existsSync(path_1.join(assetDirectory, 'legacy', asset))) {
                        fs_1.copyFileSync(path_1.join(subAsset, hash), path_1.join(assetDirectory, 'legacy', asset));
                    }
                    counter += 1;
                    this.client.emit('progress', {
                        type: 'assets-copy',
                        task: counter,
                        total: Object.keys(index.objects).length,
                    });
                })));
            }
            counter = 0;
            this.client.emit('debug', '[MCLC]: Downloaded assets');
            resolve();
        }));
    }
    /**
     * Major Yikes
     * @param {*} lib yikes
     * @returns {Boolean}
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseRule(lib) {
        if (lib.rules) {
            if (lib.rules.length > 1) {
                if (lib.rules[0].action === 'allow' && lib.rules[1].action === 'disallow' && lib.rules[1].os.name === 'osx') {
                    return this.getOS() === 'osx';
                }
                else {
                    return true;
                }
            }
            else if (lib.rules[0].action === 'allow' && lib.rules[0].os) {
                return this.getOS() !== 'osx';
            }
        }
        else {
            return false;
        }
        return false;
    }
    /**
     * Yikes
     * @returns {Promise<string>}
     */
    getNatives() {
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            const nativeDirectory = this.options.overrides.natives || path_1.join(this.options.root, 'natives', this.version.id);
            if (!fs_1.existsSync(nativeDirectory) || !fs_1.readdirSync(nativeDirectory).length) {
                shelljs_1.mkdir('-p', nativeDirectory);
                const natives = () => new Promise((_resolve) => __awaiter(this, void 0, void 0, function* () {
                    const _natives = [];
                    yield Promise.all(this.version.libraries.map((lib) => __awaiter(this, void 0, void 0, function* () {
                        if (!lib.downloads.classifiers)
                            return;
                        if (this.parseRule(lib))
                            return;
                        const native = this.getOS() === 'osx' ?
                            lib.downloads.classifiers['natives-osx'] || lib.downloads.classifiers['natives-macos'] :
                            lib.downloads.classifiers[`natives-${this.getOS()}`];
                        _natives.push(native);
                    })));
                    _resolve(_natives);
                }));
                const stat = yield natives();
                this.client.emit('progress', {
                    type: 'natives',
                    task: 0,
                    total: stat.length,
                });
                yield Promise.all(stat.map((native) => __awaiter(this, void 0, void 0, function* () {
                    const name = native.path.split('/').pop();
                    yield this.downloadAsync(native.url, nativeDirectory, name, true, 'natives');
                    if (!(yield this.checkSum(native.sha1, path_1.join(nativeDirectory, name)))) {
                        yield this.downloadAsync(native.url, nativeDirectory, name, true, 'natives');
                    }
                    try {
                        new adm_zip_1.default(path_1.join(nativeDirectory, name)).extractAllTo(nativeDirectory, true);
                    }
                    catch (e) {
                        // Only doing a console.warn since a stupid error happens. You can basically ignore this.
                        // if it says Invalid file name, just means two files were downloaded and both were deleted.
                        // All is well.
                        console.warn(e);
                    }
                    shelljs_1.rm(path_1.join(nativeDirectory, name));
                    counter += 1;
                    this.client.emit('progress', {
                        type: 'natives',
                        task: counter,
                        total: stat.length,
                    });
                })));
                this.client.emit('debug', '[MCLC]: Downloaded and extracted natives');
            }
            counter = 0;
            this.client.emit('debug', `[MCLC]: Set native path to ${nativeDirectory}`);
            resolve(nativeDirectory);
        }));
    }
    /**
     * Fetches forge dependencies
     * @returns {Promise<{paths: *[], forge: *} | null>}
     */
    getForgeDependenciesLegacy() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!fs_1.existsSync(path_1.join(this.options.root, 'forge'))) {
                shelljs_1.mkdir('-p', path_1.join(this.options.root, 'forge'));
            }
            try {
                yield new adm_zip_1.default(this.options.forge).extractEntryTo('version.json', path_1.join(this.options.root, 'forge', `${this.version.id}`), false, true);
            }
            catch (e) {
                this.client.emit('debug', `[MCLC]: Unable to extract version.json from the forge jar due to ${e}`);
                return null;
            }
            const forge = require(path_1.join(this.options.root, 'forge', `${this.version.id}`, 'version.json'));
            const paths = [];
            this.client.emit('progress', {
                type: 'forge',
                task: 0,
                total: forge.libraries.length,
            });
            yield Promise.all(forge.libraries.map((library) => __awaiter(this, void 0, void 0, function* () {
                const lib = library.name.split(':');
                if (lib[0] === 'net.minecraftforge' && lib[1].includes('forge'))
                    return;
                let url = this.options.overrides.url.mavenForge;
                const jarPath = path_1.join(this.options.root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
                const name = `${lib[1]}-${lib[2]}.jar`;
                if (!library.url) {
                    if (library.serverreq || library.clientreq) {
                        url = this.options.overrides.url.defaultRepoForge;
                    }
                    else {
                        return;
                    }
                }
                const downloadLink = `${url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${lib[1]}-${lib[2]}.jar`;
                if (fs_1.existsSync(path_1.join(jarPath, name))) {
                    paths.push(`${jarPath}${path_1.sep}${name}`);
                    counter += 1;
                    this.client.emit('progress', { type: 'forge', task: counter, total: forge.libraries.length });
                    return;
                }
                if (!fs_1.existsSync(jarPath))
                    shelljs_1.mkdir('-p', jarPath);
                yield this.downloadAsync(downloadLink, jarPath, name, true, 'forge');
                paths.push(`${jarPath}${path_1.sep}${name}`);
                counter += 1;
                this.client.emit('progress', {
                    type: 'forge',
                    task: counter,
                    total: forge.libraries.length,
                });
            })));
            counter = 0;
            this.client.emit('debug', '[MCLC]: Downloaded Forge dependencies');
            return { paths, forge };
        });
    }
    /**
     * Runs the forge installer?
     * @param {string} path Path to the installer?
     * @returns {Promise<void>}
     */
    runInstaller(path) {
        return new Promise(resolve => {
            const installer = child_process_1.exec(path);
            installer.on('close', () => resolve());
        });
    }
    /**
     * Gets classes?
     * @returns {Promise<Array<*>>}
     */
    getClasses() {
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            const libs = [];
            if (this.options.version.custom) {
                const customJarJson = require(path_1.join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.json`));
                this.client.emit(Constants_1.Events.PROGRESS, {
                    type: 'classes-custom',
                    task: 0,
                    total: customJarJson.libraries.length,
                });
                yield Promise.all(customJarJson.libraries.map((library) => __awaiter(this, void 0, void 0, function* () {
                    const lib = library.name.split(':');
                    const jarPath = path_1.join(this.options.root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
                    const name = `${lib[1]}-${lib[2]}.jar`;
                    if (!fs_1.existsSync(path_1.join(jarPath, name))) {
                        if (library.url) {
                            const url = `${library.url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${lib[1]}-${lib[2]}.jar`;
                            yield this.downloadAsync(url, jarPath, name, true, 'classes-custom');
                        }
                    }
                    counter += 1;
                    this.client.emit(Constants_1.Events.PROGRESS, {
                        type: 'classes-custom',
                        task: counter,
                        total: customJarJson.libraries.length,
                    });
                    libs.push(`${jarPath}${path_1.sep}${name}`);
                })));
                counter = 0;
            }
            const parsedClasses = () => new Promise((_resolve) => __awaiter(this, void 0, void 0, function* () {
                const classes = [];
                yield Promise.all(this.version.libraries.map((_lib) => __awaiter(this, void 0, void 0, function* () {
                    if (!_lib.downloads.artifact)
                        return;
                    if (this.parseRule(_lib))
                        return;
                    classes.push(_lib);
                })));
                _resolve(classes);
            }));
            const parsed = yield parsedClasses();
            this.client.emit(Constants_1.Events.PROGRESS, {
                type: 'classes',
                task: 0,
                total: parsed.length,
            });
            yield Promise.all(parsed.map((_lib) => __awaiter(this, void 0, void 0, function* () {
                const libraryPath = _lib.downloads.artifact.path;
                const libraryUrl = _lib.downloads.artifact.url;
                const libraryHash = _lib.downloads.artifact.sha1;
                const libraryDirectory = path_1.join(this.options.root, 'libraries', libraryPath);
                if (!fs_1.existsSync(libraryDirectory) || !(yield this.checkSum(libraryHash, libraryDirectory))) {
                    let directory = libraryDirectory.split(path_1.sep);
                    const name = directory.pop();
                    directory = directory.join(path_1.sep);
                    yield this.downloadAsync(libraryUrl, directory, name, true, 'classes');
                }
                counter += 1;
                this.client.emit(Constants_1.Events.PROGRESS, {
                    type: 'classes',
                    task: counter,
                    total: parsed.length,
                });
                libs.push(libraryDirectory);
            })));
            counter = 0;
            this.client.emit(Constants_1.Events.DEBUG, '[MCLC]: Collected class paths');
            resolve(libs);
        }));
    }
    static cleanUp(array) {
        return new Promise(resolve => {
            const newArray = [];
            for (const classPath in array) {
                if (newArray.includes(array[classPath]))
                    continue;
                newArray.push(array[classPath]);
            }
            resolve(newArray);
        });
    }
    getLaunchOptions(modification) {
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            const type = modification || this.version;
            let args = type.minecraftArguments ? type.minecraftArguments.split(' ') : type.arguments.game;
            const assetRoot = this.options.overrides.assetRoot || path_1.join(this.options.root, 'assets');
            const assetPath = this.version.assets === 'legacy' || this.version.assets === 'pre-1.6' ? path_1.join(assetRoot, 'legacy') : path_1.join(assetRoot);
            const minArgs = this.options.overrides.minArgs || 5;
            if (args.length < minArgs)
                args = args.concat(this.version.minecraftArguments ? this.version.minecraftArguments.split(' ') : this.version.arguments.game);
            this.options.authorization = yield Promise.resolve(this.options.authorization);
            const fields = {
                '${auth_access_token}': this.options.authorization.access_token,
                '${auth_session}': this.options.authorization.access_token,
                '${auth_player_name}': this.options.authorization.name,
                '${auth_uuid}': this.options.authorization.uuid,
                '${user_properties}': this.options.authorization.user_properties,
                '${user_type}': 'mojang',
                '${version_name}': this.options.version.number,
                '${assets_index_name}': this.version.assetIndex.id,
                '${game_directory}': this.options.root,
                '${assets_root}': assetPath,
                '${game_assets}': assetPath,
                '${version_type}': this.options.version.type,
            };
            for (let index = 0; index < args.length; index++) {
                if (typeof args[index] === 'object')
                    args.splice(index, 2);
                if (Object.keys(fields).includes(args[index])) {
                    args[index] = fields[args[index]];
                }
            }
            if (this.options.window)
                args.push('--width', this.options.window.width, '--height', this.options.window.height);
            if (this.options.server)
                args.push('--server', this.options.server.host, '--port', this.options.server.port || '25565');
            if (this.options.proxy) {
                args.push('--proxyHost', this.options.proxy.host, '--proxyPort', this.options.proxy.port || '8080', '--proxyUser', this.options.proxy.username, '--proxyPass', this.options.proxy.password);
            }
            this.client.emit(Constants_1.Events.DEBUG, '[MCLC]: Set launch options');
            resolve(args);
        }));
    }
    /**
     * Gets the JVM args best suited for the current os
     * @returns {string}
     */
    getJVM() {
        const opts = {
            windows: '-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
            osx: '-XstartOnFirstThread',
            linux: '-Xss1M',
        };
        return opts[this.getOS()];
    }
    /**
     * Gets the current system os in user friendly terms
     * @returns {string}
     */
    getOS() {
        if (this.options.os) {
            return this.options.os;
        }
        else {
            switch (process.platform) {
                case 'win32': return 'windows';
                case 'darwin': return 'osx';
                default: return 'linux';
            }
        }
    }
    /**
     * Extracts the client package
     * @param {LauncherOptions?} options Client options
     * @returns {Promise<void>}
     */
    extractPackage(options = this.options) {
        return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
            if (options.clientPackage.startsWith('http')) {
                yield this.downloadAsync(options.clientPackage, options.root, 'clientPackage.zip', true, 'client-package');
                options.clientPackage = path_1.join(options.root, 'clientPackage.zip');
            }
            new adm_zip_1.default(options.clientPackage).extractAllTo(options.root, true);
            this.client.emit(Constants_1.Events.PACKAGE_EXTRACT, true);
            if (options.removePackage)
                shelljs_1.rm(options.clientPackage);
            resolve();
        }));
    }
}
exports.Handler = Handler;
