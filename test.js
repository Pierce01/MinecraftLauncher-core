const { Client, Authenticator } = require('.');
const launcher = new Client();

launcher.launch({
    authorization: Authenticator.getAuth('username'),
    root: './minecraft',
    version: {
        number: '1.7.10',
        type: 'release',
    },
    memory: {
        max: '4G',
        min: '2G',
    },
});

launcher.on('debug', (e) => console.log(e));
launcher.on('data', (e) => console.log(e));
