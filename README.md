![MCLC](/assets/header.png)

[![MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/stable_version-3.19.0-blue)

MCLC (Minecraft Launcher Core) is a NodeJS solution for launching modded and vanilla Minecraft without having to download and format everything yourself.
Basically a core for your Electron or script based launcher.

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
import { Client, onLog, offline } from 'minecraft-launcher-core';

const client = new Client({
    // This will launch in offline mode, if you want to use
    // a Microsoft Account, see details below
    authorization: offline('Steve'),
    // 1.14.4 is the default version, you can remove it if you are using it
    version: {
        number: '1.14.4',
        type: 'release',
    }
});

await client.install();
await client.launch();

onLog('debug', (e) => console.log(e));
onLog('data', (e) => console.log(e));
```

### Using a Microsoft Account

In order to authenticate with a Microsoft Account, you would need to use [MSMC](https://npm.im/msmc).
Make sure to install it, as it doesn't come by default.

#### Example

```js
import { Client, onLog } from 'minecraft-launcher-core';
import { Auth } from 'msmc';

const authManager = new Auth('select_account');
const xboxManager = await authManager.launch('raw'); // Can be 'electron' or 'nwjs'
const token = await xboxManager.getMinecraft();

const client = new Client({
    authorization: token.mclc()
});

await client.install();
await client.launch();

onLog('debug', (e) => console.log(e));
onLog('data', (e) => console.log(e));
```

### Modded versions

MCLC only supports installing Vanilla automatically, but it also
supports installing Forge and NeoForge for you (you would need to install the installer yourself)

#### Example

```js
import { Client, onLog, offline } from 'minecraft-launcher-core';
import { join } from 'path';

const client = new Client({
    authorization: offline('Steve'),
    version: {
        number: '1.14.4',
        type: 'release',
        forge: join('path', 'to', 'forge-installer.jar')
    }
});

await client.install();
await client.launch();

onLog('debug', (e) => console.log(e));
onLog('data', (e) => console.log(e));
```

## Contributors

These are the people that helped out that aren't listed [here](https://github.com/Pierce01/MinecraftLauncher-core/graphs/contributors)!

- [Pyker](https://github.com/Pyker) - Forge dependency parsing.
- [Khionu](https://github.com/khionu) - Research on how Minecraft's `natives` are handled.
- [Coding-Kiwi](https://github.com/Coding-Kiwi) - Pointed out I didn't pass `clientToken` in initial authentication function.
- maxbsoft - Pointed out that a certain JVM option causes OSX Minecraft to bug out.
- [Noé](https://github.com/NoXeDev) - Pointed out launch args weren't being passed for Forge 1.13+.

### Related projects

- [MSMC](https://npm.im/msmc) - Allows using a Microsoft Account for the authorization
- [tomate-loaders](https://npm.im/tomate-loaders) - Downloads mod loaders automatically