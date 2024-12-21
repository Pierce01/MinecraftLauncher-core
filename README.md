![logo](https://owo.whats-th.is/8mT5kxc.png)
##### Project rewrite coming soon™
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![version](https://img.shields.io/badge/stable_version-3.18.2-blue)

MCLC (Minecraft Launcher Core) is a NodeJS solution for launching modded and vanilla Minecraft without having to download and format everything yourself.
Basically a core for your Electron or script based launchers.

### Getting support
I've created a Discord server for anyone who needs to get in contact with me or get help!
<p>
   <a href="https://discord.gg/8uYVbXP">
   <img src="https://img.shields.io/discord/568550848871923723?logo=discord"
      alt="chat on Discord"></a>
<p>

### Installing

`npm i minecraft-launcher-core`

### Standard Example
```javascript
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();

let opts = {
    // For production launchers, I recommend not passing 
    // the getAuth function through the authorization field and instead
    // handling authentication outside before you initialize
    // MCLC so you can handle auth based errors and validation!
    authorization: Authenticator.getAuth("username", "password"),
    root: "./minecraft",
    version: {
        number: "1.14",
        type: "release"
    },
    memory: {
        max: "6G",
        min: "4G"
    }
}

launcher.launch(opts);

launcher.on('debug', (e) => console.log(e));
launcher.on('data', (e) => console.log(e));
```
### Documentation

#### Client Functions

| Function | Type    | Description                                                                             |
|----------|---------|-----------------------------------------------------------------------------------------|
| `launch` | Promise | Launches the client with the specified `options`  as a parameter. Returns child the process |

##### launch

| Parameter                | Type     | Description                                                                               | Required |
|--------------------------|----------|-------------------------------------------------------------------------------------------|----------|
| `options.clientPackage`  | String   | Path or URL to a zip file, which will be extracted to the root directory. (Not recommended for production use)| False    |
| `options.removePackage`  | Boolean  | Option to remove the client package zip file after its finished extracting.               | False    |
| `options.root`           | String   | Path where you want the launcher to work in. `C:/Users/user/AppData/Roaming/.mc`          | True     |
| `options.cache`          | String   | Path where launcher files will be cached in. `C:/Users/user/AppData/Roaming/.mc/cache`    | False    |
| `options.os`             | String   | windows, osx or linux. MCLC will auto determine the OS if this field isn't provided.      | False    |
| `options.customLaunchArgs`| Array   | Array of custom Minecraft arguments you want to add.                                      | False    |
| `options.customArgs`     | Array    | Array of custom Java arguments you want to add.                                           | False    |
| `options.features`       | Array    | Array of game argument feature flags. ex: `is_demo_user` or `has_custom_resolution`       | False    |
| `options.version.number` | String   | Minecraft version that is going to be launched.                                           | True     |
| `options.version.type`   | String   | Any string. The actual Minecraft launcher uses `release` and `snapshot`.                  | True     |
| `options.version.custom` | String   | The name of the folder, jar file, and version json in the version folder.                 | False    |
| `options.memory.max`     | String   | Max amount of memory being used by Minecraft.                                             | True     |
| `options.memory.min`     | String   | Min amount of memory being used by Minecraft.                                             | True     |
| `options.forge`          | String   | Path to Forge Jar. (Versions below 1.12.2 should be the "universal" jar while versions above 1.13 should be the "installer" jar) | False    |
| `options.javaPath`       | String   | Path to the JRE executable file, will default to `java` if not entered.                   | False    |
| `options.quickPlay.type` | String   | The type of the quickPlay session. `singleplayer`, `multiplayer`, `realms`, `legacy`      | False    |
| `options.quickPlay.identifier` | String   | The folder name, server address, or realm ID, relating to the specified type. `legacy` follows `multiplayer` format.        | False    |
| `options.quickPlay.path` | String   | The specified path for logging (relative to the run directory)                            | False    |
| `options.proxy.host`     | String   | Host url to the proxy, don't include the port.                                            | False    |
| `options.proxy.port`     | String   | Port of the host proxy, will default to `8080` if not entered.                            | False    |
| `options.proxy.username` | String   | Username for the proxy.                                                                   | False    |
| `options.proxy.password` | String   | Password for the proxy.                                                                   | False    |
| `options.timeout`        | Integer  | Timeout on download requests.                                                             | False    |
| `options.window.width`   | String   | Width of the Minecraft Client.                                                            | False    |
| `options.window.height`  | String   | Height of the Minecraft Client.                                                           | False    |
| `options.window.fullscreen`| Boolean| Fullscreen the Minecraft Client.                                                          | False    |
| `options.overrides`      | Object   | Json object redefining paths for better customization. Example below.                     | False    |
#### IF YOU'RE NEW TO MCLC, LET IT HANDLE EVERYTHING! DO NOT USE OVERRIDES!
```js
let opts = {
   otherOps...,
   overrides: {
       gameDirectory: '', // where the game process generates folders like saves and resource packs.
       minecraftJar: '',
       versionName: '', // replaces the value after the version flag.
       versionJson: '',
       directory: '', // where the Minecraft jar and version json are located.
       natives: '', // native directory path.
       assetRoot: '',
       assetIndex: '',
       libraryRoot: '',
       cwd: '', // working directory of the java process.
       detached: true, // whether or not the client is detached from the parent / launcher.
       classes: [], // all class paths are required if you use this.
       minArgs: 11, // The amount of launch arguments specified in the version file before it adds the default again
       maxSockets: 2, // max sockets for downloadAsync.
       // The following is for launcher developers located in countries that have the Minecraft and Forge resource servers
       // blocked for what ever reason. They obviously need to mirror the formatting of the original JSONs / file structures.
       url: {
           meta: 'https://launchermeta.mojang.com', // List of versions.
           resource: 'https://resources.download.minecraft.net', // Minecraft resources.
           mavenForge: 'http://files.minecraftforge.net/maven/', // Forge resources.
           defaultRepoForge: 'https://libraries.minecraft.net/', // for Forge only, you need to redefine the library url
                                                                // in the version json.
           fallbackMaven: 'https://search.maven.org/remotecontent?filepath='
       },
       // The following is options for which version of ForgeWrapper MCLC uses. This allows us to launch modern Forge.
       fw: {
        baseUrl: 'https://github.com/ZekerZhayard/ForgeWrapper/releases/download/',
        version: '1.5.1',
        sh1: '90104e9aaa8fbedf6c3d1f6d0b90cabce080b5a9',
        size: 29892,
      },
      logj4ConfigurationFile: ''
   }
}
```

#### Notes
##### Custom
If you are loading up a client outside of vanilla Minecraft or Forge (Optifine and for an example), you'll need to download the needed files yourself if you don't provide downloads url downloads like Forge and Fabric. If no version jar is specified, MCLC will default back to the normal MC jar so mods like Fabric work.

#### Authentication (Deprecated)
MCLC's authenticator module does not support Microsoft authentication. You will need to use a library like [MSMC](https://github.com/Hanro50/MSMC). If you want to create your own solution, the following is the authorization JSON object format.
```js
{
    access_token: '',
    client_token: '',
    uuid: '',
    name: '',
    user_properties: '{}',
    meta: {
        type: 'mojang' || 'msa',
        demo: true || false, // Demo can also be specified by adding 'is_demo_user' to the options.feature array 
        // properties only exists for specific Minecraft versions.
        xuid: '',
        clientId: ''
    }
}
```

#### Authenticator Functions 

##### getAuth

| Parameter | Type   | Description                                                  | Required |
|-----------|--------|--------------------------------------------------------------|----------|
| `username`| String | Email or username                                            | True     |
| `password`| String | Password for the Mojang account   being used if online mode. | False    |
| `client_token`| String | Client token that will be used. If one is not specified, one will be generated | False    |

##### validate

| Parameter    | Type   | Description                                                       | Required |
|--------------|--------|-------------------------------------------------------------------|----------|
| `access_token` | String | Token being checked if it can be used to login with (online mode). | True     |
| `client_token` | String | Client token being checked to see if there was a change of client (online mode). | True     |

##### refreshAuth 

| Parameter          | Type   | Description                                                                         | Required |
|--------------------|--------|-------------------------------------------------------------------------------------|----------|
| `access_token`     | String | Token being checked if it can be used to login with (online mode).                  | True     |
| `client_token`     | String | Token being checked if it's the same client that the access_token was created from. | True     |

##### invalidate

| Parameter    | Type   | Description                                                       | Required |
|--------------|--------|-------------------------------------------------------------------|----------|
| `access_token` | String | Token being checked if it can be used to login with (online mode). | True     |
| `client_token` | String | Token being checked if it's the same client that the access_token was created from. | True     |

##### signOut

| Parameter    | Type   | Description                          | Required |
|--------------|--------|--------------------------------------|----------|
| `username` | String | Username used to login with | True     |
| `password` | String | Password used to login with | True     |

##### changeApiUrl

| Parameter | Type   | Description                                                  | Required |
|-----------|--------|--------------------------------------------------------------|----------|
| `url`     | String | New URL that MCLC will make calls to authenticate the login. | True     |

#### Events

| Event Name        | Type    | Description                                                                           |
|-------------------|---------|---------------------------------------------------------------------------------------|
| `arguments`       | Object  | Emitted when launch arguments are set for the Minecraft Jar.                          |
| `data`            | String  | Emitted when information is returned from the Minecraft Process                       |
| `close`           | Integer | Code number that is returned by the Minecraft Process                                 |
| `package-extract` | null    | Emitted when `clientPackage` finishes being extracted                                 |
| `download`        | String  | Emitted when a file successfully downloads                                            |
| `download-status` | Object  | Emitted when data is received while downloading                                       |
| `debug`           | String  | Emitted when functions occur, made to help debug if errors occur                      |
| `progress`        | Object  | Emitted when files are being downloaded in order. (Assets, Forge, Natives, Classes)   |


#### What should it look like running from console?
The `pid` is printed in console after the process is launched. 
![gif](https://owo.whats-th.is/3N3PMC4.gif)

## Contributors
These are the people that helped out that aren't listed [here](https://github.com/Pierce01/MinecraftLauncher-core/graphs/contributors)!
* [Pyker](https://github.com/Pyker) - Forge dependency parsing.
* [Khionu](https://github.com/khionu) - Research on how Minecraft's`natives` are handled.
* [Coding-Kiwi](https://github.com/Coding-Kiwi) - Pointed out I didn't pass `clientToken` in initial authentication function.
* maxbsoft - Pointed out that a certain JVM option causes OSX Minecraft to bug out.
* [Noé](https://github.com/NoXeDev) - Pointed out launch args weren't being passed for Forge 1.13+.
