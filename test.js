const { Config, onLog, Client } = require('./build/cjs/index.js');

Config.setConfig('version', { number: '1.15.2', type: 'release' });
// Config.setConfig('configPath', '/usr/lib/jvm/java-8-openjdk-amd64/bin/java');

(async () => {
    await Client.install();
    await Client.start();
})();

onLog('debug', (e) => console.log(e));
onLog('data', (e) => console.log(e));
onLog('progress', (e) => console.log(e));
