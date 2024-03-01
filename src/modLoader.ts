import axios from 'axios';
import { load } from 'cheerio';
import { checkJava } from './handler';
import { version } from './launcher';
import { config } from './utils/config';
import { log } from './utils/log';

type Version = 'latest' | 'recommended' | string;

export const installForge = async () => {
    log('debug', `MCLC version ${version}`);

    const java = await checkJava(config.javaPath || 'java');
    if (!java || !java.run) {
        log('debug', `Couldn't install Forge due to: ${java.message}`);
        return log('close', 1);
    }

    const toGet: Version = '14.23.5.2851'; // 14.23.4.2756

    axios.get('https://files.minecraftforge.net/net/minecraftforge/forge/index_1.12.2.html').then(({ data }) => {
        const $ = load(data);
        const forgeVersions = $('tbody tr')
            .map((_, row) => {
                const $row = $(row);
                const versions = $row.find('td.download-version').text().split(/\s+/).filter(Boolean);
                const sha1 = $row.find('strong:contains("SHA1")').next().text().trim();

                return versions.map((version) => ({ version, sha1 }));
            })
            .toArray()
            .flat();

        console.log(forgeVersions);

        if (toGet === 'latest' || toGet === 'recommended') {
            const description = $('meta[property="og:description"]')
                .attr('content')
                ?.match(/Latest:\s+(\d+\.\d+\.\d+\.\d+)\s+Recommended:\s+(\d+\.\d+\.\d+\.\d+)/);

            if (toGet === 'latest' && description)
                return console.log(forgeVersions.find((o) => o.version === description[1]));
            if (toGet === 'recommended' && description)
                return console.log(forgeVersions.find((o) => o.version === description[2]));

            throw Error('nuh uh');
        }

        return console.log(forgeVersions.find((o) => o.version === toGet));
    });

    return;
};
