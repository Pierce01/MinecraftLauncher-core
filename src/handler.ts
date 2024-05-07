import { exec, ExecException } from 'node:child_process';
import {
    copyFileSync,
    createWriteStream,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { Agent as http } from 'node:http';
import { Agent as https } from 'node:https';
import { join, resolve, sep } from 'node:path';
import { ArtifactType, CustomArtifactType, CustomLibType, Fields, LibType, Options, Rule, Version } from '@/types';
import { checkSum, cleanUp, getOS, isLegacy, popString } from '@/utils';
import Counter from '@/utils/Counter';
import { log } from '@/utils/log';
import Zip from 'adm-zip';
import axios from 'axios';

class Handler {
    config: Options;
    counter: Counter;
    parsedVersion!: Version;

    constructor(config: Options) {
        this.config = config;
        this.counter = new Counter();
        this.parsedVersion;
    }

    checkJava(java: string): Promise<{ run: boolean; message?: ExecException }> {
        return new Promise((resolve) => {
            exec(`"${java}" -version`, (error, _, stderr) => {
                if (error)
                    return resolve({
                        run: false,
                        message: error,
                    });

                log(
                    'debug',
                    `Using Java version ${stderr.match(/"(.*?)"/)?.pop()} ${stderr.includes('64-Bit') ? '64-bit' : '32-Bit'}`,
                );
                resolve({ run: true });
            });
        });
    }

    async downloadAsync(url: string, directory: string, name: string, retry: boolean, type: string) {
        try {
            mkdirSync(directory, { recursive: true });

            const response = await axios.get(url, {
                responseType: 'stream',
                timeout: this.config.timeout || 50000,
                httpAgent: new http({ maxSockets: this.config.maxSockets || Infinity }),
                httpsAgent: new https({ maxSockets: this.config.maxSockets || Infinity }),
            });

            const totalBytes = parseInt(response.headers['content-length']);
            let receivedBytes = 0;

            response.data.on('data', (data: Buffer | string) => {
                typeof data === 'string' ? (receivedBytes += Buffer.byteLength(data)) : (receivedBytes += data.length);

                log('download-status', {
                    name: name,
                    type: type,
                    current: receivedBytes,
                    total: totalBytes,
                });
            });

            const file = createWriteStream(join(directory, name));
            response.data.pipe(file);

            await new Promise((resolve) => {
                file.on('finish', resolve);
                file.on('error', async (e) => {
                    log(
                        'debug',
                        `Failed to download asset to ${join(directory, name)} due to\n${e}. Retrying... ${retry}`,
                    );
                    if (existsSync(join(directory, name))) unlinkSync(join(directory, name));
                    if (retry) await this.downloadAsync(url, directory, name, false, type);
                    return resolve(e);
                });
            });

            log('download', name);
            return {
                failed: false,
                asset: null,
            };
        } catch (error) {
            log('debug', `Failed to download asset to ${join(directory, name)} due\n${error}. Retrying... ${retry}`);
            if (retry) await this.downloadAsync(url, directory, name, false, type);
            return;
        }
    }

    async getVersion() {
        const versionJsonPath =
            this.config.versionJson || join(this.config.directory, `${this.config.version.number}.json`);
        if (existsSync(versionJsonPath)) {
            this.parsedVersion = JSON.parse(readFileSync(versionJsonPath).toString());
            return this.parsedVersion;
        }

        const manifest = `${this.config.url.meta}/mc/game/version_manifest.json`;
        const cache = this.config.cache ? `${this.config.cache}/json` : `${this.config.root}/cache/json`;
        const { data } = await axios.get(manifest);

        if (!existsSync(cache)) {
            mkdirSync(cache, { recursive: true });
            log('debug', 'Cache directory created.');
        }

        writeFileSync(join(cache, 'version_manifest.json'), JSON.stringify(data));
        log('debug', 'Cached version_manifest.json');

        const desiredVersion = data.versions.find(
            (version: { id: string }) => version.id === this.config.version.number,
        );
        if (desiredVersion) {
            const { data } = await axios.get(desiredVersion.url);

            log('debug', 'Parsed version from version manifest');
            this.parsedVersion = data;
            return this.parsedVersion;
        } else {
            throw Error(`Failed to find version ${this.config.version.number} in version_manifest.json`);
        }
    }

    async getJar() {
        await this.downloadAsync(
            this.parsedVersion.downloads.client.url,
            this.config.directory,
            `${this.config.version.custom ?? this.config.version.number}.jar`,
            true,
            'version-jar',
        );
        writeFileSync(
            join(this.config.directory, `${this.config.version.number}.json`),
            JSON.stringify(this.parsedVersion, null, 4),
        );
        return log('debug', 'Downloaded version jar and wrote version json');
    }

    async getAssets() {
        const assetDirectory = resolve(this.config.assetRoot || join(this.config.root, 'assets'));
        const assetId = this.config.version.custom || this.config.version.number;

        if (!existsSync(join(assetDirectory, 'indexes', `${assetId}.json`)))
            await this.downloadAsync(
                this.parsedVersion.assetIndex.url,
                join(assetDirectory, 'indexes'),
                `${assetId}.json`,
                true,
                'asset-json',
            );

        const index = JSON.parse(
            readFileSync(join(assetDirectory, 'indexes', `${assetId}.json`), { encoding: 'utf8' }),
        );

        log('progress', {
            type: 'assets',
            task: 0,
            total: Object.keys(index.objects).length,
        });

        await Promise.all(
            Object.keys(index.objects).map(async (asset) => {
                const hash = index.objects[asset].hash;
                const subhash = hash.substring(0, 2);
                const subAsset = join(assetDirectory, 'objects', subhash);

                if (!existsSync(join(subAsset, hash)) || !(await checkSum(hash, join(subAsset, hash))))
                    await this.downloadAsync(
                        `${this.config.url.resource}/${subhash}/${hash}`,
                        subAsset,
                        hash,
                        true,
                        'assets',
                    );
                this.counter.increment();
                log('progress', {
                    type: 'assets',
                    task: this.counter.getValue(),
                    total: Object.keys(index.objects).length,
                });
            }),
        );
        this.counter.reset();

        // Copy assets to legacy if it's an older Minecraft version.
        if (isLegacy(this.parsedVersion)) {
            if (existsSync(join(assetDirectory, 'legacy'))) {
                log(
                    'debug',
                    "The 'legacy' directory is no longer used as Minecraft looks " +
                        "for the resouces folder regardless of what is passed in the assetDirecotry launch option. I'd " +
                        `recommend removing the directory (${join(assetDirectory, 'legacy')})`,
                );
            }

            const legacyDirectory = join(this.config.root, 'resources');
            log('debug', `Copying assets over to ${legacyDirectory}`);

            log('progress', {
                type: 'assets-copy',
                task: 0,
                total: Object.keys(index.objects).length,
            });

            await Promise.all(
                Object.keys(index.objects).map(async (asset) => {
                    const hash = index.objects[asset].hash;
                    const subhash = hash.substring(0, 2);
                    const subAsset = join(assetDirectory, 'objects', subhash);

                    const legacyAsset = asset.split('/');
                    legacyAsset.pop();

                    if (!existsSync(join(legacyDirectory, legacyAsset.join('/')))) {
                        mkdirSync(join(legacyDirectory, legacyAsset.join('/')), { recursive: true });
                    }

                    if (!existsSync(join(legacyDirectory, asset))) {
                        copyFileSync(join(subAsset, hash), join(legacyDirectory, asset));
                    }
                    this.counter.increment();
                    log('progress', {
                        type: 'assets-copy',
                        task: this.counter.getValue(),
                        total: Object.keys(index.objects).length,
                    });
                }),
            );
        }
        this.counter.reset();

        log('debug', 'Downloaded assets');
    }

    parseRule(lib: LibType) {
        if (!lib.rules) return false;
        if (lib.rules.length <= 1 && lib.rules[0].action === 'allow' && lib.rules[0].os)
            return lib.rules[0].os.name !== getOS(this.config.os);
        if (lib.rules[0].action === 'allow' && lib.rules[1].action === 'disallow' && lib.rules[1].os.name === 'osx')
            return getOS(this.config.os) === 'osx';

        return true;
    }

    async getNatives() {
        const nativeDirectory = resolve(
            this.config.natives || join(this.config.root, 'natives', this.parsedVersion.id),
        );

        if (parseInt(this.parsedVersion.id.split('.')[1]) >= 19) return this.config.root;

        if (!existsSync(nativeDirectory) || !readdirSync(nativeDirectory).length) {
            mkdirSync(nativeDirectory, { recursive: true });

            const natives = async () => {
                const natives: ArtifactType[] = [];
                await Promise.all(
                    this.parsedVersion.libraries.map(async (lib: LibType) => {
                        if (!lib.downloads || !lib.downloads.classifiers) return;
                        if (this.parseRule(lib)) return;

                        const native =
                            getOS(this.config.os) === 'osx'
                                ? lib.downloads.classifiers['natives-osx']
                                    ? (lib.downloads.classifiers['natives-osx'] as ArtifactType)
                                    : (lib.downloads.classifiers['natives-macos'] as ArtifactType)
                                : (lib.downloads.classifiers[`natives-${getOS(this.config.os)}`] as ArtifactType);

                        natives.push(native);
                    }),
                );
                return natives;
            };
            const stat = await natives();

            log('progress', {
                type: 'natives',
                task: 0,
                total: stat.length,
            });

            await Promise.all(
                stat.map(async (native) => {
                    if (!native) return;
                    const name = native.path.split('/').pop();

                    // Shouldn't even be happening
                    if (!name) return;
                    await this.downloadAsync(native.url, nativeDirectory, name, true, 'natives');
                    const downloaded = await checkSum(native.sha1, join(nativeDirectory, name));
                    if (!existsSync(join(nativeDirectory, name)) || !downloaded)
                        await this.downloadAsync(native.url, nativeDirectory, name, true, 'natives');
                    try {
                        new Zip(join(nativeDirectory, name)).extractAllTo(nativeDirectory, true);
                    } catch (e) {
                        // Only doing a console.warn since a stupid error happens. You can basically ignore
                        // if it says Invalid file name, just means two files were downloaded and both were deleted.
                        // All is well.
                        console.warn(e);
                    }
                    unlinkSync(join(nativeDirectory, name));
                    this.counter.increment();
                    log('progress', {
                        type: 'natives',
                        task: this.counter.getValue(),
                        total: stat.length,
                    });
                }),
            );
            log('debug', 'Downloaded and extracted natives');
        }

        this.counter.reset();
        log('debug', `Set native path to ${nativeDirectory}`);

        return nativeDirectory;
    }

    fwAddArgs() {
        const forgeWrapperAgrs = [
            `-Dforgewrapper.librariesDir=${resolve(this.config.libraryRoot || join(this.config.root, 'libraries'))}`,
            `-Dforgewrapper.installer=${this.config.forge}`,
            `-Dforgewrapper.minecraft=${resolve(join(this.config.directory, `${this.config.version.number}.jar`))}`,
        ];
        this.config.customArgs
            ? (this.config.customArgs = this.config.customArgs.concat(forgeWrapperAgrs))
            : (this.config.customArgs = forgeWrapperAgrs);

        return;
    }

    // I don't see a better way of putting anything else (for now)
    isModern(json: any): boolean {
        return (
            json.inheritsFrom &&
            json.inheritsFrom.split('.')[1] >= 12 &&
            !(json.inheritsFrom === '1.12.2' && json.id.split('.')[json.id.split('.').length - 1] === '2847')
        );
    }

    async getForgedWrapped() {
        let json = null;
        let installerJson = null;
        const versionPath = join(this.config.root, 'forge', `${this.parsedVersion.id}`, 'version.json');
        // Since we're building a proper "custom" JSON that will work nativly with MCLC, the version JSON will not
        // be re-generated on the next run.
        if (existsSync(versionPath)) {
            try {
                json = JSON.parse(readFileSync(versionPath).toString());
                // If forge is modern, add ForgeWrappers launch arguments and set forge to null so MCLC treats it as a custom json.
                if (this.isModern(json)) {
                    this.fwAddArgs();
                    this.config.forge = undefined;
                }
                return json;
            } catch (e) {
                console.warn(e);
                log('debug', 'Failed to parse Forge version JSON, re-generating');
            }
        }

        log('debug', 'Generating Forge version json, this might take a bit');
        const zipFile = new Zip(this.config.forge);
        json = zipFile.readAsText('version.json');

        if (zipFile.getEntry('install_profile.json')) installerJson = zipFile.readAsText('install_profile.json');
        try {
            json = JSON.parse(json);
            if (installerJson) installerJson = JSON.parse(installerJson);
        } catch (e) {
            log('debug', 'Failed to load json files for ForgeWrapper, using Vanilla instead');
            return null;
        }
        // Adding the installer libraries as mavenFiles so MCLC downloads them but doesn't add them to the class paths.
        if (installerJson)
            json.mavenFiles
                ? (json.mavenFiles = json.mavenFiles.concat(installerJson.libraries))
                : (json.mavenFiles = installerJson.libraries);

        // Holder for the specifc jar ending which depends on the specifc forge version.
        let jarEnding = 'universal';
        // We need to handle modern forge differently than legacy.
        if (this.isModern(json)) {
            // If forge is modern and above 1.12.2, we add ForgeWrapper to the libraries so MCLC includes it in the classpaths.
            if (json.inheritsFrom !== '1.12.2') {
                this.fwAddArgs();
                json.libraries.push({
                    name: 'io:github:zekerzhayard:ForgeWrapper:1.6.0',
                    downloads: {
                        artifact: {
                            path: 'io/github/zekerzhayard/ForgeWrapper/1.6.0/ForgeWrapper-1.6.0.jar',
                            url: 'https://github.com/ZekerZhayard/ForgeWrapper/releases/download/1.6.0/ForgeWrapper-1.6.0.jar',
                            sha1: '035a51fe6439792a61507630d89382f621da0f1f',
                            size: 28679,
                        },
                    },
                });
                json.mainClass = 'io.github.zekerzhayard.forgewrapper.installer.Main';
                jarEnding = 'launcher';

                // Providing a download URL to the universal jar mavenFile so it can be downloaded properly.
                for (const library of json.mavenFiles) {
                    const lib = library.name.split(':');
                    if (lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) {
                        library.downloads.artifact.url = `https://files.minecraftforge.net/maven/${library.downloads.artifact.path}`;
                        break;
                    }
                }
            } else {
                // Remove the forge dependent since we're going to overwrite the first entry anyways.
                for (const library in json.mavenFiles) {
                    const lib = json.mavenFiles[library].name.split(':');
                    if (lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) {
                        delete json.mavenFiles[library];
                        break;
                    }
                }
            }
        } else {
            // Modifying legacy library format to play nice with MCLC's downloadToDirectory function.
            await Promise.all(
                json.libraries.map(
                    async (library: { name: string; url?: string; serverreq: boolean; clientreq?: boolean }) => {
                        const lib = library.name.split(':');
                        if (lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) return;
                        if (!library.url && !(library.serverreq || library.clientreq)) return;

                        library.url = library.url
                            ? 'https://files.minecraftforge.net/maven/'
                            : 'https://libraries.minecraft.net/';
                        const downloadLink = `${library.url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${lib[1]}-${lib[2]}.jar`;
                        // Checking if the file still exists on Forge's server, if not, replace it with the fallback.
                        // Not checking for sucess, only if it 404s.
                        await axios
                            .get(downloadLink, {
                                timeout: this.config.timeout || 50000,
                                httpAgent: new http({ maxSockets: this.config.maxSockets || Infinity }),
                                httpsAgent: new https({ maxSockets: this.config.maxSockets || Infinity }),
                            })
                            .then(
                                ({ status }) =>
                                    status === 404 &&
                                    (library.url = 'https://search.maven.org/remotecontent?filepath='),
                            )
                            .catch(() => log('debug', `Failed checking request for ${downloadLink}`));
                    },
                ),
            );
        }
        // If a downloads property exists, we modify the inital forge entry to include ${jarEnding} so ForgeWrapper can work properly.
        // If it doesn't, we simply remove it since we're already providing the universal jar.
        const firstLibrary = json.libraries[0];
        if (firstLibrary.downloads) {
            if (firstLibrary.name.includes('minecraftforge:forge') && !firstLibrary.name.includes('universal')) {
                firstLibrary.name = `${firstLibrary.name}:${jarEnding}`;
                firstLibrary.downloads.artifact.path = firstLibrary.downloads.artifact.replace(
                    '.jar',
                    `-${jarEnding}.jar`,
                );
                firstLibrary.downloads.artifact.url = `https://files.minecraftforge.net/maven/${firstLibrary.downloads.artifact.path}`;
            }

            json.libraries[0] = firstLibrary;
        } else {
            delete json.libraries[0];
        }

        // Removing duplicates and null types
        json.libraries = cleanUp(json.libraries);
        if (json.mavenFiles) json.mavenFiles = cleanUp(json.mavenFiles);

        // Saving file for next run!
        if (!existsSync(join(this.config.root, 'forge', this.parsedVersion.id)))
            mkdirSync(join(this.config.root, 'forge', this.parsedVersion.id), { recursive: true });
        writeFileSync(versionPath, JSON.stringify(json, null, 4));

        // Make MCLC treat modern forge as a custom version json rather then legacy forge.
        if (
            json.inheritsFrom &&
            json.inheritsFrom.split('.')[1] >= 12 &&
            !(json.inheritsFrom === '1.12.2' && json.id.split('.')[json.id.split('.').length - 1] === '2847')
        )
            this.config.forge = undefined;

        return json;
    }

    async downloadToDirectory(directory: string, libraries: LibType[] | CustomArtifactType[], eventName: string) {
        const libs: string[] = [];

        await Promise.all(
            libraries.map(async (library) => {
                if (!library) return;
                if ('downloads' in library && this.parseRule(library)) return;
                const lib = library.name.split(':');

                let jarPath: string;
                let name: string;
                if ('downloads' in library && library.downloads.artifact && library.downloads.artifact.path) {
                    name =
                        library.downloads.artifact.path.split('/')[
                            library.downloads.artifact.path.split('/').length - 1
                        ];
                    jarPath = join(directory, popString(library.downloads.artifact.path));
                } else {
                    name = `${lib[1]}-${lib[2]}${lib[3] ? `-${lib[3]}` : ''}.jar`;
                    jarPath = join(directory, `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
                }

                const downloadLibrary = async (library: LibType | CustomArtifactType) => {
                    if ('url' in library) {
                        const url = `${library.url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${name}`;
                        await this.downloadAsync(url, jarPath, name, true, eventName);
                    } else if ('downloads' in library && library.downloads.artifact && library.downloads.artifact.url) {
                        // Only download if there's a URL provided. If not, we're assuming it's going a generated dependency.
                        await this.downloadAsync(library.downloads.artifact.url, jarPath, name, true, eventName);
                    }
                };

                if (!existsSync(join(jarPath, name))) await downloadLibrary(library);
                if ('downloads' in library && library.downloads.artifact)
                    if (!checkSum(library.downloads.artifact.sha1, join(jarPath, name))) await downloadLibrary(library);

                this.counter.increment();
                log('progress', {
                    type: eventName,
                    task: this.counter.getValue(),
                    total: libraries.length,
                });
                libs.push(`${jarPath}${sep}${name}`);
            }),
        );
        this.counter.reset();

        return libs;
    }

    async getClasses(classJson: CustomLibType) {
        let libs: string[] = [];
        const libraryDirectory = resolve(this.config.libraryRoot || join(this.config.root, 'libraries'));

        if (classJson) {
            if (classJson.mavenFiles)
                await this.downloadToDirectory(libraryDirectory, classJson.mavenFiles, 'classes-maven-custom');
            libs = await this.downloadToDirectory(libraryDirectory, classJson.libraries, 'classes-custom');
        }

        const parsed = this.parsedVersion.libraries.filter(Boolean).map((lib: LibType) => {
            if (lib.downloads && lib.downloads.artifact && !this.parseRule(lib)) return lib;
        });

        libs = libs.concat(await this.downloadToDirectory(libraryDirectory, parsed as LibType[], 'classes'));
        this.counter.reset();

        if (classJson) libs.sort();

        log('debug', 'Collected class paths');
        return libs;
    }

    processArguments(...args: (string | Rule | string[])[]): string[] {
        const result: string[] = [];
        args.forEach((arg) => {
            if (Array.isArray(arg)) {
                result.push(...arg.filter((item) => typeof item !== 'object'));
            } else if (typeof arg === 'string') {
                result.push(arg);
            }
        });

        return result;
    }

    async getLaunchOptions(modification: CustomLibType | null): Promise<string[]> {
        const type = Object.assign({}, this.parsedVersion, modification);
        const args = type.minecraftArguments
            ? type.minecraftArguments.split(' ')
            : this.processArguments(type.arguments.game);
        const assetPath = resolve(
            isLegacy(this.parsedVersion)
                ? join(this.config.root, 'resources')
                : join(this.config.assetRoot || join(this.config.root, 'assets')),
        );

        if (this.config.customLaunchArgs) args.concat(this.config.customLaunchArgs);

        this.config.authorization = await Promise.resolve(this.config.authorization);
        this.config.authorization.meta = this.config.authorization.meta ?? { demo: false, type: 'mojang' };
        const fields: Fields = {
            '${auth_access_token}': this.config.authorization.access_token,
            '${auth_session}': this.config.authorization.access_token,
            '${auth_player_name}': this.config.authorization.name,
            '${auth_uuid}': this.config.authorization.uuid,
            '${auth_xuid}': this.config.authorization.access_token,
            '${user_properties}': '{}',
            '${user_type}': this.config.authorization.meta.type,
            '${version_name}': this.config.version.number || this.config.versionName,
            '${assets_index_name}': this.config.assetIndex || this.config.version.custom || this.config.version.number,
            '${game_directory}': this.config.gameDirectory || resolve(this.config.root),
            '${assets_root}': assetPath,
            '${game_assets}': assetPath,
            '${version_type}': this.config.version.type,
            '${clientid}': this.config.authorization.client_token || this.config.authorization.access_token,
            '${resolution_width}': this.config.window ? this.config.window.width : 856,
            '${resolution_height}': this.config.window ? this.config.window.height : 482,
        };

        if (
            this.config.authorization.meta.demo &&
            (this.config.features ? !this.config.features.includes('is_demo_user') : true)
        )
            args.push('--demo');

        if (this.config.window) {
            if (this.config.window.fullscreen) {
                args.push('--fullscreen');
            } else {
                if (this.config.window.width) args.push('--width', this.config.window.width.toString());
                if (this.config.window.height) args.push('--height', this.config.window.height.toString());
            }
        }

        if (this.config.quickPlay) {
            const types = {
                singleplayer: '--quickPlaySingleplayer',
                multiplayer: '--quickPlayMultiplayer',
                realms: '--quickPlayRealms',
                legacy: null,
            };

            const { type, identifier, path } = this.config.quickPlay;
            const keys = Object.keys(types);
            if (!keys.includes(type)) {
                log('debug', `quickPlay type is not valid. Valid types are: ${keys.join(', ')}`);
            } else {
                const returnArgs =
                    type === 'legacy'
                        ? ['--server', identifier.split(':')[0], '--port', identifier.split(':')[1] || '25565']
                        : [types[type], identifier];

                if (path) returnArgs.push('--quickPlayPath', path);
                args.concat(returnArgs);
            }
        }

        if (this.config.proxy) {
            args.push('--proxyHost', this.config.proxy.host, '--proxyPort', this.config.proxy.port || '8080');

            if (this.config.proxy.username) args.push('--proxyUser', this.config.proxy.username);
            if (this.config.proxy.password) args.push('--proxyPass', this.config.proxy.password);
        }

        log('debug', 'Set launch options');
        return args.map((arg) =>
            Object.entries(fields).reduce(
                (acc, [placeholder, replacement]) =>
                    acc.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement),
                arg,
            ),
        );
    }

    async getJVM() {
        return {
            windows: '-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
            osx: '-XstartOnFirstThread',
            linux: '-Xss1M',
        }[getOS(this.config.os)];
    }

    getMemory() {
        if (typeof this.config.memory.min === 'number' && typeof this.config.memory.max === 'number') {
            if (this.config.memory.max < this.config.memory.min) {
                log('debug', 'MIN memory is higher then MAX! Resetting!');
                this.config.memory = {
                    min: Math.pow(2, 9),
                    max: Math.pow(2, 10),
                };
            }
            return [`${this.config.memory.max}M`, `${this.config.memory.min}M`];
        } else if (typeof this.config.memory.min === 'string' && typeof this.config.memory.max === 'string') {
            return [`${this.config.memory.max}`, `${this.config.memory.min}`];
        } else {
            log(
                'debug',
                `MIN memory is a ${typeof this.config.memory.min} while MAX is ${typeof this.config.memory.max}! Resetting!`,
            );
            this.config.memory = {
                min: Math.pow(2, 9),
                max: Math.pow(2, 10),
            };
            return [`${this.config.memory.max}M`, `${this.config.memory.min}M`];
        }
    }
}

export default Handler;
