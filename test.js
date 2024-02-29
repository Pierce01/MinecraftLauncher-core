const { Client, onLog } = require('./build/cjs/index.js');

Client.launch();

onLog('debug', (e) => console.log(e));
onLog('data', (e) => console.log(e));
onLog('progress', (e) => console.log(e));
