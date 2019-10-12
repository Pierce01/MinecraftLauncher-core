import { EventEmitter } from 'events';
import { join, resolve } from 'path';
import { Handler } from './Handler';
import { Events } from './Constants';

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';

const { version } = require('../../package.json');

/**
 * Launcher Options
 * @typedef {LauncherOptions}
 */
export interface LauncherOptions {
  cleanPackage?: any;
  authorization?: any;
  clientPackage?: string;
  removePackage?: boolean;
  installer?: string;
  root: string;
  directory?: string;
  os?: string;
  customArgs?: Array<string>;
  version: {
    number: string;
    type: string;
    custom?: string;
  };
  memory: {
    max: string;
    min: string;
  };
  forge?: string;
  javaPath?: string;
  server?: {
    host?: string;
    port?: string;
  };
  proxy?: {
    host?: string;
    port?: string;
    username?: string;
    password?: string;
  };
  timeout?: number;
  window?: {
    width?: string;
    height?: string;
  };
  overrides?: {
    minecraftJar?: string;
    versionJson?: string;
    directory?: string;
    natives?: string;
    assetRoot?: string;
    cwd?: string;
    classes?: Array<string>;
    minArgs?: number;
    maxSockets?: number;
    url?: {
      meta?: string;
      resource?: string;
      mavenForge?: string;
      defaultRepoForge?: string;
    };
  };
}

/**
 * MinecraftLauncher client
 * @extends {EventEmitter}
 * @property {LauncherOptions} options
 * @property {handler} handler
 */
export class Client extends EventEmitter {
  public options?: LauncherOptions;
  public handler?: Handler;

  /**
   * Launches Minecraft
   * @param {LauncherOptions} options Options to start the game with
   * @returns {Promise<ChildProcessWithoutNullStreams | null>}
   */
  // eslint-disable-next-line complexity
  async launch(options: LauncherOptions): Promise<ChildProcessWithoutNullStreams | null> {
    this.options = options;
    this.options.root = resolve(this.options.root);

    if (!this.options.overrides) this.options.overrides = { url: {} };
    if (!this.options.overrides.url) this.options.overrides.url = {};
    this.options.overrides.url = {
      meta: this.options.overrides.url.meta || 'https://launchermeta.mojang.com',
      resource: this.options.overrides.url.resource || 'https://resources.download.minecraft.net',
      mavenForge: this.options.overrides.url.mavenForge || 'http://files.minecraftforge.net/maven/',
      defaultRepoForge: this.options.overrides.url.defaultRepoForge || 'https://libraries.minecraft.net/',
    };

    this.handler = new Handler(this);
    await (() => null)();

    this.emit(Events.DEBUG, `[MCLC]: MCLC version ${version}`);
    const java = await this.handler.checkJava(this.options.javaPath || 'java');
    if (!java.run) {
      this.emit(Events.DEBUG, `[MCLC: Couldn't start Minecraft due to ${java.message}`);
      this.emit(Events.CLOSE, 1);
      return null;
    }

    if (!existsSync(this.options.root)) {
      this.emit(Events.DEBUG, `[MCLC]: Attempting to create root folder at ${this.options.root}`);
      mkdirSync(this.options.root);
    }

    if (this.options.cleanPackage) {
      this.emit(Events.DEBUG, `[MCLC]: Extracting client package to ${this.options.root}`);
      await this.handler.extractPackage();
    }

    if (this.options.installer) {
      // So the forge installer can run without breaking :)
      const profilePath = join(this.options.root, 'launcher_profiles.json');
      if (!existsSync(profilePath)) writeFileSync(profilePath, JSON.stringify({}, null, 4));
      await this.handler.runInstaller(this.options.installer);
    }

    const directory = this.options.overrides.directory || join(this.options.root, 'versions', this.options.version.number);
    this.options.directory = directory;

    // Version JSON for the main launcher folder
    const versionFile = await this.handler.getVersion();
    const mcPath = this.options.overrides.minecraftJar || (this.options.version.custom ?
      join(this.options.version.custom, `${this.options.version.custom}.jar`) :
      join(directory, `${this.options.version.number}.jar`));
    const nativePath = await this.handler.getNatives();

    if (!existsSync(mcPath)) {
      this.emit(Events.DEBUG, '[MCLC]: Attempting to download Minecraft version jar');
      await this.handler.getJar();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let forge: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let custom: any = null;
    if (this.options.forge) {
      this.emit(Events.DEBUG, '[MCLC]: Detected Forge in options, getting dependencies');
      forge = await this.handler.getForgeDependenciesLegacy();
    }
    if (this.options.version.custom) {
      this.emit(Events.DEBUG, '[MCLC]: Detected custom in options, setting custom version file');
      custom = require(join(this.options.root, 'versions', this.options.version.custom, `${this.options.version.custom}.json`));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const args: Array<string> = [];

    // JVM
    let jvm = [
      '-XX:-UseAdaptiveSizePolicy',
      '-XX:-OmitStackTraceInFastThrow',
      '-Dfml.ignorePatchDiscrepancies=true',
      '-Dfml.ignoreInvalidMinecraftCertificates=true',
      `-Djava.library.path=${nativePath}`,
      `-Xmx${this.options.memory.max}M`,
      `-Xms${this.options.memory.min}M`,
    ];

    if (this.handler.getOS() === 'osx') {
      if (parseInt(versionFile.id.split('.')[1]) > 12) jvm.push(await this.handler.getJVM());
    } else { jvm.push(await this.handler.getJVM()); }

    if (this.options.customArgs) jvm = jvm.concat(this.options.customArgs);

    const classes: Array<any> = this.options.overrides.classes as Array<string> || await Handler.cleanUp(await this.handler.getClasses());
    const classPaths = ['-cp'];
    const separator = this.handler.getOS() === 'windows' ? ';' : ':';
    this.emit(Events.DEBUG, `[MCLC]: Using ${separator} to separate class paths`);
    if (this.options.forge && forge) {
      this.emit(Events.DEBUG, '[MCLC]: Setting Forge class paths');
      classPaths.push(`${resolve(this.options.forge)}${separator}${forge.paths.join(separator)}${separator}${classes.join(separator)}${separator}${mcPath}`);
      classPaths.push(forge.forge.mainClass);
    } else {
      const file = custom || versionFile;
      const jar = existsSync(mcPath) ? `${mcPath}${separator}` : '';
      classPaths.push(`${jar}${classes.join(separator)}`);
      classPaths.push(file.mainClass);
    }

    // Download version's assets
    this.emit(Events.DEBUG, '[MCLC]: Attempting to download assets');
    await this.handler.getAssets();

    // Launch options. Thank you Lyrus for the reformat <3
    const modification = forge ? forge.forge : null || custom ? custom : null;
    const launchOptions = await this.handler.getLaunchOptions(modification);

    const launchArguments = args.concat(jvm, classPaths, launchOptions);
    this.emit('arguments', launchArguments);
    this.emit('debug', launchArguments.join(' '));

    const minecraft = spawn(this.options.javaPath ? this.options.javaPath : 'java', launchArguments, {
      cwd: this.options.overrides.cwd || this.options.root,
    });
    minecraft.stdout.on('data', data => this.emit(Events.DATA, data.toString('utf-8')));
    minecraft.stderr.on('data', data => this.emit(Events.DATA, data.toString('utf-8')));
    minecraft.on('close', code => this.emit(Events.CLOSE, code));

    return minecraft;
  }
}
