import { LauncherOptions, Client } from './Launcher';
import Request, { Response } from 'request';
import { exec, ExecException } from 'child_process';
import { mkdir, rm } from 'shelljs';
import { copyFileSync, createWriteStream, existsSync, readdirSync, writeFileSync } from 'fs';
import { join, sep } from 'path';
import checksum from 'checksum';
import AdmZip from 'adm-zip';
import { Events } from './Constants';

let counter = 0;

/**
 * Internal function handler
 */
export class Handler {
  public client: Client;
  public options: LauncherOptions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public version?: any;
  private readonly baseRequest: Request.RequestAPI<Request.Request, Request.CoreOptions, Request.RequiredUriUrl>;

  constructor(client: Client) {
    this.client = client;
    this.options = client.options as LauncherOptions;
    this.version = undefined;
    this.baseRequest = Request.defaults({
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      pool: { maxSockets: this.options.overrides.maxSockets || 2 },
      timeout: this.options.timeout || 10000,
    });
  }

  /**
   * Checks if Java is valid
   * @param {string} java Path to Java executable
   * @returns {Promise<{run: boolean, message: ExecException?}>}
   */
  checkJava(java: string): Promise<{ run: boolean; message?: ExecException }> {
    return new Promise<{ run: boolean; message?: ExecException }>(resolve => {
      exec(`${java} -version`, (error, _, stderr) => {
        if (error) {
          resolve({
            run: false,
            message: error,
          });
        }
        this.client.emit('debug', `[MCLC]: Using Java version ${(stderr.match(/"(.*?)"/) || []).pop()} ${stderr.includes('64-Bit') ? '64-bit' : '32-Bit'}`);
        resolve({
          run: true,
        });
      });
    });
  }

  /**
   * Downloads a file
   * @param {string} url URL
   * @param {string} directory Output directory
   * @param {string} name File name
   * @param {boolean} retry whether to retry or not
   * @param {*} type /shrug
   * @returns {Promise<void | {failed: boolean, asset: *}>}
   */
  downloadAsync(url: string, directory: string, name: string, retry: boolean, type: any): Promise<void | { failed: boolean; asset: unknown }> {
    return new Promise(resolve => {
      mkdir('-p', directory);

      const _request = this.baseRequest(url);

      let receivedBytes = 0;
      let totalBytes = 0;

      _request.on('response', data => {
        totalBytes = parseInt(data.headers['content-length'] as string);
      });

      _request.on('error', async error => {
        this.client.emit('debug', `[MCLC]: Failed to download asset to ${join(directory, name)} due to\n${error}. Retrying... ${retry}`);
        if (retry) await this.downloadAsync(url, directory, name, false, type);
        resolve();
      });

      _request.on('data', data => {
        receivedBytes += data.length;
        this.client.emit('download-status', {
          name: name,
          type: type,
          current: receivedBytes,
          total: totalBytes,
        });
      });

      const file = createWriteStream(join(directory, name));
      _request.pipe(file);

      file.once('finish', () => {
        this.client.emit('download', name);
        resolve({
          failed: false,
          asset: null,
        });
      });

      file.on('error', async e => {
        this.client.emit('debug', `[MCLC]: Failed to download asset to ${join(directory, name)} due to\n${e}. Retrying... ${retry}`);
        if (existsSync(join(directory, name))) rm(join(directory, name));
        if (retry) await this.downloadAsync(url, directory, name, false, type);
        resolve();
      });
    });
  }

  /**
   * Checks if a file's hash is the same as the one provided
   * @param {string} hash Hash
   * @param {string} file File to check the hash against
   * @returns {Promise<boolean>}
   */
  checkSum(hash: string, file: string): Promise<boolean> {
    return new Promise(resolve => {
      checksum.file(file, (_, sum) => resolve(hash === sum));
    });
  }

