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
      clientPackage?: string;
      removePackage?: boolean;
      installer?: string;
      root: string;
      os?: OS;
      customLaunchArgs?: Array<string>;
      customArgs?: Array<string>;
      version: {
        number: string;
        type: string;
        custom?: string;
      };
      memory: {
        max: string | number;
        min: string | number;
      };
      forge?: string;
      javaPath?: string;
      server?: {
        host: string;
        port: string;
      };
      proxy?: {
        host: string;
        port: string;
        username?: string;
        password?: string;
      };
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
      getAuth(username: string, password?: string): Promise<IUser>;
      validate(
        access_token: string,
        client_token: string
      ): Promise<boolean | Partial<any>>;
      refreshAuth(
        access_token: string,
        client_token: string,
        selectedProfile: IProfile
      ): Promise<IUser>;
      invalidate(
        access_token: string,
        client_token: string
      ): Promise<boolean | Partial<any>>;
      signOut(
        username: string,
        password: string
      ): Promise<boolean | Partial<any>>;
      changeApiUrl(url: string): void;
    }
  
    import { EventEmitter } from 'events'
    import { ChildProcessWithoutNullStreams } from 'child_process'
  
    export class Client extends EventEmitter {
      launch(options: ILauncherOptions): ChildProcessWithoutNullStreams | null;
    }
  
    export const Authenticator: IAuthenticator;
  }
  