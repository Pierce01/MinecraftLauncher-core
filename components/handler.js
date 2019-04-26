const fs =  require('fs');
const shelljs = require('shelljs');
const path = require('path');
const request = require('request');
const zip = require('adm-zip');
const event = require('./events');


function downloadAsync (url, directory, name) {
    return new Promise(resolve => {
        shelljs.mkdir('-p', directory);

        const _request = request(url, {timeout: 10000});

        _request.on('error', function(error) {
            resolve({
                failed: true,
                asset: {
                    url: url,
                    directory: directory,
                    name: name
                }
            });
        });

        _request.on('data', (data) => {
            let size = 0;
            if(fs.existsSync(path.join(directory, name))) size = fs.statSync(path.join(directory, name))["size"];
            event.emit('download-status', {
                "name": name,
                "current": Math.round(size / 10000),
                "total": data.length
            })
        });

        const file = fs.createWriteStream(path.join(directory, name));
        _request.pipe(file);

        file.once('finish', function() {
            event.emit('download', name);
            resolve({failed: false, asset: null});
        });
    });
}

module.exports.getVersion = function (version, directory) {
    return new Promise(resolve => {
        if(fs.existsSync(path.join(directory, `${version}.json`))) resolve(require(path.join(directory, `${version}.json`)));

        const manifest = "https://launchermeta.mojang.com/mc/game/version_manifest.json";
        request.get(manifest, function(error, response, body) {
            if (error) resolve(error);

            const parsed = JSON.parse(body);

            for (const desiredVersion in parsed.versions) {
                if(parsed.versions[desiredVersion].id === version) {
                    request.get(parsed.versions[desiredVersion].url, function(error, response, body) {
                        if (error) resolve(error);

                        resolve(JSON.parse(body));
                    });
                }
            }
        });
    });
};

module.exports.getJar = function (version, number, directory) {
    return new Promise(async (resolve)=> {
        await downloadAsync(version.downloads.client.url, directory, `${number}.jar`);

        fs.writeFileSync(path.join(directory, `${number}.json`), JSON.stringify(version, null, 4));

        resolve();
    });
};

module.exports.getAssets = function (directory, version) {
    return new Promise(async(resolve) => {
        const assetsUrl = 'https://resources.download.minecraft.net';
        const failed = [];

        if(!fs.existsSync(path.join(directory, 'assets', 'indexes', `${version.assetIndex.id}.json`))) {
            await downloadAsync(version.assetIndex.url, path.join(directory, 'assets', 'indexes'), `${version.assetIndex.id}.json`);
        }

        const index = require(path.join(directory, 'assets', 'indexes',`${version.assetIndex.id}.json`));

        const mainAssetsDownload = Object.keys(index.objects).map(async asset => {
            const hash = index.objects[asset].hash;
            const subhash = hash.substring(0,2);
            const assetDirectory = path.join(directory, 'assets', 'objects', subhash);

            if(!fs.existsSync(path.join(assetDirectory, hash))) {
                const download = await downloadAsync(`${assetsUrl}/${subhash}/${hash}`, assetDirectory, hash);

                if(download.failed) failed.push(download.asset);
            }
        });

        await Promise.all(mainAssetsDownload);

        // why do we have this? B/c sometimes Minecraft's resource site times out!
        if(failed) {
            for (const fail of failed) await downloadAsync(fail.url, fail.directory, fail.name);
        }

        // Copy assets to legacy if it's an older Minecarft version.
        if(version.assets === "legacy" || version.assets === "pre-1.6") {
            const legacyCopy = Object.keys(index.objects).map(async asset => {
                const hash = index.objects[asset].hash;
                const subhash = hash.substring(0,2);
                const assetDirectory = path.join(directory, 'assets', 'objects', subhash);

                let legacyAsset = asset.split('/');
                legacyAsset.pop();

                if(!fs.existsSync(path.join(directory, 'assets', 'legacy', legacyAsset.join('/')))) {
                    shelljs.mkdir('-p', path.join(directory, 'assets', 'legacy', legacyAsset.join('/')));
                }

                if (!fs.existsSync(path.join(directory, 'assets', 'legacy', asset))) {
                    fs.copyFileSync(path.join(assetDirectory, hash), path.join(directory, 'assets', 'legacy', asset))
                }
            });

            await Promise.all(legacyCopy);
        }

        resolve();
    });
};

module.exports.getNatives = function (root, version, os) {
    return new Promise(async(resolve) => {
        let nativeDirectory;

        if(fs.existsSync(path.join(root, 'natives', version.id))) {
            nativeDirectory = path.join(root, 'natives', version.id);
        } else {
            nativeDirectory = path.join(root, "natives", version.id);

            shelljs.mkdir('-p', nativeDirectory);

            const download = version.libraries.map(async function (lib) {
                if (!lib.downloads.classifiers) return;
                const type = `natives-${os}`;
                const native = lib.downloads.classifiers[type];

                if (native) {
                    const name = native.path.split('/').pop();
                    await downloadAsync(native.url, nativeDirectory, name);
                    try {new zip(path.join(nativeDirectory, name)).extractAllTo(nativeDirectory, true);} catch(e) {
                        // Only doing a console.warn since a stupid error happens. You can basically ignore this.
                        // if it says Invalid file name, just means two files were downloaded and both were deleted.
                        // All is well.
                        console.warn(e);
                    }
                    shelljs.rm(path.join(nativeDirectory, name));
                }
            });

            await Promise.all(download);
        }

        resolve(nativeDirectory);
    });
};

