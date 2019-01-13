const child = require('child_process');
const event = require('./events');
const path = require('path');
const handler = require('./handler');
const fs = require('fs');


module.exports = async function (options) {
    if(!fs.existsSync(options.root)) fs.mkdirSync(options.root);

    if(options.clientPackage) {
        await handler.extractPackage(options.root, options.clientPackage);
    }

    const directory = path.join(options.root, 'versions', options.version.number);
    options.directory = directory;
    const versionFile = await handler.getVersion(options.version.number, options.directory);
    const mcPath = path.join(directory, `${options.version.number}.jar`);
    const nativePath = await handler.getNatives(options.root, versionFile, options.os);

    if (!fs.existsSync(mcPath)) {
        await handler.getJar(versionFile, options.version.number, directory);
    }

    const args = [];

    // CGC
    args.push('-Xincgc');

    // Memory
    const memory = [`-Xmx${options.memory.max}M`];

    // Jvm
    let jvm = [
        '-XX:-UseAdaptiveSizePolicy',
        '-XX:-OmitStackTraceInFastThrow',
        '-Dfml.ignorePatchDiscrepancies=true',
        '-Dfml.ignoreInvalidMinecraftCertificates=true',
        `-Djava.library.path=${nativePath}`
    ];
    jvm.push(await handler.getJVM(versionFile, options));

    const classes = await handler.getClasses(options.root, versionFile);
    const classPaths = ['-cp'];
    classPaths.push(`${mcPath}; ${classes.join(";")}`);
    classPaths.push(versionFile.mainClass);

    // Download version's assets
    await handler.getAssets(options.root, versionFile);

    // Launch options
    const launchOptions = await handler.getLaunchOptions(versionFile, options);

    const arguments = args.concat(memory, jvm, classPaths, launchOptions);
    const minecraft = child.spawn("java", arguments);

    event.emit('start', null);
    minecraft.stdout.on('data', (data) => event.emit('data', data));
    minecraft.stderr.on('data', (data) => event.emit('error', data));
    minecraft.on('close', (code) => event.emit('close', code));
};