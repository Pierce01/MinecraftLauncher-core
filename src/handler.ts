import {
    copyFileSync,
    createWriteStream,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'fs';
import { exec, ExecException } from 'node:child_process';
import { Agent as http } from 'node:http';
import { Agent as https } from 'node:https';
import { join, resolve, sep } from 'node:path';
import Zip from 'adm-zip';
import axios from 'axios';
import { checkSum, cleanUp, getOS, isLegacy, popString } from './utils';
import { config } from './utils/config';
import { log } from './utils/log';
import { ArtifactType, CustomArtifactType, CustomLibType, Fields, LibType, Rule, Version } from './utils/types';

let counter = 0;
let parsedVersion: Version;

const checkJava = (
    java: string,
): Promise<{
    run: boolean;
    message?: ExecException;
}> =>
    new Promise((resolve) => {
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

const downloadAsync = async (url: string, directory: string, name: string, retry: boolean, type: string) => {
    try {
        mkdirSync(directory, { recursive: true });

        const response = await axios.get(url, {
            responseType: 'stream',
            timeout: config.timeout || 50000,
            httpAgent: new http({ maxSockets: config.maxSockets || 2 }),
            httpsAgent: new https({ maxSockets: config.maxSockets || 2 }),
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
                log('debug', `Failed to download asset to ${join(directory, name)} due to\n${e}. Retrying... ${retry}`);
                if (existsSync(join(directory, name))) unlinkSync(join(directory, name));
                if (retry) await downloadAsync(url, directory, name, false, type);
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
        if (retry) await downloadAsync(url, directory, name, false, type);
        return;
    }
};

const getVersion = async () => {
    const versionJsonPath = config.versionJson || join(config.directory!, `${config.version.number}.json`);
    if (existsSync(versionJsonPath)) {
        parsedVersion = JSON.parse(readFileSync(versionJsonPath).toString());
        return parsedVersion;
    }

    const manifest = `${config.url.meta}/mc/game/version_manifest.json`;
    const cache = config.cache ? `${config.cache}/json` : `${config.root}/cache/json`;
    const { data } = await axios.get(manifest);

    if (!existsSync(cache)) {
        mkdirSync(cache, { recursive: true });
        log('debug', 'Cache directory created.');
    }

    writeFileSync(join(cache, 'version_manifest.json'), JSON.stringify(data));
    log('debug', 'Cached version_manifest.json');

    const desiredVersion = data.versions.find((version: { id: string }) => version.id === config.version.number);
    if (desiredVersion) {
        const { data } = await axios.get(desiredVersion.url);
        writeFileSync(join(`${cache}/${config.version.number}.json`), JSON.stringify(data));
        log('debug', `Cached ${config.version.number}.json`);

        log('debug', 'Parsed version from version manifest');
        parsedVersion = data;
        return parsedVersion;
    } else {
        throw Error(`Failed to find version ${config.version.number} in version_manifest.json`);
    }
};

const getJar = async () => {
    await downloadAsync(
        parsedVersion.downloads.client.url,
        config.directory!,
        `${config.version.custom ?? config.version.number}.jar`,
        true,
        'version-jar',
    );
    writeFileSync(join(config.directory!, `${config.version.number}.json`), JSON.stringify(parsedVersion, null, 4));
    return log('debug', 'Downloaded version jar and wrote version json');
};

const getAssets = async () => {
    const assetDirectory = resolve(config.assetRoot || join(config.root, 'assets'));
    const assetId = config.version.custom || config.version.number;

    if (!existsSync(join(assetDirectory, 'indexes', `${assetId}.json`))) {
        await downloadAsync(
            parsedVersion.assetIndex.url,
            join(assetDirectory, 'indexes'),
            `${assetId}.json`,
            true,
            'asset-json',
        );
    }

    const index = JSON.parse(readFileSync(join(assetDirectory, 'indexes', `${assetId}.json`), { encoding: 'utf8' }));

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
                await downloadAsync(`${config.url.resource}/${subhash}/${hash}`, subAsset, hash, true, 'assets');
            counter++;
            log('progress', {
                type: 'assets',
                task: counter,
                total: Object.keys(index.objects).length,
            });
        }),
    );
    counter = 0;

    // Copy assets to legacy if it's an older Minecraft version.
    if (isLegacy(parsedVersion)) {
        if (existsSync(join(assetDirectory, 'legacy'))) {
            log(
                'debug',
                "The 'legacy' directory is no longer used as Minecraft looks " +
                    "for the resouces folder regardless of what is passed in the assetDirecotry launch option. I'd " +
                    `recommend removing the directory (${join(assetDirectory, 'legacy')})`,
            );
        }

        const legacyDirectory = join(config.root, 'resources');
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
                counter++;
                log('progress', {
                    type: 'assets-copy',
                    task: counter,
                    total: Object.keys(index.objects).length,
                });
            }),
        );
    }
    counter = 0;

    log('debug', 'Downloaded assets');
};

