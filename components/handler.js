const fs =  require('fs');
const shelljs = require('shelljs');
const path = require('path');
const request = require('request');
const checksum = require('checksum');
const zip = require('adm-zip');

class Handler {
    constructor(client) {
        this.client = client;
        this.options = client.options;
        this.version = undefined;
    }

    downloadAsync(url, directory, name) {
        return new Promise(resolve => {
            shelljs.mkdir('-p', directory);

            const _request = request(url, {timeout: this.options.timeout || 10000});

            _request.on('error', (e) => {
                this.client.emit('debug', `[MCLC]: Failed to download asset to ${path.join(directory, name)} due to\n${e}`);
                resolve({
                    failed: true,
                    asset: {
                        url: url,
                        directory: directory,
                        name: name
                    }
                });
            });

            _request.on('data', (data) => {
                let size = 0;
                if(fs.existsSync(path.join(directory, name))) size = fs.statSync(path.join(directory, name))["size"];
                this.client.emit('download-status', {
                    "name": name,
                    "current": Math.round(size / 10000),
                    "total": data.length
                })
            });

            const file = fs.createWriteStream(path.join(directory, name));
            _request.pipe(file);

            file.once('finish', () => {
                this.client.emit('download', name);
                resolve({failed: false, asset: null});
            });

            file.on('error', (e) => {
                this.client.emit('debug', `[MCLC]: Failed to download asset to ${path.join(directory, name)} due to\n${e}`);
                if(fs.existsSync(path.join(directory, name))) shelljs.rm(path.join(directory, name));
                resolve({
                    failed: true,
                    asset: {
                        url: url,
                        directory: directory,
                        name: name
                    }
                });
            });
        });
    }

    checkSum(hash, file) {
        return new Promise(resolve => {
            checksum.file(file, (err, sum) => resolve(hash === sum));
        });
    }

    getVersion() {
        return new Promise(resolve => {
            if(fs.existsSync(path.join(this.options.directory, 'versions', this.options.version.number, `${this.options.version.number}.json`))) {
                this.version = require(path.join(this.options.directory, 'versions', this.options.version.number, `${this.options.version.number}.json`));
                resolve(this.version);
                return;
            }

            const manifest = "https://launchermeta.mojang.com/mc/game/version_manifest.json";
            request.get(manifest, (error, response, body) => {
                if (error) resolve(error);

                const parsed = JSON.parse(body);

                for (const desiredVersion in parsed.versions) {
                    if(parsed.versions[desiredVersion].id === this.options.version.number) {
                        request.get(parsed.versions[desiredVersion].url, (error, response, body) => {
                            if (error) resolve(error);

                            this.client.emit('debug', `[MCLC]: Parsed version from version manifest`);
                            this.version = JSON.parse(body);
                            resolve(this.version);
                        });
                    }
                }
            });
        });
    }

    getJar() {
        return new Promise(async (resolve)=> {
            await this.downloadAsync(this.version.downloads.client.url, this.options.directory, `${this.options.version.number}.jar`);

            fs.writeFileSync(path.join(this.options.directory, `${this.options.version.number}.json`), JSON.stringify(this.version, null, 4));

            this.client.emit('debug', '[MCLC]: Downloaded version jar and wrote version json');

            resolve();
        });
    }

