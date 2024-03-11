![Main Logo](/imgs/header.png)

[![MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/stable_version-3.19.0-blue)

MCLC (Minecraft Launcher Core) is a NodeJS solution for launching modded and vanilla Minecraft without having to download and format everything yourself.
Basically a core for your Electron or script based launchers.

### Getting support

Do you need to get in contact with me or get help? Join my Discord Server

[![Discord](https://img.shields.io/discord/568550848871923723?logo=discord)](https://discord.gg/8uYVbXP)

### Installing

```bash
# npm
npm i minecraft-launcher-core

# Yarn
yarn add minecraft-launcher-core

# pnpm
pnpm add minecraft-launcher-core
```

### Example

```js
import { Authenticator, Client } from 'minecraft-launcher-core';

const launcher = new Client();
const options = {
    // This will launch in offline mode, if you want
    // to use a Microsoft Account, see details below
    authorization: Authenticator.getAuth('Steve'),
    root: './minecraft',
    version: {
        number: '1.14.4',
        type: 'release',
    },
    memory: {
        max: '4G',
        min: '2G',
    },
};

launcher.launch(options);

launcher.on('debug', (e) => console.log(e));
launcher.on('data', (e) => console.log(e));
```

### Using a Microsoft Account

In order to authenticate with a Microsoft Account, you would need to use [MSMC](https://github.com/Hanro50/MSMC).
Make sure to install it, as it doesn't come by default

#### Example

```js
import { Authenticator, Client } from 'minecraft-launcher-core';
import { Auth } from 'msmc';

const authManager = new Auth('select_account');
const xboxManager = await authManager.launch('raw'); // Can be 'electron' or 'nwjs'
const token = await xboxManager.getMinecraft();

const launcher = new Client();
const options = {
    authorization: token.mclc(),
    root: './minecraft',
    version: {
        number: '1.14.4',
        type: 'release',
    },
    memory: {
        max: '4G',
        min: '2G',
    },
};

launcher.launch(options);

launcher.on('debug', (e) => console.log(e));
launcher.on('data', (e) => console.log(e));
```

### Having modded version

<!-- will fill in later-->

MCLC by default only has Vanilla. In order to automate the process of installing [Forge](https://minecraftforge.net), [Fabric](https://fabricmc.net) and [Quilt](https://quiltmc.org) you would need to use lorem ipsum

### Documentation

#### Client Functions

<!-- will fill in later-->

| Function | Type    | Description                                                                                |
| -------- | ------- | ------------------------------------------------------------------------------------------ |
| `launch` | Promise | Launches the client with the specified `options` as a parameter. Returns child the process |

##### launch

<!-- will fill in later-->

| Parameter                      | Type    | Description                                                                                                                      | Required |
| ------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `options.removePackage`        | Boolean | Option to remove the client package zip file after its finished extracting.                                                      | False    |
| `options.root`                 | String  | Path where you want the launcher to work in. `C:/Users/user/AppData/Roaming/.mc`                                                 | True     |
| `options.cache`                | String  | Path where launcher files will be cached in. `C:/Users/user/AppData/Roaming/.mc/cache`                                           | False    |
| `options.os`                   | String  | windows, osx or linux. MCLC will auto determine the OS if this field isn't provided.                                             | False    |
| `options.customLaunchArgs`     | Array   | Array of custom Minecraft arguments you want to add.                                                                             | False    |
| `options.customArgs`           | Array   | Array of custom Java arguments you want to add.                                                                                  | False    |
| `options.features`             | Array   | Array of game argument feature flags. ex: `is_demo_user` or `has_custom_resolution`                                              | False    |
| `options.version.number`       | String  | Minecraft version that is going to be launched.                                                                                  | True     |
| `options.version.type`         | String  | Any string. The actual Minecraft launcher uses `release` and `snapshot`.                                                         | True     |
| `options.version.custom`       | String  | The name of the folder, jar file, and version json in the version folder.                                                        | False    |
| `options.memory.max`           | String  | Max amount of memory being used by Minecraft.                                                                                    | True     |
| `options.memory.min`           | String  | Min amount of memory being used by Minecraft.                                                                                    | True     |
| `options.forge`                | String  | Path to Forge Jar. (Versions below 1.12.2 should be the "universal" jar while versions above 1.13 should be the "installer" jar) | False    |
| `options.javaPath`             | String  | Path to the JRE executable file, will default to `java` if not entered.                                                          | False    |
| `options.quickPlay.type`       | String  | The type of the quickPlay session. `singleplayer`, `multiplayer`, `realms`, `legacy`                                             | False    |
| `options.quickPlay.identifier` | String  | The folder name, server address, or realm ID, relating to the specified type. `legacy` follows `multiplayer` format.             | False    |
| `options.quickPlay.path`       | String  | The specified path for logging (relative to the run directory)                                                                   | False    |
| `options.proxy.host`           | String  | Host url to the proxy, don't include the port.                                                                                   | False    |
| `options.proxy.port`           | String  | Port of the host proxy, will default to `8080` if not entered.                                                                   | False    |
| `options.proxy.username`       | String  | Username for the proxy.                                                                                                          | False    |
| `options.proxy.password`       | String  | Password for the proxy.                                                                                                          | False    |
| `options.timeout`              | Integer | Timeout on download requests.                                                                                                    | False    |
| `options.window.width`         | String  | Width of the Minecraft Client.                                                                                                   | False    |
| `options.window.height`        | String  | Height of the Minecraft Client.                                                                                                  | False    |
| `options.window.fullscreen`    | Boolean | Fullscreen the Minecraft Client.                                                                                                 | False    |
| `options.overrides`            | Object  | Json object redefining paths for better customization. Example below.                                                            | False    |

#### Authenticator Functions

##### getAuth

| Parameter  | Type   | Description       | Required |
| ---------- | ------ | ----------------- | -------- |
| `username` | String | Email or username | True     |

#### Events

| Event Name        | Type    | Description                                                                         |
| ----------------- | ------- | ----------------------------------------------------------------------------------- |
| `arguments`       | Object  | Emitted when launch arguments are set for the Minecraft Jar.                        |
| `data`            | String  | Emitted when information is returned from the Minecraft Process                     |
| `close`           | Integer | Code number that is returned by the Minecraft Process                               |
| `download`        | String  | Emitted when a file successfully downloads                                          |
| `download-status` | Object  | Emitted when data is received while downloading                                     |
| `debug`           | String  | Emitted when functions occur, made to help debug if errors occur                    |
| `progress`        | Object  | Emitted when files are being downloaded in order. (Assets, Forge, Natives, Classes) |

#### What should it look like running from console?

The `pid` is printed in console after the process is launched.
![gif](https://owo.whats-th.is/3N3PMC4.gif)

## Contributors

These are the people that helped out that aren't listed [here](https://github.com/Pierce01/MinecraftLauncher-core/graphs/contributors)!

-   [Pyker](https://github.com/Pyker) - Forge dependency parsing.
-   [Khionu](https://github.com/khionu) - Research on how Minecraft's `natives` are handled.
-   [Coding-Kiwi](https://github.com/Coding-Kiwi) - Pointed out I didn't pass `clientToken` in initial authentication function.
-   maxbsoft - Pointed out that a certain JVM option causes OSX Minecraft to bug out.
-   [Noé](https://github.com/NoXeDev) - Pointed out launch args weren't being passed for Forge 1.13+.
