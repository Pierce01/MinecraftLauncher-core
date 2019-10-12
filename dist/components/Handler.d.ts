/// <reference types="node" />
import { LauncherOptions, Client } from './Launcher';
import { ExecException } from 'child_process';
/**
 * Internal function handler
 */
export declare class Handler {
    client: Client;
    options: LauncherOptions;
    version?: any;
    private readonly baseRequest;
    constructor(client: Client);
    /**
     * Checks if Java is valid
     * @param {string} java Path to Java executable
     * @returns {Promise<{run: boolean, message: ExecException?}>}
     */
    checkJava(java: string): Promise<{
        run: boolean;
        message?: ExecException;
    }>;
    /**
     * Downloads a file
     * @param {string} url URL
     * @param {string} directory Output directory
     * @param {string} name File name
     * @param {boolean} retry whether to retry or not
     * @param {*} type /shrug
     * @returns {Promise<void | {failed: boolean, asset: *}>}
     */
    downloadAsync(url: string, directory: string, name: string, retry: boolean, type: any): Promise<void | {
        failed: boolean;
        asset: unknown;
    }>;
    /**
     * Checks if a file's hash is the same as the one provided
     * @param {string} hash Hash
     * @param {string} file File to check the hash against
     * @returns {Promise<boolean>}
     */
    checkSum(hash: string, file: string): Promise<boolean>;
    /**
     * Gets the version of Minecraft specified in the options
     * @returns {Promise<Object>}
     */
    getVersion(): Promise<any>;
    /**
     * Gets the jar for the specified version
     * @returns {Promise<void>}
     */
    getJar(): Promise<void>;
    /**
     * Fetches the assets for the version of Minecraft specified in options
     * @returns {Promise<void>}
     */
    getAssets(): Promise<void>;
    /**
     * Major Yikes
     * @param {*} lib yikes
     * @returns {Boolean}
     */
    parseRule(lib: any): boolean;
    /**
     * Yikes
     * @returns {Promise<string>}
     */
    getNatives(): Promise<string>;
    /**
     * Fetches forge dependencies
     * @returns {Promise<{paths: *[], forge: *} | null>}
     */
    getForgeDependenciesLegacy(): Promise<{
        paths: Array<any>;
        forge: any;
    } | null>;
    /**
     * Runs the forge installer?
     * @param {string} path Path to the installer?
     * @returns {Promise<void>}
     */
    runInstaller(path: string): Promise<void>;
    /**
     * Gets classes?
     * @returns {Promise<Array<*>>}
     */
    getClasses(): Promise<Array<any>>;
    static cleanUp(array: Array<any>): Promise<unknown>;
    getLaunchOptions(modification: any): Promise<Array<string>>;
    /**
     * Gets the JVM args best suited for the current os
     * @returns {string}
     */
    getJVM(): string;
    /**
     * Gets the current system os in user friendly terms
     * @returns {string}
     */
    getOS(): string;
    /**
     * Extracts the client package
     * @param {LauncherOptions?} options Client options
     * @returns {Promise<void>}
     */
    extractPackage(options?: LauncherOptions): Promise<void>;
}
