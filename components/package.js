const path = require('path');
const zip = require('adm-zip');

module.exports.extractPackage = function(root, clientPackage) {
    return new Promise(async resolve => {
        if(clientPackage.startsWith('http')) {
            await downloadAsync(clientPackage, root, "clientPackage.zip");
            clientPackage = path.join(root, "clientPackage.zip")
        }
        new zip(clientPackage).extractAllTo(root, true);
        this.client.emit('package-extract', true);
        resolve();
    });
};