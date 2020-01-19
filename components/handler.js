const fs =  require('fs');
const shelljs = require('shelljs');
const path = require('path');
const request = require('request');
const checksum = require('checksum');
const zip = require('adm-zip');
const child = require('child_process');
let counter = 0;

class Handler {
    constructor(client) {
        this.client = client;
        this.options = client.options;
        this.version = undefined;
        this.baseRequest = request.defaults({
            pool: {maxSockets: this.options.overrides.maxSockets || 2},
            timeout: this.options.timeout || 10000
        });
    }

    checkJava(java) {
        return new Promise(resolve => {
            child.exec(`"${java}" -version`, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        run: false,
                        message: error
                    })
                } else {
                    this.client.emit('debug', `[MCLC]: Using Java version ${stderr.match(/"(.*?)"/).pop()} ${stderr.includes('64-Bit') ? '64-bit': '32-Bit'}`);
                    resolve({
                        run: true
                    });
                }
            });
        });
    }

    downloadAsync(url, directory, name, retry, type) {
        return new Promise(resolve => {
            shelljs.mkdir('-p', directory);

            const _request = this.baseRequest(url);

            let received_bytes = 0;
            let total_bytes = 0;

            _request.on('response', (data) => {
                if (data.statusCode === 404) {
                    this.client.emit('debug', `[MCLC]: Failed to download ${url} due to: File not found...`);
                    resolve(false);
                }

                total_bytes = parseInt(data.headers['content-length']);
            });

            _request.on('error', async (error) => {
                this.client.emit('debug', `[MCLC]: Failed to download asset to ${path.join(directory, name)} due to\n${error}.` +
                    ` Retrying... ${retry}`);
                if (retry) await this.downloadAsync(url, directory, name, false, type);
                resolve();
            });

            _request.on('data', (data) => {
                received_bytes += data.length;
                this.client.emit('download-status', {
                    "name": name,
                    "type": type,
                    "current": received_bytes,
                    "total": total_bytes
                })
            });

            const file = fs.createWriteStream(path.join(directory, name));
            _request.pipe(file);

            file.once('finish', () => {
                this.client.emit('download', name);
                resolve({
                    failed: false,
                    asset: null
                });
            });

            file.on('error', async (e) => {
                this.client.emit('debug', `[MCLC]: Failed to download asset to ${path.join(directory, name)} due to\n${e}.` +
                    ` Retrying... ${retry}`);
                if (fs.existsSync(path.join(directory, name))) shelljs.rm(path.join(directory, name));
                if (retry) await this.downloadAsync(url, directory, name, false, type);
                resolve();
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
            const versionJsonPath = this.options.overrides.versionJson || path.join(this.options.directory, `${this.options.version.number}.json`);
            if (fs.existsSync(versionJsonPath)) {
                this.version = JSON.parse(fs.readFileSync(versionJsonPath));
                resolve(this.version);
                return;
            }

            const manifest = `${this.options.overrides.url.meta}/mc/game/version_manifest.json`;
            request.get(manifest, (error, response, body) => {
                if (error) resolve(error);

                const parsed = JSON.parse(body);

                for (const desiredVersion in parsed.versions) {
                    if (parsed.versions[desiredVersion].id === this.options.version.number) {
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
        return new Promise(async (resolve) => {
            await this.downloadAsync(this.version.downloads.client.url, this.options.directory, `${this.options.version.number}.jar`, true, 'version-jar');

            fs.writeFileSync(path.join(this.options.directory, `${this.options.version.number}.json`), JSON.stringify(this.version, null, 4));

            this.client.emit('debug', '[MCLC]: Downloaded version jar and wrote version json');

            resolve();
        });
    }

    getAssets() {
        return new Promise(async(resolve) => {
            if(!fs.existsSync(path.join(this.options.root, 'assets', 'indexes', `${this.version.assetIndex.id}.json`))) {
                await this.downloadAsync(this.version.assetIndex.url, path.join(this.options.root, 'assets', 'indexes'),
                    `${this.version.assetIndex.id}.json`, true, 'asset-json');
            }

            const index = JSON.parse(fs.readFileSync(path.join(this.options.root, 'assets', 'indexes',`${this.version.assetIndex.id}.json`), { encoding: 'utf8' }));

            this.client.emit('progress', {
                type: 'assets',
                task: 0,
                total: Object.keys(index.objects).length
            });

            await Promise.all(Object.keys(index.objects).map(async asset => {
                const hash = index.objects[asset].hash;
                const subhash = hash.substring(0,2);
                const assetDirectory = this.options.overrides.assetRoot || path.join(this.options.root, 'assets');
                const subAsset = path.join(assetDirectory, 'objects', subhash);

                if(!fs.existsSync(path.join(subAsset, hash)) || !await this.checkSum(hash, path.join(subAsset, hash))) {
                    await this.downloadAsync(`${this.options.overrides.url.resource}/${subhash}/${hash}`, subAsset, hash,
                        true, 'assets');
                    counter = counter + 1;
                    this.client.emit('progress', {
                        type: 'assets',
                        task: counter,
                        total: Object.keys(index.objects).length
                    })
                }
            }));
            counter = 0;

            // Copy assets to legacy if it's an older Minecraft version.
            if(this.version.assets === "legacy" || this.version.assets === "pre-1.6") {
                const assetDirectory = this.options.overrides.assetRoot || path.join(this.options.root, 'assets');
                this.client.emit('debug', `[MCLC]: Copying assets over to ${path.join(assetDirectory, 'legacy')}`);

                this.client.emit('progress', {
                    type: 'assets-copy',
                    task: 0,
                    total: Object.keys(index.objects).length
                });

                await Promise.all(Object.keys(index.objects).map(async asset => {
                    const hash = index.objects[asset].hash;
                    const subhash = hash.substring(0,2);
                    const subAsset = path.join(assetDirectory, 'objects', subhash);

                    let legacyAsset = asset.split('/');
                    legacyAsset.pop();

                    if(!fs.existsSync(path.join(assetDirectory, 'legacy', legacyAsset.join('/')))) {
                        shelljs.mkdir('-p', path.join(assetDirectory, 'legacy', legacyAsset.join('/')));
                    }

                    if (!fs.existsSync(path.join(assetDirectory, 'legacy', asset))) {
                        fs.copyFileSync(path.join(subAsset, hash), path.join(assetDirectory, 'legacy', asset))
                    }
                    counter = counter + 1;
                    this.client.emit('progress', {
                        type: 'assets-copy',
                        task: counter,
                        total: Object.keys(index.objects).length
                    })
                }));
            }
            counter = 0;

            this.client.emit('debug', '[MCLC]: Downloaded assets');
            resolve();
        });
    }

    parseRule(lib) {
        if(lib.rules) {
            if (lib.rules.length > 1) {
                if (lib.rules[0].action === 'allow' &&
                    lib.rules[1].action === 'disallow' &&
                    lib.rules[1].os.name === 'osx') {
                    return this.getOS() === 'osx';
                } else {
                    return true;
                }
            } else {
                if (lib.rules[0].action === 'allow' && lib.rules[0].os) return this.getOS() !== 'osx';
            }
        } else {
            return false
        }
    }

    getNatives() {
        return new Promise(async(resolve) => {
            const nativeDirectory = this.options.overrides.natives || path.join(this.options.root, 'natives', this.version.id);

            if(!fs.existsSync(nativeDirectory) || !fs.readdirSync(nativeDirectory).length) {
                shelljs.mkdir('-p', nativeDirectory);

                const natives = () => {
                    return new Promise(async resolve => {
                        const natives = [];
                        await Promise.all(this.version.libraries.map(async (lib) => {
                            if (!lib.downloads.classifiers) return;
                            if (this.parseRule(lib)) return;

                            const native = this.getOS() === 'osx' ?
                                lib.downloads.classifiers['natives-osx'] || lib.downloads.classifiers['natives-macos'] :
                                lib.downloads.classifiers[`natives-${this.getOS()}`];

                            natives.push(native);
                        }));
                        resolve (natives);
                    })
                };
                const stat = await natives();

                this.client.emit('progress', {
                    type: 'natives',
                    task: 0,
                    total: stat.length
                });

                await Promise.all(stat.map(async (native) => {
                    // Edge case on some systems where native is undefined and throws an error, this should fix it.
                    if(!native) return;
                    const name = native.path.split('/').pop();
                    await this.downloadAsync(native.url, nativeDirectory, name, true, 'natives');
                    if (!await this.checkSum(native.sha1, path.join(nativeDirectory, name))) {
                        await this.downloadAsync(native.url, nativeDirectory, name, true, 'natives');
                    }
                    try {
                        new zip(path.join(nativeDirectory, name)).extractAllTo(nativeDirectory, true);
                    } catch (e) {
                        // Only doing a console.warn since a stupid error happens. You can basically ignore this.
                        // if it says Invalid file name, just means two files were downloaded and both were deleted.
                        // All is well.
                        console.warn(e);
                    }
                    shelljs.rm(path.join(nativeDirectory, name));
                    counter = counter + 1;
                    this.client.emit('progress', {
                        type: 'natives',
                        task: counter,
                        total: stat.length
                    })
                }));
                this.client.emit('debug', '[MCLC]: Downloaded and extracted natives');
            }

            counter = 0;
            this.client.emit('debug', `[MCLC]: Set native path to ${nativeDirectory}`);
            resolve(nativeDirectory);
        });
    }

    async getForgeDependenciesLegacy() {
        if(!fs.existsSync(path.join(this.options.root, 'forge'))) {
            shelljs.mkdir('-p', path.join(this.options.root, 'forge'));
        }

        try {
            await new zip(this.options.forge).extractEntryTo('version.json', path.join(this.options.root, 'forge', `${this.version.id}`), false, true);
        } catch(e) {
            this.client.emit('debug', `[MCLC]: Unable to extract version.json from the forge jar due to ${e}`);
            return null;
        }

        const forge = JSON.parse(fs.readFileSync(path.join(this.options.root, 'forge', `${this.version.id}`, 'version.json'), { encoding: 'utf8' }));
        const paths = [];

        this.client.emit('progress', {
            type: 'forge',
            task: 0,
            total: forge.libraries.length
        });

        await Promise.all(forge.libraries.map(async library => {
            const lib = library.name.split(':');

            if(lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) return;

            let url = this.options.overrides.url.mavenForge;
            const jarPath = path.join(this.options.root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
            const name = `${lib[1]}-${lib[2]}.jar`;

            if(!library.url) {
                if(library.serverreq || library.clientreq) {
                    url = this.options.overrides.url.defaultRepoForge;
                } else {
                    return
                }
            }

            const downloadLink = `${url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${name}`;


            if(fs.existsSync(path.join(jarPath, name))) {
                paths.push(`${jarPath}${path.sep}${name}`);
                counter = counter + 1;
                this.client.emit('progress', { type: 'forge', task: counter, total: forge.libraries.length});
                return;
            }
            if(!fs.existsSync(jarPath)) shelljs.mkdir('-p', jarPath);

            const download = await this.downloadAsync(downloadLink, jarPath, name, true, 'forge');
            if(!download) await this.downloadAsync(`${this.options.overrides.url.fallbackMaven}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${name}`, jarPath, name, true, 'forge');

            paths.push(`${jarPath}${path.sep}${name}`);
            counter = counter + 1;
            this.client.emit('progress', {
                type: 'forge',
                task: counter,
                total: forge.libraries.length
            })
        }));

        counter = 0;
        this.client.emit('debug', '[MCLC]: Downloaded Forge dependencies');

        return {paths, forge};
    }

    runInstaller(path) {
        return new Promise(resolve => {
            const installer = child.exec(path);
            installer.on('close', (code) => resolve());
        })
    }

    getClasses() {
        return new Promise(async (resolve) => {
            const libs = [];

            if(this.options.version.custom) {
                const customJarJson = JSON.parse(fs.readFileSync(path.join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.json`), { encoding: 'utf9'}));

                this.client.emit('progress', {
                    type: 'classes-custom',
                    task: 0,
                    total: customJarJson.libraries.length
                });

                await Promise.all(customJarJson.libraries.map(async library => {
                    const lib = library.name.split(':');

                    const jarPath = path.join(this.options.root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
                    const name = `${lib[1]}-${lib[2]}.jar`;

                    if(!fs.existsSync(path.join(jarPath, name))) {
                        if(library.url) {
                            const url = `${library.url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${lib[1]}-${lib[2]}.jar`;
                            await this.downloadAsync(url, jarPath, name, true, 'classes-custom');
                        }
                    }
                    counter = counter + 1;
                    this.client.emit('progress', {
                        type: 'classes-custom',
                        task: counter,
                        total: customJarJson.libraries.length
                    });
                    libs.push(`${jarPath}${path.sep}${name}`);
                }));
                counter = 0;
            }

            const parsedClasses = () => {
                return new Promise(async resolve => {
                    const classes = [];
                    await Promise.all(this.version.libraries.map(async (_lib) => {
                        if(!_lib.downloads.artifact) return;
                        if(this.parseRule(_lib)) return;

                        classes.push(_lib);
                    }));
                    resolve(classes);
                })
            };
            const parsed = await parsedClasses();

            this.client.emit('progress', {
                type: 'classes',
                task: 0,
                total: parsed.length
            });

            await Promise.all(parsed.map(async (_lib) => {
                const libraryPath = _lib.downloads.artifact.path;
                const libraryUrl = _lib.downloads.artifact.url;
                const libraryHash = _lib.downloads.artifact.sha1;
                const libraryDirectory = path.join(this.options.root, 'libraries', libraryPath);

                if(!fs.existsSync(libraryDirectory) || !await this.checkSum(libraryHash, libraryDirectory)) {
                    let directory = libraryDirectory.split(path.sep);
                    const name = directory.pop();
                    directory = directory.join(path.sep);

                    await this.downloadAsync(libraryUrl, directory, name, true, 'classes');
                }
                counter = counter + 1;
                this.client.emit('progress', {
                    type: 'classes',
                    task: counter,
                    total: parsed.length
                });
                libs.push(libraryDirectory);
            }));
            counter = 0;

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
            const assetRoot = this.options.overrides.assetRoot || path.join(this.options.root, 'assets');
            const assetPath = this.version.assets === "legacy" || this.version.assets === "pre-1.6" ? path.join(assetRoot, 'legacy') : path.join(assetRoot);

            const minArgs = this.options.overrides.minArgs || 5;
            if(args.length < minArgs) args = args.concat(this.version.minecraftArguments ? this.version.minecraftArguments.split(' ') : this.version.arguments.game);

            this.options.authorization = await Promise.resolve(this.options.authorization);

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
            
            if(this.options.window) this.options.window.fullscreen ? args.push('--fullscreen') : args.push('--width', this.options.window.width, '--height', this.options.window.height);           
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

    extractPackage(options = this.options) {
        return new Promise(async resolve => {
            if(options.clientPackage.startsWith('http')) {
                await this.downloadAsync(options.clientPackage, options.root, "clientPackage.zip", true, 'client-package');
                options.clientPackage = path.join(options.root, "clientPackage.zip")
            }
            new zip(options.clientPackage).extractAllTo(options.root, true);
            this.client.emit('package-extract', true);
            if(options.removePackage) shelljs.rm(options.clientPackage);
            resolve();
        });
    }
}

module.exports = Handler;