module.exports.getForgeDependencies = async function(root, version, forgeJarPath) {
    if(!fs.existsSync(path.join(root, 'forge'))) {
        shelljs.mkdir('-p', path.join(root, 'forge'));
    }
    await new zip(forgeJarPath).extractEntryTo('version.json', path.join(root, 'forge', `${version.id}`), false, true);

    const forge = require(path.join(root, 'forge', `${version.id}`, 'version.json'));
    const forgeLibs = forge.libraries;
    const mavenUrl = 'http://files.minecraftforge.net/maven/';
    const defaultRepo = 'https://libraries.minecraft.net/';
    const paths = [];

    const download = forgeLibs.map(async library => {
        const lib = library.name.split(':');

        if(lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) return;

        let url = mavenUrl;
        const jarPath = path.join(root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
        const name = `${lib[1]}-${lib[2]}.jar`;

        if(!library.url) {
            if(library.serverreq || library.clientreq) {
                url = defaultRepo;
            } else {
                return
            }
        }

        const downloadLink = `${url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${lib[1]}-${lib[2]}.jar`;

        if(fs.existsSync(path.join(jarPath, name))) {
            paths.push(`${jarPath}\\${name}`);
            return;
        }
        if(!fs.existsSync(jarPath)) shelljs.mkdir('-p', jarPath);

        await downloadAsync(downloadLink, jarPath, name);

        paths.push(`${jarPath}\\${name}`);
    });

    await Promise.all(download);

    return {paths, forge};
};

module.exports.getClasses = function (options, version) {
    return new Promise(async (resolve) => {
        const libs = [];

        if(options.version.custom) {
            const customJarJson = require(path.join(options.root, 'versions', options.version.custom, `${options.version.custom}.json`));
            customJarJson.libraries.map(library => {
                const lib = library.name.split(':');

                const jarPath = path.join(options.root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
                const name = `${lib[1]}-${lib[2]}.jar`;

                libs.push(`${jarPath}\\${name}`);
            })
        }

        const libraries = version.libraries.map(async (_lib) => {
            if(!_lib.downloads.artifact) return;

            const libraryPath = _lib.downloads.artifact.path;
            const libraryUrl = _lib.downloads.artifact.url;
            const libraryDirectory = path.join(options.root, 'libraries', libraryPath);

            if(!fs.existsSync(libraryDirectory)) {
                let directory = libraryDirectory.split('\\');
                const name = directory.pop();
                directory = directory.join('\\');

                await downloadAsync(libraryUrl, directory, name);
            }

            libs.push(libraryDirectory);
        });

        await Promise.all(libraries);

        resolve(libs)
    });
};

module.exports.getLaunchOptions = function (version, modification, options) {
    return new Promise(resolve => {
        let type = modification || version;

        let arguments = type.minecraftArguments ? type.minecraftArguments.split(' ') : type.arguments.game;
        const assetPath = version.assets === "legacy" || version.assets === "pre-1.6" ? path.join(options.root, 'assets', 'legacy') : path.join(options.root, 'assets');

        if(arguments.length < 5) arguments = arguments.concat(version.minecraftArguments ? version.minecraftArguments.split(' ') : version.arguments.game);

        const fields = {
            '${auth_access_token}': options.authorization.access_token,
            '${auth_session}': options.authorization.access_token,
            '${auth_player_name}': options.authorization.name,
            '${auth_uuid}': options.authorization.uuid,
            '${user_properties}': options.authorization.user_properties,
            '${user_type}': 'mojang',
            '${version_name}': options.version.number,
            '${assets_index_name}': version.assetIndex.id,
            '${game_directory}': path.join(options.root),
            '${assets_root}': assetPath,
            '${game_assets}': assetPath,
            '${version_type}': options.version.type
        };

        for (let index = 0; index < arguments.length; index++) {
            if (Object.keys(fields).includes(arguments[index])) {
                arguments[index] = fields[arguments[index]];
            }
        }

        if(options.server) arguments.push('--server', options.server.host, '--port', options.server.port || "25565");
        if(options.proxy) arguments.push(
            '--proxyHost',
            options.proxy.host,
            '--proxyPort',
            options.proxy.port || "8080",
            '--proxyUser',
            options.proxy.username,
            '--proxyPass',
            options.proxy.password
        );

        resolve(arguments);
    });
};

module.exports.getJVM = function (version, options) {
    return new Promise(resolve => {
        switch(options.os) {
            case "windows": {
                resolve("-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump");
                break;
            }
            case "osx": {
                resolve("-XstartOnFirstThread");
                break;
            }
            case "linux": {
                resolve("-Xss1M");
                break;
            }
        }
    });
};

module.exports.makePackage = async function(versions, os) {
    const directory = path.join(process.cwd(), 'clientpackage');

    for(const version in versions) {
        const versionFile = await this.getVersion(versions[version], directory);
        await this.getNatives(`${directory}/natives/${versions[version]}`, versionFile, os, true);
        await this.getJar(versionFile, versions[version], `${directory}/versions/${versions[version]}`);
        await this.getClasses(directory, versionFile);
        await this.getAssets(directory, versionFile);
    }

    const archive = new zip();
    archive.addLocalFolder(directory);
    archive.writeZip(`${directory}.zip`);
};

module.exports.extractPackage = function(root, clientPackage) {
    return new Promise(async resolve => {
        if(clientPackage.startsWith('http')) {
            await downloadAsync(clientPackage, root, "clientPackage.zip");
            clientPackage = path.join(root, "clientPackage.zip")
        }
        new zip(clientPackage).extractAllTo(root, true);
        event.emit('package-extract', true);
        resolve();
    });
};
