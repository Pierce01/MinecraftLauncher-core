const path = require('path');
const zip = require('adm-zip');
const shelljs = require('shelljs');

module.exports.extractPackage = function(e) {
    return new Promise(async resolve => {
        if(e.options.clientPackage.startsWith('http')) {
            await e.handler.downloadAsync(e.options.clientPackage, e.options.root, "clientPackage.zip");
            e.options.clientPackage = path.join(e.options.root, "clientPackage.zip")
        }
        new zip(e.options.clientPackage).extractAllTo(e.options.root, true);
        e.emit('package-extract', true);
        shelljs.rm(e.options.clientPackage);
        resolve();
    });
};