  /**
   * Gets the version of Minecraft specified in the options
   * @returns {Promise<Object>}
   */
  getVersion(): Promise<any> {
    return new Promise(resolve => {
      const overrides = this.options.overrides as { versionJson: string; url: { meta: string } };
      const versionJsonPath = overrides.versionJson || join(this.options.directory as string, `${this.options.version.number}.json`);
      if (existsSync(versionJsonPath)) {
        this.version = require(versionJsonPath);
        resolve(this.version);
        return;
      }

      const manifest = `${overrides.url.meta}/mc/game/version_manifest.json`;
      Request.get(manifest, (error, _, body) => {
        if (error) resolve(error);

        const parsed = JSON.parse(body);

        for (const desiredVersion in parsed.versions) {
          if (parsed.versions[desiredVersion].id === this.options.version.number) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Request.get(parsed.versions[desiredVersion].url, (_error: any, __: Response, _body: any) => {
              if (_error) resolve(_error);

              this.client.emit('debug', `[MCLC]: Parsed version from version manifest`);
              this.version = JSON.parse(_body);
              resolve(this.version);
            });
          }
        }
      });
    });
  }

  /**
   * Gets the jar for the specified version
   * @returns {Promise<void>}
   */
  getJar(): Promise<void> {
    return new Promise(async resolve => {
      await this.downloadAsync(this.version.downloads.client.url, this.options.directory as string, `${this.options.version.number}.jar`, true, 'version-jar');

      writeFileSync(join(this.options.directory as string, `${this.options.version.number}.json`), JSON.stringify(this.version, null, 4));

      this.client.emit('debug', '[MCLC]: Downloaded version jar and wrote version json');

      resolve();
    });
  }

  /**
   * Fetches the assets for the version of Minecraft specified in options
   * @returns {Promise<void>}
   */
  getAssets(): Promise<void> {
    return new Promise(async resolve => {
      if (!existsSync(join(this.options.root, 'assets', 'indexes', `${this.version.assetIndex.id}.json`))) {
        await this.downloadAsync(this.version.assetIndex.url, join(this.options.root, 'assets', 'indexes'),
          `${this.version.assetIndex.id}.json`, true, 'asset-json');
      }

      const index = require(join(this.options.root, 'assets', 'indexes', `${this.version.assetIndex.id}.json`));

      this.client.emit('progress', {
        type: 'assets',
        task: 0,
        total: Object.keys(index.objects).length,
      });

      await Promise.all(Object.keys(index.objects).map(async asset => {
        const hash = index.objects[asset].hash;
        const subhash = hash.substring(0, 2);
        const assetDirectory = (this.options.overrides as { assetRoot: string }).assetRoot || join(this.options.root, 'assets');
        const subAsset = join(assetDirectory, 'objects', subhash);

        if (!existsSync(join(subAsset, hash)) || !await this.checkSum(hash, join(subAsset, hash))) {
          await this.downloadAsync(`${(this.options.overrides as { url: { resource: string }}).url.resource}/${subhash}/${hash}`, subAsset, hash,
            true, 'assets');
          counter += 1;
          this.client.emit('progress', {
            type: 'assets',
            task: counter,
            total: Object.keys(index.objects).length,
          });
        }
      }));
      counter = 0;

      // Copy assets to legacy if it's an older Minecraft version.
      if (this.version.assets === 'legacy' || this.version.assets === 'pre-1.6') {
        const assetDirectory = (this.options.overrides as { assetRoot: string }).assetRoot || join(this.options.root, 'assets');
        this.client.emit('debug', `[MCLC]: Copying assets over to ${join(assetDirectory, 'legacy')}`);

        this.client.emit('progress', {
          type: 'assets-copy',
          task: 0,
          total: Object.keys(index.objects).length,
        });

        await Promise.all(Object.keys(index.objects).map(async asset => {
          const hash = index.objects[asset].hash;
          const subhash = hash.substring(0, 2);
          const subAsset = join(assetDirectory, 'objects', subhash);

          const legacyAsset = asset.split('/');
          legacyAsset.pop();

          if (!existsSync(join(assetDirectory, 'legacy', legacyAsset.join('/')))) {
            mkdir('-p', join(assetDirectory, 'legacy', legacyAsset.join('/')));
          }

          if (!existsSync(join(assetDirectory, 'legacy', asset))) {
            copyFileSync(join(subAsset, hash), join(assetDirectory, 'legacy', asset));
          }
          counter += 1;
          this.client.emit('progress', {
            type: 'assets-copy',
            task: counter,
            total: Object.keys(index.objects).length,
          });
        }));
      }
      counter = 0;

      this.client.emit('debug', '[MCLC]: Downloaded assets');
      resolve();
    });
  }

  /**
   * Major Yikes
   * @param {*} lib yikes
   * @returns {Boolean}
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parseRule(lib: any): boolean {
    if (lib.rules) {
      if (lib.rules.length > 1) {
        if (lib.rules[0].action === 'allow' && lib.rules[1].action === 'disallow' && lib.rules[1].os.name === 'osx') {
          return this.getOS() === 'osx';
        } else {
          return true;
        }
      } else if (lib.rules[0].action === 'allow' && lib.rules[0].os) { return this.getOS() !== 'osx'; }
    } else {
      return false;
    }
    return false;
  }

  /**
   * Yikes
   * @returns {Promise<string>}
   */
  getNatives(): Promise<string> {
    return new Promise(async resolve => {
      const nativeDirectory = (this.options.overrides as { natives: string }).natives || join(this.options.root, 'natives', this.version.id) as string;

      if (!existsSync(nativeDirectory) || !readdirSync(nativeDirectory).length) {
        mkdir('-p', nativeDirectory);

        const natives = (): Promise<Array<any>> => new Promise(async _resolve => {
          const _natives: Array<any> = [];
          await Promise.all(this.version.libraries.map(async (lib: { downloads: { classifiers: { [x: string]: any } } }) => {
            if (!lib.downloads.classifiers) return;
            if (this.parseRule(lib)) return;

            const native = this.getOS() === 'osx' ?
              lib.downloads.classifiers['natives-osx'] || lib.downloads.classifiers['natives-macos'] :
              lib.downloads.classifiers[`natives-${this.getOS()}`];

            _natives.push(native);
          }));
          _resolve(_natives);
        });
        const stat = await natives();

        this.client.emit('progress', {
          type: 'natives',
          task: 0,
          total: stat.length,
        });

        await Promise.all(stat.map(async native => {
          const name = native.path.split('/').pop();
          await this.downloadAsync(native.url, nativeDirectory, name, true, 'natives');
          if (!await this.checkSum(native.sha1, join(nativeDirectory, name))) {
            await this.downloadAsync(native.url, nativeDirectory, name, true, 'natives');
          }
          try {
            new AdmZip(join(nativeDirectory, name)).extractAllTo(nativeDirectory, true);
          } catch (e) {
            // Only doing a console.warn since a stupid error happens. You can basically ignore this.
            // if it says Invalid file name, just means two files were downloaded and both were deleted.
            // All is well.
            console.warn(e);
          }
          rm(join(nativeDirectory, name));
          counter += 1;
          this.client.emit('progress', {
            type: 'natives',
            task: counter,
            total: stat.length,
          });
        }));
        this.client.emit('debug', '[MCLC]: Downloaded and extracted natives');
      }

      counter = 0;
      this.client.emit('debug', `[MCLC]: Set native path to ${nativeDirectory}`);
      resolve(nativeDirectory);
    });
  }

  /**
   * Fetches forge dependencies
   * @returns {Promise<{paths: *[], forge: *} | null>}
   */
  async getForgeDependenciesLegacy(): Promise<{ paths: Array<any>; forge: any } | null> {
    if (!existsSync(join(this.options.root, 'forge'))) {
      mkdir('-p', join(this.options.root, 'forge'));
    }

    try {
      await new AdmZip(this.options.forge).extractEntryTo('version.json', join(this.options.root, 'forge', `${this.version.id}`), false, true);
    } catch (e) {
      this.client.emit('debug', `[MCLC]: Unable to extract version.json from the forge jar due to ${e}`);
      return null;
    }

    const forge = require(join(this.options.root, 'forge', `${this.version.id}`, 'version.json'));
    const paths: Array<any> = [];

    this.client.emit('progress', {
      type: 'forge',
      task: 0,
      total: forge.libraries.length,
    });

    await Promise.all(forge.libraries.map(async (library: any) => {
      const lib = library.name.split(':');

      if (lib[0] === 'net.minecraftforge' && lib[1].includes('forge')) return;

      let url = (this.options.overrides as any).url.mavenForge;
      const jarPath = join(this.options.root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
      const name = `${lib[1]}-${lib[2]}.jar`;

      if (!library.url) {
        if (library.serverreq || library.clientreq) {
          url = (this.options.overrides as any).url.defaultRepoForge;
        } else {
          return;
        }
      }

      const downloadLink = `${url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${lib[1]}-${lib[2]}.jar`;

      if (existsSync(join(jarPath, name))) {
        paths.push(`${jarPath}${sep}${name}`);
        counter += 1;
        this.client.emit('progress', { type: 'forge', task: counter, total: forge.libraries.length });
        return;
      }
      if (!existsSync(jarPath)) mkdir('-p', jarPath);

      await this.downloadAsync(downloadLink, jarPath, name, true, 'forge');

      paths.push(`${jarPath}${sep}${name}`);
      counter += 1;
      this.client.emit('progress', {
        type: 'forge',
        task: counter,
        total: forge.libraries.length,
      });
    }));

    counter = 0;
    this.client.emit('debug', '[MCLC]: Downloaded Forge dependencies');

    return { paths, forge };
  }

  /**
   * Runs the forge installer?
   * @param {string} path Path to the installer?
   * @returns {Promise<void>}
   */
  runInstaller(path: string): Promise<void> {
    return new Promise(resolve => {
      const installer = exec(path);
      installer.on('close', () => resolve());
    });
  }

  /**
   * Gets classes?
   * @returns {Promise<Array<*>>}
   */
  getClasses(): Promise<Array<any>> {
    return new Promise(async resolve => {
      const libs: Array<any> = [];

      if (this.options.version.custom) {
        const customJarJson = require(join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.json`));

        this.client.emit(Events.PROGRESS, {
          type: 'classes-custom',
          task: 0,
          total: customJarJson.libraries.length,
        });

        await Promise.all(customJarJson.libraries.map(async (library: any) => {
          const lib = library.name.split(':');

          const jarPath = join(this.options.root, 'libraries', `${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}`);
          const name = `${lib[1]}-${lib[2]}.jar`;

          if (!existsSync(join(jarPath, name))) {
            if (library.url) {
              const url = `${library.url}${lib[0].replace(/\./g, '/')}/${lib[1]}/${lib[2]}/${lib[1]}-${lib[2]}.jar`;
              await this.downloadAsync(url, jarPath, name, true, 'classes-custom');
            }
          }
          counter += 1;
          this.client.emit(Events.PROGRESS, {
            type: 'classes-custom',
            task: counter,
            total: customJarJson.libraries.length,
          });
          libs.push(`${jarPath}${sep}${name}`);
        }));
        counter = 0;
      }

      const parsedClasses = (): Promise<Array<any>> => new Promise(async _resolve => {
        const classes: Array<any> = [];
        await Promise.all(this.version.libraries.map(async (_lib: any) => {
          if (!_lib.downloads.artifact) return;
          if (this.parseRule(_lib)) return;

          classes.push(_lib);
        }));
        _resolve(classes);
      });
      const parsed = await parsedClasses();

      this.client.emit(Events.PROGRESS, {
        type: 'classes',
        task: 0,
        total: parsed.length,
      });

      await Promise.all(parsed.map(async _lib => {
        const libraryPath = _lib.downloads.artifact.path;
        const libraryUrl = _lib.downloads.artifact.url;
        const libraryHash = _lib.downloads.artifact.sha1;
        const libraryDirectory = join(this.options.root, 'libraries', libraryPath);

        if (!existsSync(libraryDirectory) || !await this.checkSum(libraryHash, libraryDirectory)) {
          let directory: string | Array<string> = libraryDirectory.split(sep);
          const name = directory.pop() as string;
          directory = directory.join(sep);

          await this.downloadAsync(libraryUrl, directory, name, true, 'classes');
        }
        counter += 1;
        this.client.emit(Events.PROGRESS, {
          type: 'classes',
          task: counter,
          total: parsed.length,
        });
        libs.push(libraryDirectory);
      }));
      counter = 0;

      this.client.emit(Events.DEBUG, '[MCLC]: Collected class paths');
      resolve(libs);
    });
  }

  static cleanUp(array: Array<any>) {
    return new Promise(resolve => {
      const newArray: Array<any> = [];

      for (const classPath in array) {
        if (newArray.includes(array[classPath])) continue;
        newArray.push(array[classPath]);
      }
      resolve(newArray);
    });
  }

  getLaunchOptions(modification: any): Promise<Array<string>> {
    return new Promise(async resolve => {
      const type = modification || this.version;

      let args = type.minecraftArguments ? type.minecraftArguments.split(' ') : type.arguments.game;
      const assetRoot = (this.options.overrides as any).assetRoot || join(this.options.root, 'assets');
      const assetPath = this.version.assets === 'legacy' || this.version.assets === 'pre-1.6' ? join(assetRoot, 'legacy') : join(assetRoot);

      const minArgs = (this.options.overrides as any).minArgs || 5;
      if (args.length < minArgs) args = args.concat(this.version.minecraftArguments ? this.version.minecraftArguments.split(' ') : this.version.arguments.game);

      this.options.authorization = await Promise.resolve(this.options.authorization);

      const fields: {[key: string]: string} = {
        '${auth_access_token}': this.options.authorization.access_token,
        '${auth_session}': this.options.authorization.access_token,
        '${auth_player_name}': this.options.authorization.name,
        '${auth_uuid}': this.options.authorization.uuid,
        '${user_properties}': this.options.authorization.user_properties,
        '${user_type}': 'mojang',
        '${version_name}': this.options.version.number,
        '${assets_index_name}': this.version.assetIndex.id,
        '${game_directory}': this.options.root,
        '${assets_root}': assetPath,
        '${game_assets}': assetPath,
        '${version_type}': this.options.version.type,
      };

      for (let index = 0; index < args.length; index++) {
        if (typeof args[index] === 'object') args.splice(index, 2);
        if (Object.keys(fields).includes(args[index])) {
          args[index] = fields[args[index]];
        }
      }

      if (this.options.window) args.push('--width', this.options.window.width, '--height', this.options.window.height);
      if (this.options.server) args.push('--server', this.options.server.host, '--port', this.options.server.port || '25565');
      if (this.options.proxy) {
        args.push(
          '--proxyHost',
          this.options.proxy.host,
          '--proxyPort',
          this.options.proxy.port || '8080',
          '--proxyUser',
          this.options.proxy.username,
          '--proxyPass',
          this.options.proxy.password
        );
      }

      this.client.emit(Events.DEBUG, '[MCLC]: Set launch options');
      resolve(args);
    });
  }

  /**
   * Gets the JVM args best suited for the current os
   * @returns {string}
   */
  getJVM(): string {
    const opts: {[key: string]: string} = {
      windows: '-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump',
      osx: '-XstartOnFirstThread',
      linux: '-Xss1M',
    };
    return opts[this.getOS()];
  }

  /**
   * Gets the current system os in user friendly terms
   * @returns {string}
   */
  getOS(): string {
    if (this.options.os) {
      return this.options.os;
    } else {
      switch (process.platform) {
        case 'win32': return 'windows';
        case 'darwin': return 'osx';
        default: return 'linux';
      }
    }
  }

  /**
   * Extracts the client package
   * @param {LauncherOptions?} options Client options
   * @returns {Promise<void>}
   */
  extractPackage(options = this.options): Promise<void> {
    return new Promise(async resolve => {
      if ((options.clientPackage as string).startsWith('http')) {
        await this.downloadAsync(options.clientPackage as string, options.root, 'clientPackage.zip', true, 'client-package');
        options.clientPackage = join(options.root, 'clientPackage.zip');
      }
      new AdmZip(options.clientPackage).extractAllTo(options.root, true);
      this.client.emit(Events.PACKAGE_EXTRACT, true);
      if (options.removePackage) rm(options.clientPackage as string);
      resolve();
    });
  }
}
