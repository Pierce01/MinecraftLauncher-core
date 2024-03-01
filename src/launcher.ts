import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    checkJava,
    downloadAsync,
    getAssets,
    getClasses,
    getJar,
    getJVM,
    getLaunchOptions,
    getMemory,
    getNatives,
    getVersion,
} from './handler';
import { cleanUp, getOS } from './utils';
import { config, setConfig } from './utils/config';
import { log } from './utils/log';

// Should be changed each update
const version = '3.18.0';

export const launch = () => {
    throw Error(
        'This function is no longer used. In order to install Minecraft, use the install function. To start Minecraft, use the start function',
    );
};

export const install = async () => {
    log('debug', `MCLC version ${version}`);

    const java = await checkJava(config.javaPath || 'java');
    if (!java || !java.run) {
        log('debug', `Couldn't start Minecraft due to: ${java.message}`);
        return log('close', 1);
    }

    if (!existsSync(config.root)) {
        log('debug', 'Attempting to create root folder');
        mkdirSync(config.root);
    }

    if (config.gameDirectory) {
        setConfig('gameDirectory', resolve(config.gameDirectory));
        if (!existsSync(config.gameDirectory)) mkdirSync(config.gameDirectory, { recursive: true });
    }

    const directory =
        config.directory ||
        join(config.root, 'versions', config.version.custom ? config.version.custom : config.version.number);
    setConfig('directory', directory);

    await getVersion();
    const mcPath =
        config.minecraftJar ||
        (config.version.custom
            ? join(config.root, 'versions', config.version.custom, `${config.version.custom}.jar`)
            : join(directory, `${config.version.number}.jar`));
    await getNatives();

    if (!existsSync(mcPath)) {
        log('debug', 'Attempting to download Minecraft version jar');
        await getJar();
    }

    cleanUp(await getClasses());

    log('debug', 'Attempting to download assets');
    await getAssets();

    log('debug', `Successfully installed Minecraft ${config.version.number}`);
    return;
};

export const start = async () => {
    log('debug', `MCLC version ${version}`);

    const java = await checkJava(config.javaPath || 'java');
    if (!java || !java.run) {
        log('debug', `Couldn't start Minecraft due to: ${java.message}`);
        return log('close', 1);
    }

    const directory =
        config.directory ||
        join(config.root, 'versions', config.version.custom ? config.version.custom : config.version.number);
    setConfig('directory', directory);

    const versionFile = await getVersion();
    const mcPath =
        config.minecraftJar ||
        (config.version.custom
            ? join(config.root, 'versions', config.version.custom, `${config.version.custom}.jar`)
            : join(directory, `${config.version.number}.jar`));
    const nativePath = await getNatives();

    const args: string[] = [];

    let jvm = [
        '-XX:-UseAdaptiveSizePolicy',
        '-XX:-OmitStackTraceInFastThrow',
        '-Dfml.ignorePatchDiscrepancies=true',
        '-Dfml.ignoreInvalidMinecraftCertificates=true',
        `-Djava.library.path=${nativePath}`,
        `-Xmx${getMemory()[0]}`,
        `-Xms${getMemory()[1]}`,
    ];
    if (getOS() === 'osx') {
        if (parseInt(versionFile.id.split('.')[1]) > 12) jvm.push(await getJVM());
    } else jvm.push(await getJVM());

    if (config.customArgs) jvm = jvm.concat(config.customArgs);
    if (config.logj4ConfigurationFile) {
        jvm.push(`-Dlog4j.configurationFile=${resolve(config.logj4ConfigurationFile)}`);
    }
    // https://help.minecraft.net/hc/en-us/articles/4416199399693-Security-Vulnerability-in-Minecraft-Java-Edition
    if (parseInt(versionFile.id.split('.')[1]) === 18 && !parseInt(versionFile.id.split('.')[2]))
        jvm.push('-Dlog4j2.formatMsgNoLookups=true');
    if (parseInt(versionFile.id.split('.')[1]) === 17) jvm.push('-Dlog4j2.formatMsgNoLookups=true');
    if (parseInt(versionFile.id.split('.')[1]) < 17) {
        if (!jvm.find((arg) => arg.includes('Dlog4j.configurationFile'))) {
            const configPath = resolve(config.root);
            const intVersion = parseInt(versionFile.id.split('.')[1]);
            if (intVersion >= 12) {
                await downloadAsync(
                    'https://launcher.mojang.com/v1/objects/02937d122c86ce73319ef9975b58896fc1b491d1/log4j2_112-116.xml',
                    configPath,
                    'log4j2_112-116.xml',
                    true,
                    'log4j',
                );
                jvm.push('-Dlog4j.configurationFile=log4j2_112-116.xml');
            } else if (intVersion >= 7) {
                await downloadAsync(
                    'https://launcher.mojang.com/v1/objects/dd2b723346a8dcd48e7f4d245f6bf09e98db9696/log4j2_17-111.xml',
                    configPath,
                    'log4j2_17-111.xml',
                    true,
                    'log4j',
                );
                jvm.push('-Dlog4j.configurationFile=log4j2_17-111.xml');
            }
        }
    }

    const classes = config.classes || cleanUp(await getClasses());
    const classPaths = ['-cp'];
    const separator = getOS() === 'windows' ? ';' : ':';
    log('debug', `Using ${separator} to separate class paths`);
    // Handling launch arguments.
    // So mods like fabric work.
    const jar = existsSync(mcPath)
        ? `${separator}${mcPath}`
        : `${separator}${join(directory, `${config.version.number}.jar`)}`;
    classPaths.push(`${classes.join(separator)}${jar}`);
    classPaths.push(versionFile.mainClass);

    const launchconfig = await getLaunchOptions();

    const launchArguments = args.concat(jvm, classPaths, launchconfig);
    log('arguments', launchArguments);
    log('debug', `Launching with arguments ${launchArguments.join(' ')}`);

    const minecraft = spawn(config.javaPath ? config.javaPath : 'java', launchArguments, {
        detached: config.detached,
    });
    minecraft.stdout.on('data', (data) => log('data', data.toString('utf-8')));
    minecraft.stderr.on('data', (data) => log('data', data.toString('utf-8')));
    minecraft.on('close', (code) => code && log('close', code));
    return minecraft;
};
