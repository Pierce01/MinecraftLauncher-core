/// <reference types="node" />

declare module "minecraft-launcher-core" {
  type OS = "windows" | "osx" | "linux";

  interface IOverrides {
    minArgs?: number;
    minecraftJar?: string;
    versionJson?: string;
    directory?: string;
    natives?: string;
    assetRoot?: string;
    libraryRoot?: string;
    cwd?: string;
    detached?: boolean;
    classes?: Array<string>;
    maxSockets?: number;
    url?: {
      meta?: string;
      resources?: string;
      mavenForge?: string;
      defaultRepoForge?: string;
      fallbackMaven?: string;
    };
  }

  interface ILauncherOptions {
    /**
     * Path or URL to the client package zip file.
     */
    clientPackage?: string;
    /**
     * if true MCLC will remove the client package zip file after its finished extracting.
     */
    removePackage?: boolean;
    /**
     * Path to installer being executed.
     */
    installer?: string;
    /**
     * Path where you want the launcher to work in.
     * This will usually be your .minecraft folder
     */
    root: string;
    /**
     * OS override for minecraft natives
     * 
     * @default will autodetect
     */
    os?: OS;
    /**
     * Array of custom Minecraft arguments. 
     */
    customLaunchArgs?: Array<string>;
    /**
     * Array of custom Java arguments
     */
    customArgs?: Array<string>;
    /**
     * minecraft version info
     */
    version: {
      /**
       * Actual version. 
       * 
       * @example '1.16.4'
       */
      number: string;
      /**
       * type of release, usually `release` or `snapshot`
       */
      type: 'release' | 'snapshot' | string;
      /**
       * 	The name of the folder, jar file, and version json in the version folder. 
       * 
       * ` MCLC will look in the `versions` folder for this name
       * @example '1.16.4-fabric'
       */
      custom?: string;
    };
    memory: {
      /**
       * Min amount of memory being used by Minecraft.
       */
      max: string | number;
      /**
       * Max amount of memory being used by Minecraft.
       */
      min: string | number;
    };
    /**
     * Path to Forge Jar. 
     * 
     * Versions below 1.13 should be the "universal" jar while versions above 1.13+ should be the "installer" jar
     */
    forge?: string;
    /**
     * Path to the JRE executable file, will default to java if not entered.
     */
    javaPath?: string;
    server?: {
      /**
       * 	Host url to the server, don't include the port.
       */
      host: string;
      /**
       * Port of the host url
       * 
       * @default 25565
       */
      port?: string;
    };
    proxy?: {
      /**
       * Host url to the proxy, don't include the port.
       */
      host: string;
      /**
       *  Username for the proxy.
       * 
       * @default 8080
       */
      port?: string;
      /**
       * Username for the proxy.
       */
      username?: string;
      /**
       * Password for the proxy.
       */
      password?: string;
    };
    /**
     * Timeout on download requests.
     */
    timeout?: number;
    window?: {
      width?: number;
      height?: number;
      fullscreen?: boolean;
    };
    overrides?: IOverrides;
    authorization: Promise<IUser>;
  }

  interface IUser {
    access_token: string;
    client_token: string;
    uuid: string;
    name: string;
    user_properties: Partial<any>;
  }

  interface IProfile {
    id: number;
    name: string;
  }

  interface IAuthenticator {
    /**
     * @param username email if using a password, else the username
     * @param password password for mojang account
     */
    getAuth(username: string, password?: string): Promise<IUser>;
    /**
     * 
     * @param access_token Token being checked if it can be used to login with (online mode)
     * @param client_token Client token being checked to see if there was a change of client (online mode)
     */
    validate(
      access_token: string,
      client_token: string
    ): Promise<boolean | Partial<any>>;
    /**
     * 
     * @param access_token Token being checked if it can be used to login with (online mode)
     * @param client_token Client token being checked to see if there was a change of client (online mode)
     */
    refreshAuth(
      access_token: string,
      client_token: string,
      selectedProfile: IProfile
    ): Promise<IUser>;
    /**
     * 
     * @param access_token Token being checked if it can be used to login with (online mode)
     * @param client_token Client token being checked to see if there was a change of client (online mode)
     */
    invalidate(
      access_token: string,
      client_token: string
    ): Promise<boolean | Partial<any>>;
    /**
      * @param username email if using a password, else the username
      * @param password password for mojang account
      */
    signOut(
      username: string,
      password: string
    ): Promise<boolean | Partial<any>>;
    changeApiUrl(url: string): void;
  }

  import { EventEmitter } from 'events'
  import { ChildProcessWithoutNullStreams } from 'child_process'

  export class Client extends EventEmitter {
    launch(options: ILauncherOptions): Promise<ChildProcessWithoutNullStreams | null>;
    protected printVersion(): void;
    protected createRootDirectory(): void;
    protected createGameDirectory(): void;
    protected extractPackage(): Promise<void>;
    protected getModifyJson(): Promise<any>;
    protected startMinecraft(launchArguments: string[]): ChildProcessWithoutNullStreams;
  }

  export const Authenticator: IAuthenticator;
}
