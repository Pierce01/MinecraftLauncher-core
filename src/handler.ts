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
import { resolve as _resolve, join, sep } from 'node:path';
import Zip from 'adm-zip';
import axios from 'axios';
import { checkSum, getOS, isLegacy, popString } from './utils';
import { config, setConfig } from './utils/config';
import { log } from './utils/log';
import { artifactType, Fields, libType, Version } from './utils/types';

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
                log(
                    'debug',
                    `[MCLC]: Failed to download asset to ${join(directory, name)} due to\n${e}.` +
                        ` Retrying... ${retry}`,
                );
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

    const manifest = `${config.url?.meta}/mc/game/version_manifest.json`;
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
        `${config.version.custom ? config.version.custom : config.version.number}.jar`,
        true,
        'version-jar',
    );
    writeFileSync(join(config.directory!, `${config.version.number}.json`), JSON.stringify(parsedVersion, null, 4));
    return log('debug', 'Downloaded version jar and wrote version json');
};

const getAssets = async () => {
    const assetDirectory = _resolve(config.assetRoot || join(config.root, 'assets'));
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

            if (!existsSync(join(subAsset, hash)) || !(await checkSum(hash, join(subAsset, hash)))) {
                await downloadAsync(`${config.url?.resource}/${subhash}/${hash}`, subAsset, hash, true, 'assets');
            }
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

const parseRule = (lib: libType) => {
    if (!lib.rules) return false;
    if (lib.rules.length <= 1 && lib.rules[0].action === 'allow' && lib.rules[0].os)
        return lib.rules[0].os.name !== getOS();
    if (lib.rules[0].action === 'allow' && lib.rules[1].action === 'disallow' && lib.rules[1].os.name === 'osx')
        return getOS() === 'osx';

    return true;
};

const getNatives = async () => {
    const nativeDirectory = _resolve(config.natives || join(config.root, 'natives', parsedVersion.id));

    if (parseInt(parsedVersion.id.split('.')[1]) >= 19) return config.root;

    if (!existsSync(nativeDirectory) || !readdirSync(nativeDirectory).length) {
        mkdirSync(nativeDirectory, { recursive: true });

        const natives = async () => {
            const natives: artifactType[] = [];
            await Promise.all(
                parsedVersion.libraries.map(async (lib: libType) => {
                    if (!lib.downloads || !lib.downloads.classifiers) return;
                    if (parseRule(lib)) return;

                    const native =
                        getOS() === 'osx'
                            ? lib.downloads.classifiers['natives-osx']
                                ? (lib.downloads.classifiers['natives-osx'] as artifactType)
                                : (lib.downloads.classifiers['natives-macos'] as artifactType)
                            : (lib.downloads.classifiers[`natives-${getOS()}`] as artifactType);

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
                if (!existsSync(join(nativeDirectory, name)) || !downloaded) {
                    await downloadAsync(native.url, nativeDirectory, name, true, 'natives');
                }
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

const downloadToDirectory = async (directory: string, libraries: libType[], eventName: string) => {
    const libs: string[] = [];

    await Promise.all(
        libraries.map(async (library) => {
            if (!library) return;
            if (parseRule(library)) return;
            const lib = library.name.split(':');

            let jarPath: string;
            let name: string;
            if (library.downloads && library.downloads.artifact && library.downloads.artifact.path) {
                name =
                    library.downloads.artifact.path.split('/')[library.downloads.artifact.path.split('/').length - 1];
                jarPath = join(directory, popString(library.downloads.artifact.path));
            } else {
                name = `${lib[1]}-${lib[2]}${lib[3] ? '-' + lib[3] : ''}.jar`;
                jarPath = join(directory, `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
            }

            if (!existsSync(join(jarPath, name)))
                await downloadAsync(library.downloads.artifact.url, jarPath, name, true, eventName);
            if (library.downloads && library.downloads.artifact)
                if (!checkSum(library.downloads.artifact.sha1, join(jarPath, name)))
                    await downloadAsync(library.downloads.artifact.url, jarPath, name, true, eventName);

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

const getClasses = async () => {
    let libs: string[] = [];

    const libraryDirectory = _resolve(config.libraryRoot || join(config.root, 'libraries'));

    const parsed = parsedVersion.libraries
        .filter((lib: libType | undefined) => lib !== undefined)
        .map((lib: libType) => {
            if (lib.downloads && lib.downloads.artifact && !parseRule(lib)) return lib;
        });

    libs = libs.concat(await downloadToDirectory(libraryDirectory, parsed as libType[], 'classes'));
    counter = 0;

    log('debug', 'Collected class paths');
    return libs;
};

const formatQuickPlay = () => {
    if (!config.quickPlay) return;

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
        return null;
    }
    const returnArgs =
        type === 'legacy'
            ? ['--server', identifier.split(':')[0], '--port', identifier.split(':')[1] || '25565']
            : [types[type], identifier];
    if (path) returnArgs.push('--quickPlayPath', path);
    return returnArgs;
};

const getLaunchOptions = async () => {
    const type = Object.assign({}, parsedVersion);

    let args = type.minecraftArguments ? type.minecraftArguments.split(' ') : type.arguments.game;
    const assetRoot = join(_resolve(config.assetRoot || join(config.root, 'assets')));
    const assetPath = isLegacy(parsedVersion) ? join(config.root, 'resources') : join(assetRoot);

    const minArgs = config.minArgs || isLegacy(parsedVersion) ? 5 : 11;
    if (args.length < minArgs)
        args = args.concat(
            parsedVersion.minecraftArguments
                ? parsedVersion.minecraftArguments.split(' ')
                : parsedVersion.arguments.game,
        );
    if (config.customLaunchArgs) args = args.concat(config.customLaunchArgs);

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
        '${game_directory}': config.gameDirectory || _resolve(config.root),
        '${assets_root}': assetPath,
        '${game_assets}': assetPath,
        '${version_type}': config.version.type,
        '${clientid}': config.authorization.client_token || config.authorization.access_token,
        '${resolution_width}': config.window ? config.window.width : 856,
        '${resolution_height}': config.window ? config.window.height : 482,
    };

    if (config.authorization.meta.demo && (config.features ? !config.features.includes('is_demo_user') : true))
        args.push('--demo');

    const replaceArg = (obj: { value: string | string[] }, index: number) => {
        if (!Array.isArray(obj.value)) {
            for (const arg of obj.value) args.push(arg);
        } else {
            args.push(obj.value);
        }
        delete args[index];
    };

    for (let index = 0; index < args.length; index++) {
        if (typeof args[index] === 'object') {
            if (args[index].rules) {
                if (!config.features) continue;
                const featureFlags = [];
                for (const rule of args[index].rules) {
                    featureFlags.push(...Object.keys(rule.features));
                }
                let hasAllRules = true;
                for (const feature of config.features) {
                    if (!featureFlags.includes(feature)) {
                        hasAllRules = false;
                    }
                }
                if (hasAllRules) replaceArg(args[index], index);
            } else {
                replaceArg(args[index], index);
            }
        } else {
            if (Object.keys(fields).includes(args[index] as keyof Fields))
                args[index] = fields[args[index] as keyof Fields];
        }
    }
    if (config.window) {
        if (config.window.fullscreen) {
            args.push('--fullscreen');
        } else {
            if (config.window.width) args.push('--width', config.window.width);
            if (config.window.height) args.push('--height', config.window.height);
        }
    }
    if (config.quickPlay) args = args.concat(formatQuickPlay());
    if (config.proxy) {
        args.push(
            '--proxyHost',
            config.proxy.host,
            '--proxyPort',
            config.proxy.port || '8080',
            '--proxyUser',
            config.proxy.username,
            '--proxyPass',
            config.proxy.password,
        );
    }
    args = args.filter((value: string | number) => typeof value === 'string' || typeof value === 'number');
    log('debug', 'Set launch options');
    return args;
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
            setConfig('memory', { min: Math.pow(2, 9), max: Math.pow(2, 10) });
        }
        return [`${config.memory.max}M`, `${config.memory.min}M`];
    } else if (typeof config.memory.min === 'string' && typeof config.memory.max === 'string') {
        return [`${config.memory.max}`, `${config.memory.min}`];
    } else {
        log(
            'debug',
            `MIN memory is a ${typeof config.memory.min} while MAX is ${typeof config.memory.max}! Resetting!`,
        );
        setConfig('memory', { min: Math.pow(2, 9), max: Math.pow(2, 10) });
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
    getClasses,
    getLaunchOptions,
    getJVM,
    getMemory,
};
