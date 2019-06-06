![logo](https://pierce.is-serious.business/44U1xXh.png)
##### This project is near complete.
[![Build Status](https://travis-ci.com/Pierce01/MinecraftLauncher-core.svg?branch=master)](https://travis-ci.com/Pierce01/MinecraftLauncher-core)

MCLC is a NodeJS solution for launching modded and vanilla Minecraft without having to download and format everything yourself.
Basically a core for your Electron or script based launchers.

### Getting support
Since people seem to use this, I've created a Discord server for anyone who needs to get in contact with me or get help!
https://discord.gg/8uYVbXP

### Installing

`npm i minecraft-launcher-core`

### Standard Example
```javascript
const { Client, Authenticator } = require('minecraft-launcher-core');

let opts = {
    clientPackage: null,
    authorization: Authenticator.getAuth("username", "password"),
    root: "./minecraft",
    os: "windows",
    version: {
        number: "1.14",
        type: "release"
    },
    memory: {
        max: "6000",
        min: "4000"
    }
}

const launcher = new Client();
launcher.launch(opts);

launcher.on('debug', (e) => console.log(e));
launcher.on('data', (e) => console.log(e));
launcher.on('error', (e) => console.log(e));
```
### Documentation

#### Client Functions

| Function | Type    | Description                                                                             |
|----------|---------|-----------------------------------------------------------------------------------------|
| `launch` | Promise | Launches the client with the specified `options`  as a parameter                        |
| `getPid` | Integer | Returns the Minecraft client's PID                                                      |

##### launch

| Parameter                | Type     | Description                                                                               | Required |
|--------------------------|----------|-------------------------------------------------------------------------------------------|----------|
| `options.clientPackage`  | String   | Path to the client package zip file.                                                      | False    |
| `options.root`           | String   | Path where you want the launcher to work in.  like `C:/Users/user/AppData/Roaming/.mc`,   | True     |
| `options.os`             | String   | windows, osx or linux,                                                                    | True     |
| `options.version.number` | String   | Minecraft version that is going to be launched.                                           | True     |
| `options.version.type`   | String   | Any string. The actual Minecraft launcher uses `release` and `snapshot`.                  | True     |
| `options.memory.max`     | String   | Max amount of memory being used by Minectaft.                                             | True     |
| `options.memory.min`     | String   | Min amount of memory being used by Minectaft.                                             | True     |
| `options.forge`          | String   | Path to Universal Forge Jar.                                                              | False    |
| `options.javaPath`       | String   | Path to the JRE executable file, will default to `java` if not entered.                   | False    |
| `options.server.host`    | String   | Host url to the server, don't include the port.                                           | False    |
| `options.server.port`    | String   | Port of the host url, will default to `25565` if not entered.                             | False    |
| `options.proxy.host`     | String   | Host url to the proxy, don't include the port.                                            | False    |
| `options.proxy.port`     | String   | Port of the host proxy, will default to `8080` if not entered.                            | False    |
| `options.proxy.username` | String   | Username for the proxy.                                                                   | False    |
| `options.proxy.password` | String   | Password for the proxy.                                                                   | False    |
| `options.timeout`        | Integer  | Timeout on download requests.                                                             | False    |
| `options.window.width`   | String   | Width of the Minecraft Client                                                             | False    |
| `options.window.height`  | String   | Height of the Minecraft Client.                                                           | False    |

##### Note
If you are loading up a client outside of vanilla Minecraft or Forge (Optifine and for an example), you'll need to download the needed files yourself
if you don't provide downloads url downloads like Forge and Fabric. Still need to provide the version jar.

#### Authenticator Functions 

##### getAuth

| Parameter | Type   | Description                                                  | Required |
|-----------|--------|--------------------------------------------------------------|----------|
| `username`| String | Email or username                                            | True     |
| `password`| String | Password for the Mojang account   being used if online mode. | False    |

##### validate

| Parameter    | Type   | Description                                                       | Required |
|--------------|--------|-------------------------------------------------------------------|----------|
| `access_token` | String | Token being checked if it can be used to login with (online mode). | True     |

##### refreshAuth 

| Parameter          | Type   | Description                                                                         | Required |
|--------------------|--------|-------------------------------------------------------------------------------------|----------|
| `access_token`     | String | Token being checked if it can be used to login with (online mode).                  | True     |
| `client_token`     | String | Token being checked if it's the same client that the access_token was created from. | True     |
| `selected_profile` | Object | Json Object that was returned from Mojangs auth api.                                | True     |

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

#### Events

| Event Name        | Type    | Description                                                                           |
|-------------------|---------|---------------------------------------------------------------------------------------|
| `arguments`       | Object  | Emitted when launch arguments are set for the Minecraft Jar.                          |
| `data`            | Buffer  | Emitted when information is returned from the Minecraft Process                       |
| `close`           | Integer | Code number that is returned by the Minecraft Process                                 |
| `error`           | String  | Emitted when the Minecraft Process errors                                             |
| `package-extract` | null    | Emitted when `clientPackage` finishes being extracted                                 |
| `download`        | String  | Emitted when a file successfully downloads                                            |
| `download-status` | Object  | Emitted when data is received while downloading                                       |
| `debug`           | String  | Emitted when functions occur, made to help debug if errors occur                      |


#### What should it look like running from console?
Showing the emitted information from debug and data, also using `getPid` after the process has been created.
![gif](https://pierce.is-serious.business/3N3PMC4.gif)
