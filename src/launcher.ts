import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    checkJava,
    downloadAsync,
    getAssets,
    getClasses,
    getForgedWrapped,
    getJar,
    getJVM,
    getLaunchOptions,
    getMemory,
    getNatives,
    getVersion,
} from '@/handler';
import mclc from '@/mclc';
import { cleanUp, getOS } from '@/utils';
import { config, defineConfig } from '@/utils/config';
import { log } from '@/utils/log';

export const launch = () => {
    throw Error(
        'This function is no longer used. In order to install Minecraft, use the install function. To start Minecraft, use the start function',
    );
};

export const install = async () => {
    log('version', `MCLC version ${mclc}`);

    if (!existsSync(config.root)) {
        log('debug', 'Attempting to create root folder');
        mkdirSync(config.root);
    }

    if (config.gameDirectory) {
        defineConfig({ gameDirectory: resolve(config.gameDirectory) });
        if (!existsSync(config.gameDirectory)) mkdirSync(config.gameDirectory, { recursive: true });
    }

    await getVersion();
    const mcPath =
        config.minecraftJar ||
        (config.version.custom
            ? join(config.root, 'versions', config.version.custom, `${config.version.custom}.jar`)
            : join(config.directory, `${config.version.number}.jar`));
    await getNatives();

    if (!existsSync(mcPath)) {
        log('debug', 'Attempting to download Minecraft version jar');
        await getJar();
    }

    let modifyJson = null;
    if (config.version.custom) {
        log('debug', 'Detected custom in options, setting custom version file');
        modifyJson = JSON.parse(
            readFileSync(join(config.root, 'versions', config.version.custom, `${config.version.custom}.json`), {
                encoding: 'utf8',
            }),
        );
    }

    cleanUp(await getClasses(modifyJson));

    log('debug', 'Attempting to download assets');
    await getAssets();

    log('debug', `Successfully installed Minecraft ${config.version.number}`);
    return;
};

export const start = async () => {
    log('version', `MCLC version ${mclc}`);

    const java = await checkJava(config.javaPath || 'java');
    if (!java || !java.run) {
        log('debug', `Couldn't start Minecraft due to: ${java.message}`);
        return log('close', 1);
    }

    const versionFile = await getVersion();
    const mcPath =
        config.minecraftJar ||
        (config.version.custom
            ? join(config.root, 'versions', config.version.custom, `${config.version.custom}.jar`)
            : join(config.directory, `${config.version.number}.jar`));
    const nativePath = await getNatives();

    const args: string[] = [];

    let modifyJson = null;
    if (config.version.custom) {
        log('debug', 'Detected custom in options, setting custom version file');
        modifyJson = JSON.parse(
            readFileSync(join(config.root, 'versions', config.version.custom, `${config.version.custom}.json`), {
                encoding: 'utf8',
            }),
        );
    } else if (config.forge) {
        defineConfig({ forge: resolve(config.forge) });
        log('debug', 'Detected Forge in options, getting dependencies');
        modifyJson = await getForgedWrapped();
    }

    const jvm = [
        '-XX:-UseAdaptiveSizePolicy',
        '-XX:-OmitStackTraceInFastThrow',
        '-Dfml.ignorePatchDiscrepancies=true',
        '-Dfml.ignoreInvalidMinecraftCertificates=true',
        `-Djava.library.path=${resolve(nativePath)}`,
        `-Xmx${getMemory()[0]}`,
        `-Xms${getMemory()[1]}`,
    ];
    if (getOS() === 'osx') {
        if (parseInt(versionFile.id.split('.')[1]) > 12) jvm.push(await getJVM());
    } else jvm.push(await getJVM());

    if (config.customArgs) jvm.concat(config.customArgs);
    if (config.logj4ConfigurationFile) jvm.push(`-Dlog4j.configurationFile=${resolve(config.logj4ConfigurationFile)}`);
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
                jvm.push(`-Dlog4j.configurationFile=${resolve(join(configPath, 'log4j2_112-116.xml'))}`);
            } else if (intVersion >= 7) {
                await downloadAsync(
                    'https://launcher.mojang.com/v1/objects/dd2b723346a8dcd48e7f4d245f6bf09e98db9696/log4j2_17-111.xml',
                    configPath,
                    'log4j2_17-111.xml',
                    true,
                    'log4j',
                );
                jvm.push(`-Dlog4j.configurationFile=${resolve(join(configPath, 'log4j2_17-111.xml'))}`);
            }
        }
    }

    const classes = config.classes || cleanUp(await getClasses(modifyJson));
    const classPaths = ['-cp'];
    const separator = getOS() === 'windows' ? ';' : ':';
    log('debug', `Using ${separator} to separate class paths`);
    // Handling launch arguments.
    const file = modifyJson || versionFile;
    // So mods like fabric work.
    const jar = existsSync(mcPath)
        ? `${separator}${resolve(mcPath)}`
        : `${separator}${resolve(join(config.directory, `${config.version.number}.jar`))}`;
    classPaths.push(`${config.forge ? `${config.forge}${separator}` : ''}${classes.join(separator)}${jar}`);
    classPaths.push(file.mainClass);

    const launchconfig = await getLaunchOptions(modifyJson);
    const launchArguments = args.concat(jvm, classPaths, launchconfig);
    log('arguments', launchArguments);
    log('debug', `Launching with arguments ${launchArguments.join(' ')}`);

    const minecraft = spawn(config.javaPath ?? 'java', launchArguments, {
        detached: config.detached,
    });
    minecraft.stdout.on('data', (data) => log('data', data.toString('utf-8')));
    minecraft.stderr.on('data', (data) => log('data', data.toString('utf-8')));
    minecraft.on('close', (code) => code && log('close', code));
    return minecraft;
};