    getAssets() {
        return new Promise(async(resolve) => {
            const assetsUrl = 'https://resources.download.minecraft.net';
            const failed = [];

            if(!fs.existsSync(path.join(this.options.root, 'assets', 'indexes', `${this.version.assetIndex.id}.json`))) {
                await this.downloadAsync(this.version.assetIndex.url, path.join(this.options.root, 'assets', 'indexes'), `${this.version.assetIndex.id}.json`);
            }

            const index = require(path.join(this.options.root, 'assets', 'indexes',`${this.version.assetIndex.id}.json`));

            await Promise.all(Object.keys(index.objects).map(async asset => {
                const hash = index.objects[asset].hash;
                const subhash = hash.substring(0,2);
                const assetDirectory = path.join(this.options.root, 'assets', 'objects', subhash);

                if(!fs.existsSync(path.join(assetDirectory, hash)) || !await this.checkSum(hash, path.join(assetDirectory, hash))) {
                    const download = await this.downloadAsync(`${assetsUrl}/${subhash}/${hash}`, assetDirectory, hash);

                    if(download.failed) failed.push(download.asset);
                }
            }));

            // why do we have this? B/c sometimes Minecraft's resource site times out!
            if(failed) {
                await Promise.all(failed.map(async asset => await this.downloadAsync(asset.url, asset.directory, asset.name)))
            }

            // Copy assets to legacy if it's an older Minecarft version.
            if(this.version.assets === "legacy" || this.version.assets === "pre-1.6") {
                await Promise.all(Object.keys(index.objects).map(async asset => {
                    const hash = index.objects[asset].hash;
                    const subhash = hash.substring(0,2);
                    const assetDirectory = path.join(this.options.root, 'assets', 'objects', subhash);

                    let legacyAsset = asset.split('/');
                    legacyAsset.pop();

                    if(!fs.existsSync(path.join(this.options.root, 'assets', 'legacy', legacyAsset.join('/')))) {
                        shelljs.mkdir('-p', path.join(this.options.root, 'assets', 'legacy', legacyAsset.join('/')));
                    }

                    if (!fs.existsSync(path.join(this.options.root, 'assets', 'legacy', asset))) {
                        fs.copyFileSync(path.join(assetDirectory, hash), path.join(this.options.root, 'assets', 'legacy', asset))
                    }
                }));
            }

            this.client.emit('debug', '[MCLC]: Downloaded assets');
            resolve();
        });
    }

    getNatives() {
        return new Promise(async(resolve) => {
            const nativeDirectory = path.join(this.options.root, 'natives', this.version.id);

            if(!fs.existsSync(nativeDirectory) || !fs.readdirSync(nativeDirectory).length) {
                shelljs.mkdir('-p', nativeDirectory);

                await Promise.all(this.version.libraries.map(async (lib) => {
                    if (!lib.downloads.classifiers) return;
                    const type = `natives-${this.getOS()}`;
                    const native = lib.downloads.classifiers[type];

                    if (native) {
                        const name = native.path.split('/').pop();
                        await this.downloadAsync(native.url, nativeDirectory, name);
                        if(!await this.checkSum(native.sha1, path.join(nativeDirectory, name))) {
                            await this.downloadAsync(native.url, nativeDirectory, name);
                        }
                        try {new zip(path.join(nativeDirectory, name)).extractAllTo(nativeDirectory, true);} catch(e) {
                            // Only doing a console.warn since a stupid error happens. You can basically ignore this.
                            // if it says Invalid file name, just means two files were downloaded and both were deleted.
                            // All is well.
                            console.warn(e);
                        }
                        shelljs.rm(path.join(nativeDirectory, name));
                    }
                }));
                this.client.emit('debug', '[MCLC]: Downloaded and extracted natives');
            }

            this.client.emit('debug', `[MCLC]: Set native path to ${nativeDirectory}`);
            resolve(nativeDirectory);
        });
    }

