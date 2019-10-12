/// <reference types="node" />
import { EventEmitter } from 'events';
import { Handler } from './Handler';
import { ChildProcessWithoutNullStreams } from 'child_process';
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
export declare class Client extends EventEmitter {
    options?: LauncherOptions;
    handler?: Handler;
    /**
     * Launches Minecraft
     * @param {LauncherOptions} options Options to start the game with
     * @returns {Promise<ChildProcessWithoutNullStreams | null>}
     */
    launch(options: LauncherOptions): Promise<ChildProcessWithoutNullStreams | null>;
}
