const child = require('child_process');
const event = require('./events');
const path = require('path');
const handler = require('./handler');
const fs = require('fs');


module.exports = async function (options) {
    options.root = path.resolve(options.root);
    if(!fs.existsSync(options.root)) {
        event.emit('debug', '[MCLC]: Attempting to create root folder');
        fs.mkdirSync(options.root);
    }

    if(options.clientPackage) {
        event.emit('debug', `[MCLC]: Extracting client package to ${options.root}`);
        await handler.extractPackage(options.root, options.clientPackage);
    }

    const directory = path.join(options.root, 'versions', options.version.number);
    options.directory = directory;
    const versionFile = await handler.getVersion(options.version.number, options.directory);
    const mcPath = options.version.custom ? path.join(options.root, 'versions', options.version.custom , `${options.version.custom}.jar`):
        path.join(directory, `${options.version.number}.jar`);
    const nativePath = await handler.getNatives(options.root, versionFile, options.os);

    if (!fs.existsSync(mcPath)) {
        event.emit('debug', '[MCLC]: Attempting to download Minecraft version jar');
        await handler.getJar(versionFile, options.version.number, directory);
    }

    let forge = null;
    let custom = null;
    if(options.forge) {
        event.emit('debug', '[MCLC]: Detected Forge in options, getting dependencies');
        forge = await handler.getForgeDependencies(options.root, versionFile, options.forge.path);
    }
    if(options.version.custom) {
        event.emit('debug', '[MCLC]: Detected custom in options, setting custom version file');
        custom = require(path.join(options.root, 'versions', options.version.custom, `${options.version.custom}.json`));
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
        `-Xms${options.memory.min}M`
    ];
    jvm.push(await handler.getJVM(versionFile, options));
    if(options.customArgs) jvm = jvm.concat(options.customArgs);

    const classes = await handler.getClasses(options, versionFile);
    const classPaths = ['-cp'];
    const separator = options.os === "windows" ? ";" : ":";
    event.emit('debug', `[MCLC]: Using ${separator} to separate class paths`);
    if(forge) {
        event.emit('debug', '[MCLC]: Setting Forge class paths');
        classPaths.push(`${options.forge.path}${separator}${forge.paths.join(separator)}${separator}${classes.join(separator)};${mcPath}`);
        classPaths.push(forge.forge.mainClass)
    } else {
        classPaths.push(`${mcPath}${separator}${classes.join(separator)}`);
        classPaths.push(versionFile.mainClass || custom.mainClass);
    }

    // Download version's assets
    event.emit('debug', '[MCLC]: Attempting to download assets');
    await handler.getAssets(options.root, versionFile);

    // Launch options. Thank you Lyrus for the reformat <3
    const modification = forge ? forge.forge : null || custom ? custom : null;
    const launchOptions = await handler.getLaunchOptions(versionFile, modification, options);

    const launchArguments = args.concat(jvm, classPaths, launchOptions);
    event.emit('arguments', launchArguments);
    event.emit('debug', launchArguments.join(' '));

    const minecraft = child.spawn(options.javaPath ? options.javaPath : 'java', launchArguments);
    minecraft.stdout.on('data', (data) => event.emit('data', data));
    minecraft.stderr.on('data', (data) => event.emit('error', data));
    minecraft.on('close', (code) => event.emit('close', code));
};