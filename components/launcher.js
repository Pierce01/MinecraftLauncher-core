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

    let forge = null;
    if(options.forge) {
        forge = await handler.getForgeDependencies(options.root, versionFile, options.forge.path);
    }

    const args = [];

    // Jvm
    let jvm = [
        '-XX:-UseAdaptiveSizePolicy',
        '-XX:-OmitStackTraceInFastThrow',
        '-Dfml.ignorePatchDiscrepancies=true',
        '-Dfml.ignoreInvalidMinecraftCertificates=true',
        `-Djava.library.path=${nativePath}`,
        `-Xmx${options.memory.max}M`,
        `-Xms${options.memory.min}M`,
        '-Xincgc'
    ];
    jvm.push(await handler.getJVM(versionFile, options));
    if(options.customArgs) jvm = jvm.concat(options.customArgs);

    const classes = await handler.getClasses(options.root, versionFile);
    const classPaths = ['-cp'];
    if(forge) {
        classPaths.push(`${options.forge.path};${forge.paths.join(';')};${classes.join(';')};${mcPath}`);
        classPaths.push(forge.forge.mainClass)
    } else {
        classPaths.push(`${mcPath};${classes.join(";")}`);
        classPaths.push(versionFile.mainClass);
    }

    // Download version's assets
    await handler.getAssets(options.root, versionFile);

    // Launch options. Thank you Lyrus for the reformat <3
    let launchOptions;
    launchOptions = await handler.getLaunchOptions(versionFile, forge ? forge.forge : null, options);

    const launchArguments = args.concat(jvm, classPaths, launchOptions);

    const minecraft = child.spawn(`java`, launchArguments);
    event.emit('start', null);
    minecraft.stdout.on('data', (data) => event.emit('data', data));
    minecraft.stderr.on('data', (data) => event.emit('error', data));
    minecraft.on('close', (code) => event.emit('close', code));
};