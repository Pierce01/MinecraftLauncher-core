import { OS, User } from '@/types';

export default interface Options {
    /**
     * if true MCLC will remove the client package zip file after its finished extracting.
     */
    removePackage?: boolean;
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
     * Array of game argument feature flags
     */
    features?: Array<string>;
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
         * Max amount of memory being used by Minecraft.
         */
        min: `${number}M` | `${number}G` | number;
        /**
         * Min amount of memory being used by Minecraft.
         */
        max: `${number}M` | `${number}G` | number;
    };
    /**
     * Path to the JRE executable file, will default to java if not entered.
     */
    javaPath?: string;
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
        /**
         * Width of the Minecraft Client
         */
        width?: number;
        /**
         * Height of the Minecraft Client
         */
        height?: number;
        /**
         * Fullscreen the Minecraft Client.
         */
        fullscreen?: boolean;
    };

    /**
     * Allows the game to be launched directly into a world
     */
    quickPlay?: {
        /**
         * The type of world you want to join.
         * Note, that versions prior to 1.20 only support "legacy"
         */
        type: 'singleplayer' | 'multiplayer' | 'realms' | 'legacy';
        /**
         * Represents the world you want to join
         *
         * For singleplayer this should be the folder name of the world
         * For multiplayer this should be the IP address of the server
         * For realms this should be the Realms ID
         * legacy follows multiplayer format
         */
        identifier: string;
        /**
         * The specified path for logging (relative to the run directory)
         */
        path?: string;
    };
    /**
     * The amount of launch arguments specified in the version file before it adds the default again
     */
    minArgs?: number;
    minecraftJar?: string;
    versionJson?: string;
    versionName?: string;
    /**
     * Folder, where the game process generates folders like saves and resource packs.
     */
    gameDirectory?: string;
    /**
     * Folder, where the Minecraft jar and version json are located.
     */
    directory: string;
    natives?: string;
    assetRoot?: string;
    assetIndex?: string;
    libraryRoot?: string;
    /**
     * Whether or not the client is detached from the parent / launcher.
     */
    detached?: boolean;
    /**
     * List of classes.
     * All class paths are required if you use this.
     */
    classes?: Array<string>;
    /**
     * Max sockets for downloadAsync.
     */
    maxSockets?: number;
    /**
     * Urls to the Minecraft resource servers
     *
     * This is for launcher developers located in countries that have the Minecraft resource servers
     * blocked for what ever reason. They obviously need to mirror the formatting of the original JSONs / file structures.
     */
    url: {
        /**
         * List of versions.
         */
        meta: string;
        /**
         * Minecraft resources.
         */
        resource?: string;
    };
    logj4ConfigurationFile?: string;
    authorization: Promise<User> | User;
    /**
     * Path of json cache.
     */
    cache?: string;
    /**
     * Path to Forge Jar.
     *
     * Versions below 1.13 should be the "universal" jar while versions above 1.13+ should be the "installer" jar
     */
    forge?: string;
}
