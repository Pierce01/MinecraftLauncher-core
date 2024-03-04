import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import axios from 'axios';
import { load } from 'cheerio';
import { checkJava, downloadAsync } from './handler';
import mclc from './mclc';
import { checkSum } from './utils';
import { config } from './utils/config';
import { log } from './utils/log';

type Version = 'latest' | 'recommended' | string;

export const getForgeVersion = async (
    versionToInstall: Version,
): Promise<false | { version: string; sha1: string }> => {
    // These versions do not have a changelog, so the installer is in the first place
    const specialVersions = ['14.23.5.2855', '14.23.5.2854', '14.23.5.2852', '14.23.5.2851'];

    return await axios
        .get(`https://files.minecraftforge.net/net/minecraftforge/forge/index_${config.version.number}.html`)
        .then(({ data }) => {
            const $ = load(data);
            const forgeVersions = $('tbody tr')
                .map((_, row) => {
                    const $row = $(row);
                    const versions = $row.find('td.download-version').text().split(/\s+/).filter(Boolean);
                    const sha1 = $row
                        .find('div.info-tooltip:contains("SHA1")')
                        .text()
                        .trim()
                        .split('\n')
                        .filter((item) => item.includes('SHA1'))
                        .map((item) => item.split(': ')[1])[
                        versionToInstall !== 'latest' && versionToInstall !== 'recommended'
                            ? specialVersions.includes(versionToInstall)
                                ? 0
                                : 1
                            : 1
                    ];
                    return versions.map((version) => ({ version, sha1 }));
                })
                .toArray()
                .flat();

            if (versionToInstall === 'latest' || versionToInstall === 'recommended') {
                const description = $('meta[property="og:description"]').attr('content');

                if (!description) {
                    log('debug', 'Unable to receive latest/recommended version');
                    return false;
                }

                const latest = description.match(/Latest: (\d+\.\d+\.\d+)/);
                const recommended = description.match(/Recommended: (\d+\.\d+\.\d+)/);

                if (versionToInstall === 'latest' && latest) {
                    const found = forgeVersions.find((o) => o.version === latest[1]);
                    if (!found) {
                        log('debug', `Latest version was not found`);
                        return false;
                    }

                    return found;
                }
                if (versionToInstall === 'recommended' && recommended) {
                    const found = forgeVersions.find((o) => o.version === recommended[1]);
                    if (!found) {
                        log('debug', `Recommended version was not found`);
                        return false;
                    }

                    return found;
                }

                log('debug', `No ${versionToInstall} version found`);
                return false;
            }

            const found = forgeVersions.find((o) => o.version === versionToInstall);
            if (!found) {
                log('debug', `Version ${versionToInstall} was not found`);
                return false;
            }

            return found;
        })
        .catch((error) => {
            log('debug', `Couldn't access Forge's website due to: ${error}`);
            return false;
        });
};

export const installForge = async (forgeVersion?: Version) => {
    log('version', `MCLC version ${mclc}`);

    const acceptedVersions = [
        '1.20.4',
        '1.20.3',
        '1.20.2',
        '1.20.1',
        '1.20',
        '1.19.4',
        '1.19.3',
        '1.19.2',
        '1.19.1',
        '1.19',
        '1.18.2',
        '1.18.1',
        '1.18',
        '1.17.1',
        '1.16.5',
        '1.16.4',
        '1.16.3',
        '1.16.2',
        '1.16.1',
        '1.15.2',
        '1.15.1',
        '1.15',
        '1.14.4',
        '1.14.3',
        '1.14.2',
        '1.13.2',
        '1.12.2',
    ];
    if (!acceptedVersions.includes(config.version.number)) {
        log('debug', `Forge doesn't support Minecraft Version ${config.version.number}`);
        return log('close', 1);
    }

    const java = await checkJava(config.javaPath || 'java');
    if (!java || !java.run) {
        log('debug', `Couldn't install Forge due to: ${java.message}`);
        return log('close', 1);
    }

    const version = await getForgeVersion(forgeVersion || 'recommended');
    if (!version) return log('close', 1);

    const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${config.version.number}-${version.version}/forge-${config.version.number}-${version.version}-installer.jar`;
    const name = url.split('/').pop() as string;

    await downloadAsync(url, resolve(config.root), name, true, 'forge');
    if (!(await checkSum(version.sha1, join(config.root, name))))
        await downloadAsync(url, resolve(config.root), name, true, 'forge');

    const launchArguments = ['-jar', resolve(join(config.root, name)), '--installClient', resolve(config.root)];
    const minecraft = spawn(config.javaPath ? config.javaPath : 'java', launchArguments);
    minecraft.stdout.on('data', (data) => log('data', data.toString('utf-8')));
    minecraft.stderr.on('data', (data) => log('data', data.toString('utf-8')));
    minecraft.on('close', (code) => code && log('close', code));
    return minecraft;
};
