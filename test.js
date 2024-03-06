const { forge } = require('tomate-loaders');
const { Config, onLog, Client } = require('./build/cjs/index.js');
const { join, dirname } = require('node:path');
const { mkdirSync, writeFileSync } = require('node:fs');

Config.setConfig('version', { number: '1.19.4', type: 'release' });
// Config.setConfig('configPath', '/usr/lib/jvm/java-8-openjdk-amd64/bin/java');

(async () => {
    const versionPath = join(Config.config.root, 'versions', `forge-1.19.4`, 'forge.jar');
    await forge.downloadForge(versionPath, '1.19.4');
    Config.setConfig('forge', versionPath);

    // console.log(Config.config);
    await Client.install();
    await Client.start();
})();

onLog('debug', (e) => console.log(e));
onLog('data', (e) => console.log(e));
onLog('progress', (e) => console.log(e));