const parseRule = (lib: LibType) => {
    if (!lib.rules) return false;
    if (lib.rules.length <= 1 && lib.rules[0].action === 'allow' && lib.rules[0].os)
        return lib.rules[0].os.name !== getOS();
    if (lib.rules[0].action === 'allow' && lib.rules[1].action === 'disallow' && lib.rules[1].os.name === 'osx')
        return getOS() === 'osx';

    return true;
};

const getNatives = async () => {
    const nativeDirectory = resolve(config.natives || join(config.root, 'natives', parsedVersion.id));

    if (parseInt(parsedVersion.id.split('.')[1]) >= 19) return config.root;

    if (!existsSync(nativeDirectory) || !readdirSync(nativeDirectory).length) {
        mkdirSync(nativeDirectory, { recursive: true });

        const natives = async () => {
            const natives: ArtifactType[] = [];
            await Promise.all(
                parsedVersion.libraries.map(async (lib: LibType) => {
                    if (!lib.downloads || !lib.downloads.classifiers) return;
                    if (parseRule(lib)) return;

                    const native =
                        getOS() === 'osx'
                            ? lib.downloads.classifiers['natives-osx']
                                ? (lib.downloads.classifiers['natives-osx'] as ArtifactType)
                                : (lib.downloads.classifiers['natives-macos'] as ArtifactType)
                            : (lib.downloads.classifiers[`natives-${getOS()}`] as ArtifactType);

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
                const name = native.path.split('/').pop()!;
                await downloadAsync(native.url, nativeDirectory, name, true, 'natives');
                const downloaded = await checkSum(native.sha1, join(nativeDirectory, name));
                if (!existsSync(join(nativeDirectory, name)) || !downloaded)
                    await downloadAsync(native.url, nativeDirectory, name, true, 'natives');
                try {
                    new Zip(join(nativeDirectory, name)).extractAllTo(nativeDirectory, true);
                } catch (e) {
                    // Only doing a console.warn since a stupid error happens. You can basically ignore
                    // if it says Invalid file name, just means two files were downloaded and both were deleted.
                    // All is well.
                    console.warn(e);
                }
                unlinkSync(join(nativeDirectory, name));
                counter++;
                log('progress', {
                    type: 'natives',
                    task: counter,
                    total: stat.length,
                });
            }),
        );
        log('debug', 'Downloaded and extracted natives');
    }

    counter = 0;
    log('debug', `Set native path to ${nativeDirectory}`);

    return nativeDirectory;
};

const fwAddArgs = () => {
    const forgeWrapperAgrs = [
        `-Dforgewrapper.librariesDir=${resolve(config.libraryRoot || join(config.root, 'libraries'))}`,
        `-Dforgewrapper.installer=${config.forge}`,
        `-Dforgewrapper.minecraft=${resolve(join(config.directory!, `${config.version.number}.jar`))}`,
    ];
    config.customArgs
        ? (config.customArgs = config.customArgs.concat(forgeWrapperAgrs))
        : (config.customArgs = forgeWrapperAgrs);

    return;
};

// I don't see a better way of putting anything else (for now)
const isModern = (json: any): boolean =>
    json.inheritsFrom &&
    json.inheritsFrom.split('.')[1] >= 12 &&
    !(json.inheritsFrom === '1.12.2' && json.id.split('.')[json.id.split('.').length - 1] === '2847');

const getForgedWrapped = async () => {
    let json = null;
    let installerJson = null;
    const versionPath = join(config.root, 'forge', `${parsedVersion.id}`, 'version.json');
    // Since we're building a proper "custom" JSON that will work nativly with MCLC, the version JSON will not
    // be re-generated on the next run.
    if (existsSync(versionPath)) {
        try {
            json = JSON.parse(readFileSync(versionPath).toString());
            // If forge is modern, add ForgeWrappers launch arguments and set forge to null so MCLC treats it as a custom json.
            if (isModern(json)) {
                fwAddArgs();
                config.forge = undefined;
            }
            return json;
        } catch (e) {
            console.warn(e);
            log('debug', 'Failed to parse Forge version JSON, re-generating');
        }
    }

    log('debug', 'Generating Forge version json, this might take a bit');
    const zipFile = new Zip(config.forge);
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
    if (isModern(json)) {
        // If forge is modern and above 1.12.2, we add ForgeWrapper to the libraries so MCLC includes it in the classpaths.
        if (json.inheritsFrom !== '1.12.2') {
            fwAddArgs();
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
                            timeout: config.timeout || 50000,
                            httpAgent: new http({ maxSockets: config.maxSockets || 2 }),
                            httpsAgent: new https({ maxSockets: config.maxSockets || 2 }),
                        })
                        .then(
                            ({ status }) =>
                                status === 404 && (library.url = 'https://search.maven.org/remotecontent?filepath='),
                        )
                        .catch(() => log('debug', `Failed checking request for ${downloadLink}`));
                },
            ),
        );
    }
    // If a downloads property exists, we modify the inital forge entry to include ${jarEnding} so ForgeWrapper can work properly.
    // If it doesn't, we simply remove it since we're already providing the universal jar.
    if (json.libraries[0].downloads) {
        const name = json.libraries[0].name;
        if (name.includes('minecraftforge:forge') && !name.includes('universal')) {
            json.libraries[0].name = `${name}:${jarEnding}`;
            json.libraries[0].downloads.artifact.path = json.libraries[0].downloads.artifact.replace(
                '.jar',
                `-${jarEnding}.jar`,
            );
            json.libraries[0].downloads.artifact.url = `https://files.minecraftforge.net/maven/${json.libraries[0].downloads.artifact.path}`;
        }
    } else {
        delete json.libraries[0];
    }

    // Removing duplicates and null types
    json.libraries = cleanUp(json.libraries);
    if (json.mavenFiles) json.mavenFiles = cleanUp(json.mavenFiles);

    // Saving file for next run!
    if (!existsSync(join(config.root, 'forge', parsedVersion.id))) {
        mkdirSync(join(config.root, 'forge', parsedVersion.id), { recursive: true });
    }
    writeFileSync(versionPath, JSON.stringify(json, null, 4));

    // Make MCLC treat modern forge as a custom version json rather then legacy forge.
    if (
        json.inheritsFrom &&
        json.inheritsFrom.split('.')[1] >= 12 &&
        !(json.inheritsFrom === '1.12.2' && json.id.split('.')[json.id.split('.').length - 1] === '2847')
    )
        config.forge = undefined;

    return json;
};

