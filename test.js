const { Client, onLog } = require('./build/cjs/index.js');

(async () => {
    await Client.install();
    await Client.start();
})();

onLog('debug', (e) => console.log(e));
onLog('data', (e) => console.log(e));
onLog('progress', (e) => console.log(e));
