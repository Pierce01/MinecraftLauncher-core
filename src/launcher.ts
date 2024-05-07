import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { offline } from '@/authenticator';
import Handler from '@/handler';
import mclc from '@/mclc';
import { Options } from '@/types';
import { cleanUp, getOS } from '@/utils';
import { log } from '@/utils/log';

const initialConfig: Options = {
    mclc_log: true,
    root: './minecraft',
    directory: '',
    authorization: offline('Steve'),
    detached: true,
    version: {
        number: '1.14.4',
        type: 'release',
    },
    url: {
        meta: 'https://launchermeta.mojang.com',
        resource: 'https://resources.download.minecraft.net',
    },
    memory: {
        min: Math.pow(2, 9),
        max: Math.pow(2, 10),
    },
};

export class Client {
    config: Options;
    handler: Handler;

    constructor(config: Options) {
        this.config = { ...initialConfig, ...config };
        this.config.directory = join(
            this.config.root,
            'versions',
            this.config.version.custom || this.config.version.number,
        );
        this.handler = new Handler(this.config);
    }

    launch() {
        throw Error(
            'This function is no longer used. In order to install Minecraft, use the install function. To start Minecraft, use the start function',
        );
    }

    async install() {
        this.config.mclc_log && log('version', `MCLC version ${mclc}`);

        if (!existsSync(this.config.root)) {
            log('debug', 'Attempting to create root folder');
            mkdirSync(this.config.root);
        }

        if (this.config.gameDirectory) {
            this.config.gameDirectory = resolve(this.config.gameDirectory);
            if (!existsSync(this.config.gameDirectory)) mkdirSync(this.config.gameDirectory, { recursive: true });
        }

        await this.handler.getVersion();
        const mcPath =
            this.config.minecraftJar ||
            (this.config.version.custom
                ? join(this.config.root, 'versions', this.config.version.custom, `${this.config.version.custom}.jar`)
                : join(this.config.directory, `${this.config.version.number}.jar`));
        await this.handler.getNatives();

        if (!existsSync(mcPath)) {
            log('debug', 'Attempting to download Minecraft version jar');
            await this.handler.getJar();
        }

        let modifyJson = null;
        if (this.config.version.custom) {
            log('debug', 'Detected custom in options, setting custom version file');
            modifyJson = JSON.parse(
                readFileSync(
                    join(
                        this.config.root,
                        'versions',
                        this.config.version.custom,
                        `${this.config.version.custom}.json`,
                    ),
                    {
                        encoding: 'utf8',
                    },
                ),
            );
        }

        cleanUp(await this.handler.getClasses(modifyJson));

        log('debug', 'Attempting to download assets');
        await this.handler.getAssets();

        log('debug', `Successfully installed Minecraft ${this.config.version.number}`);
        return;
    }

    async start() {
        this.config.mclc_log && log('version', `MCLC version ${mclc}`);

        const java = await this.handler.checkJava(this.config.javaPath || 'java');
        if (!java || !java.run) {
            log('debug', `Couldn't start Minecraft due to: ${java.message}`);
            return log('close', 1);
        }

        const versionFile = await this.handler.getVersion();
        const mcPath =
            this.config.minecraftJar ||
            (this.config.version.custom
                ? join(this.config.root, 'versions', this.config.version.custom, `${this.config.version.custom}.jar`)
                : join(this.config.directory, `${this.config.version.number}.jar`));
        const nativePath = await this.handler.getNatives();

        const args: string[] = [];

        let modifyJson = null;
        if (this.config.version.custom) {
            log('debug', 'Detected custom in options, setting custom version file');
            modifyJson = JSON.parse(
                readFileSync(
                    join(
                        this.config.root,
                        'versions',
                        this.config.version.custom,
                        `${this.config.version.custom}.json`,
                    ),
                    {
                        encoding: 'utf8',
                    },
                ),
            );
        } else if (this.config.forge) {
            this.config.forge = resolve(this.config.forge);
            log('debug', 'Detected Forge in options, getting dependencies');
            modifyJson = await this.handler.getForgedWrapped();
        }

        const jvm = [
            '-XX:-UseAdaptiveSizePolicy',
            '-XX:-OmitStackTraceInFastThrow',
            '-Dfml.ignorePatchDiscrepancies=true',
            '-Dfml.ignoreInvalidMinecraftCertificates=true',
            `-Djava.library.path=${resolve(nativePath)}`,
            `-Xmx${this.handler.getMemory()[0]}`,
            `-Xms${this.handler.getMemory()[1]}`,
        ];
        if (getOS(this.config.os) === 'osx') {
            if (parseInt(versionFile.id.split('.')[1]) > 12) jvm.push(await this.handler.getJVM());
        } else jvm.push(await this.handler.getJVM());

        if (this.config.customArgs) jvm.concat(this.config.customArgs);
        if (this.config.logj4ConfigurationFile)
            jvm.push(`-Dlog4j.configurationFile=${resolve(this.config.logj4ConfigurationFile)}`);
        // https://help.minecraft.net/hc/en-us/articles/4416199399693-Security-Vulnerability-in-Minecraft-Java-Edition
        if (parseInt(versionFile.id.split('.')[1]) === 18 && !parseInt(versionFile.id.split('.')[2]))
            jvm.push('-Dlog4j2.formatMsgNoLookups=true');
        if (parseInt(versionFile.id.split('.')[1]) === 17) jvm.push('-Dlog4j2.formatMsgNoLookups=true');
        if (parseInt(versionFile.id.split('.')[1]) < 17) {
            if (!jvm.find((arg) => arg.includes('Dlog4j.configurationFile'))) {
                const configPath = resolve(this.config.root);
                const intVersion = parseInt(versionFile.id.split('.')[1]);
                if (intVersion >= 12) {
                    await this.handler.downloadAsync(
                        'https://launcher.mojang.com/v1/objects/02937d122c86ce73319ef9975b58896fc1b491d1/log4j2_112-116.xml',
                        configPath,
                        'log4j2_112-116.xml',
                        true,
                        'log4j',
                    );
                    jvm.push(`-Dlog4j.configurationFile=${resolve(join(configPath, 'log4j2_112-116.xml'))}`);
                } else if (intVersion >= 7) {
                    await this.handler.downloadAsync(
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

        const classes = this.config.classes || cleanUp(await this.handler.getClasses(modifyJson));
        const classPaths = ['-cp'];
        const separator = getOS(this.config.os) === 'windows' ? ';' : ':';
        log('debug', `Using ${separator} to separate class paths`);
        // Handling launch arguments.
        const file = modifyJson || versionFile;
        // So mods like fabric work.
        const jar = existsSync(mcPath)
            ? `${separator}${resolve(mcPath)}`
            : `${separator}${resolve(join(this.config.directory, `${this.config.version.number}.jar`))}`;
        classPaths.push(
            `${this.config.forge ? `${this.config.forge}${separator}` : ''}${classes.join(separator)}${jar}`,
        );
        classPaths.push(file.mainClass);

        const launchconfig = await this.handler.getLaunchOptions(modifyJson);
        const launchArguments = args.concat(jvm, classPaths, launchconfig);
        log('arguments', launchArguments);
        log('debug', `Launching with arguments ${launchArguments.join(' ')}`);

        const minecraft = spawn(this.config.javaPath ?? 'java', launchArguments, {
            detached: this.config.detached,
        });
        minecraft.stdout.on('data', (data) => log('data', data.toString('utf-8')));
        minecraft.stderr.on('data', (data) => log('data', data.toString('utf-8')));
        minecraft.on('close', (code) => code && log('close', code));
        return minecraft;
    }
}