const downloadToDirectory = async (
    directory: string,
    libraries: LibType[] | CustomArtifactType[],
    eventName: string,
) => {
    const libs: string[] = [];

    await Promise.all(
        libraries.map(async (library) => {
            if (!library) return;
            if ('downloads' in library && parseRule(library)) return;
            const lib = library.name.split(':');

            let jarPath: string;
            let name: string;
            if ('downloads' in library && library.downloads.artifact && library.downloads.artifact.path) {
                name =
                    library.downloads.artifact.path.split('/')[library.downloads.artifact.path.split('/').length - 1];
                jarPath = join(directory, popString(library.downloads.artifact.path));
            } else {
                name = `${lib[1]}-${lib[2]}${lib[3] ? `-${lib[3]}` : ''}.jar`;
                jarPath = join(directory, `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
            }

            const downloadLibrary = async (library: LibType | CustomArtifactType) => {
                if ('url' in library) {
                    const url = `${library.url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${name}`;
                    await downloadAsync(url, jarPath, name, true, eventName);
                } else if ('downloads' in library && library.downloads.artifact && library.downloads.artifact.url) {
                    // Only download if there's a URL provided. If not, we're assuming it's going a generated dependency.
                    await downloadAsync(library.downloads.artifact.url, jarPath, name, true, eventName);
                }
            };

            if (!existsSync(join(jarPath, name))) await downloadLibrary(library);
            if ('downloads' in library && library.downloads.artifact)
                if (!checkSum(library.downloads.artifact.sha1, join(jarPath, name))) await downloadLibrary(library);

            counter++;
            log('progress', {
                type: eventName,
                task: counter,
                total: libraries.length,
            });
            libs.push(`${jarPath}${sep}${name}`);
        }),
    );
    counter = 0;

    return libs;
};

const getClasses = async (classJson: CustomLibType) => {
    let libs: string[] = [];
    const libraryDirectory = resolve(config.libraryRoot || join(config.root, 'libraries'));

    if (classJson) {
        if (classJson.mavenFiles)
            await downloadToDirectory(libraryDirectory, classJson.mavenFiles, 'classes-maven-custom');
        libs = await downloadToDirectory(libraryDirectory, classJson.libraries, 'classes-custom');
    }

    const parsed = parsedVersion.libraries.filter(Boolean).map((lib: LibType) => {
        if (lib.downloads && lib.downloads.artifact && !parseRule(lib)) return lib;
    });

    libs = libs.concat(await downloadToDirectory(libraryDirectory, parsed as LibType[], 'classes'));
    counter = 0;

    if (classJson) libs.sort();

    log('debug', 'Collected class paths');
    return libs;
};

const processArguments = (...args: (string | Rule | string[])[]): string[] => {
    const result: string[] = [];
    args.forEach((arg) => {
        if (Array.isArray(arg)) {
            result.push(...arg.filter((item) => typeof item !== 'object'));
        } else if (typeof arg === 'string') {
            result.push(arg);
        }
    });

    return result;
};

const getLaunchOptions = async (modification: CustomLibType | null): Promise<string[]> => {
    const type = Object.assign({}, parsedVersion, modification);
    const args = type.minecraftArguments ? type.minecraftArguments.split(' ') : processArguments(type.arguments.game);
    const assetPath = resolve(
        isLegacy(parsedVersion)
            ? join(config.root, 'resources')
            : join(config.assetRoot || join(config.root, 'assets')),
    );

    if (config.customLaunchArgs) args.concat(config.customLaunchArgs);

    config.authorization = await Promise.resolve(config.authorization);
    config.authorization.meta = config.authorization.meta ?? { demo: false, type: 'mojang' };
    const fields: Fields = {
        '${auth_access_token}': config.authorization.access_token,
        '${auth_session}': config.authorization.access_token,
        '${auth_player_name}': config.authorization.name,
        '${auth_uuid}': config.authorization.uuid,
        '${auth_xuid}': config.authorization.access_token,
        '${user_properties}': config.authorization.user_properties,
        '${user_type}': config.authorization.meta.type,
        '${version_name}': config.version.number || config.versionName,
        '${assets_index_name}': config.assetIndex || config.version.custom || config.version.number,
        '${game_directory}': config.gameDirectory || resolve(config.root),
        '${assets_root}': assetPath,
        '${game_assets}': assetPath,
        '${version_type}': config.version.type,
        '${clientid}': config.authorization.client_token || config.authorization.access_token,
        '${resolution_width}': config.window ? config.window.width : 856,
        '${resolution_height}': config.window ? config.window.height : 482,
    };

    if (config.authorization.meta.demo && (config.features ? !config.features.includes('is_demo_user') : true))
        args.push('--demo');

    if (config.window) {
        if (config.window.fullscreen) {
            args.push('--fullscreen');
        } else {
            if (config.window.width) args.push('--width', config.window.width.toString());
            if (config.window.height) args.push('--height', config.window.height.toString());
        }
    }

    if (config.quickPlay) {
        const types = {
            singleplayer: '--quickPlaySingleplayer',
            multiplayer: '--quickPlayMultiplayer',
            realms: '--quickPlayRealms',
            legacy: null,
        };

        const { type, identifier, path } = config.quickPlay;
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

    if (config.proxy) {
        args.push('--proxyHost', config.proxy.host, '--proxyPort', config.proxy.port || '8080');

        if (config.proxy.username) args.push('--proxyUser', config.proxy.username);
        if (config.proxy.password) args.push('--proxyPass', config.proxy.password);
    }

    log('debug', 'Set launch options');
    return args.map((arg) =>
        Object.entries(fields).reduce(
            (acc, [placeholder, replacement]) =>
                acc.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement),
            arg,
        ),
    );
};

const getJVM = async () =>
    ({
        windows: '-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
        osx: '-XstartOnFirstThread',
        linux: '-Xss1M',
    })[getOS()];

const getMemory = () => {
    if (typeof config.memory.min === 'number' && typeof config.memory.max === 'number') {
        if (config.memory.max < config.memory.min) {
            log('debug', 'MIN memory is higher then MAX! Resetting!');
            config.memory = {
                min: Math.pow(2, 9),
                max: Math.pow(2, 10),
            };
        }
        return [`${config.memory.max}M`, `${config.memory.min}M`];
    } else if (typeof config.memory.min === 'string' && typeof config.memory.max === 'string') {
        return [`${config.memory.max}`, `${config.memory.min}`];
    } else {
        log(
            'debug',
            `MIN memory is a ${typeof config.memory.min} while MAX is ${typeof config.memory.max}! Resetting!`,
        );
        config.memory = {
            min: Math.pow(2, 9),
            max: Math.pow(2, 10),
        };
        return [`${config.memory.max}M`, `${config.memory.min}M`];
    }
};

export {
    checkJava,
    downloadAsync,
    getVersion,
    getJar,
    getAssets,
    getNatives,
    getForgedWrapped,
    getClasses,
    getLaunchOptions,
    getJVM,
    getMemory,
};