    async getForgeDependencies() {
        if(!fs.existsSync(path.join(this.options.root, 'forge'))) {
            shelljs.mkdir('-p', path.join(this.options.root, 'forge'));
        }
        await new zip(this.options.forge).extractEntryTo('version.json', path.join(this.options.root, 'forge', `${this.version.id}`), false, true);

        const forge = require(path.join(this.options.root, 'forge', `${this.version.id}`, 'version.json'));
        const mavenUrl = 'http://files.minecraftforge.net/maven/';
        const defaultRepo = 'https://libraries.minecraft.net/';
        const paths = [];

        await Promise.all(forge.libraries.map(async library => {
            const lib = library.name.split(':');

            if(lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) return;

            let url = mavenUrl;
            const jarPath = path.join(this.options.root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
            const name = `${lib[1]}-${lib[2]}.jar`;

            if(!library.url) {
                if(library.serverreq || library.clientreq) {
                    url = defaultRepo;
                } else {
                    return
                }
            }

            const downloadLink = `${url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${lib[1]}-${lib[2]}.jar`;

            if(fs.existsSync(path.join(jarPath, name))) {
                paths.push(`${jarPath}${path.sep}${name}`);
                return;
            }
            if(!fs.existsSync(jarPath)) shelljs.mkdir('-p', jarPath);

            await this.downloadAsync(downloadLink, jarPath, name);

            paths.push(`${jarPath}${path.sep}${name}`);
        }));

        this.client.emit('debug', '[MCLC]: Downloaded Forge dependencies');

        return {paths, forge};
    }

    getClasses() {
        return new Promise(async (resolve) => {
            const libs = [];

            if(this.options.version.custom) {
                const customJarJson = require(path.join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.json`));
                await Promise.all(customJarJson.libraries.map(async library => {
                    const lib = library.name.split(':');

                    const jarPath = path.join(this.options.root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
                    const name = `${lib[1]}-${lib[2]}.jar`;

                    if(!fs.existsSync(path.join(jarPath, name))) {
                        if(library.url) {
                            const url = `${library.url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${lib[1]}-${lib[2]}.jar`;
                            await this.downloadAsync(url, jarPath, name);
                        }
                    }
                    libs.push(`${jarPath}${path.sep}${name}`);
                }));
            }

            await Promise.all(this.version.libraries.map(async (_lib) => {
                if(!_lib.downloads.artifact) return;

                const libraryPath = _lib.downloads.artifact.path;
                const libraryUrl = _lib.downloads.artifact.url;
                const libraryHash = _lib.downloads.artifact.sha1;
                const libraryDirectory = path.join(this.options.root, 'libraries', libraryPath);

                if(!fs.existsSync(libraryDirectory) || !await this.checkSum(libraryHash, libraryDirectory)) {
                    let directory = libraryDirectory.split(path.sep);
                    const name = directory.pop();
                    directory = directory.join(path.sep);

                    await this.downloadAsync(libraryUrl, directory, name);
                }

                libs.push(libraryDirectory);
            }));

            this.client.emit('debug', '[MCLC]: Collected class paths');
            resolve(libs)
        });
    }

    static cleanUp(array) {
        return new Promise(resolve => {
            const newArray = [];

            for(let classPath in array) {
                if(newArray.includes(array[classPath])) continue;
                newArray.push(array[classPath]);
            }
            resolve(newArray);
        })
    }

    getLaunchOptions(modification) {
        return new Promise(async resolve => {
            let type = modification || this.version;

            let args = type.minecraftArguments ? type.minecraftArguments.split(' ') : type.arguments.game;
            const assetPath = this.version.assets === "legacy" || this.version.assets === "pre-1.6" ? path.join(this.options.root, 'assets', 'legacy') : path.join(this.options.root, 'assets');

            if(args.length < 5) args = args.concat(this.version.minecraftArguments ? this.version.minecraftArguments.split(' ') : this.version.arguments.game);

            if({}.toString.call(this.options.authorization) === "[object Promise]") {
                this.options.authorization = await this.options.authorization;
            }

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
                '${version_type}': this.options.version.type
            };

            for (let index = 0; index < args.length; index++) {
                if(typeof args[index] === 'object') args.splice(index, 2);
                if (Object.keys(fields).includes(args[index])) {
                    args[index] = fields[args[index]];
                }
            }

            if(this.options.window) args.push('--width', this.options.window.width, '--height', this.options.window.height);
            if(this.options.server) args.push('--server', this.options.server.host, '--port', this.options.server.port || "25565");
            if(this.options.proxy) args.push(
                '--proxyHost',
                this.options.proxy.host,
                '--proxyPort',
                this.options.proxy.port || "8080",
                '--proxyUser',
                this.options.proxy.username,
                '--proxyPass',
                this.options.proxy.password
            );

            this.client.emit('debug', '[MCLC]: Set launch options');
            resolve(args);
        });
    }

    async getJVM() {
        const opts = {
            "windows": "-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump",
            "osx": "-XstartOnFirstThread",
            "linux": "-Xss1M"
        };
        return opts[this.getOS()]
    }

    getOS() {
        if(this.options.os) {
            return this.options.os;
        } else {
            switch(process.platform) {
                case "win32": return "windows";
                case "darwin": return "osx";
                default: return "linux";
            }
        }
    }
}

module.exports = Handler;
