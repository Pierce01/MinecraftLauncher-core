# Minecraft Launcher Core
### Currently only supports MC 1.7.3 and up.

A script that launches Minecraft using NodeJS. 
Supports Vanilla and Forge.

### Installing

`npm i minecraft-launcher-core`

### Usage


##### launcher.core Options

| Parameter                | Type   | Description                                                                               | Required |
|--------------------------|--------|-------------------------------------------------------------------------------------------|----------|
| `options.authorization`  | Object | The result from `getAuth` function, allows the client to login in online or offline mode. | True     |
| `options.clientPackage`  | String | Path to the client package zip file.                                                      | False    |
| `options.root`           | String | Path where you want the launcher to work in.  like `C:/Users/user/AppData/Roaming/.mc`    | True     |
| `options.os`             | String | windows, osx or linux                                                                     | True     |
| `options.version.number` | String | Minecraft version that is going to be launched.                                           | True     |
| `options.version.type`   | String | Any string. The actual Minecraft launcher uses `release` and `snapshot`.                  | True     |
| `options.memory.max`     | String | Max amount of memory being used by Minectaft                                              | True     |

#### launcher.authenticator Functions 

##### getAuth

| Parameter | Type   | Description                                                  | Required |
|-----------|--------|--------------------------------------------------------------|----------|
| `email`     | String | Email or username                                            | True     |
| `password`  | String | Password for the Mojang account   being used if online mode. | False    |

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

#### Events

| Event Name        | Type    | Description                                                                         |
|-------------------|---------|-------------------------------------------------------------------------------------|
| `data`            | Buffer  | Emitted when information is returned from the Minecraft Process                     |
| `close`           | Integer | Code number that is returned by the Minecraft Process                               |
| `error`           | String  | Emitted when the Minecraft Process errors                                           |
| `package-extract` | null    | Emitted when `clientPackage` finishes being extracted                               |
| `start`           | null    | Emitted after `launchOptions` are set.  THIS WILL BE DEPRECATED AS ITS NOT ACCURATE |

#### Client Package Function

Client Packages allow the client to run offline on setup. This function should be used outside the actual launcher.
this function is in the `handler` component.

##### makePackage

| Parameter  | Type   | Description                                                           | Required |
|------------|--------|-----------------------------------------------------------------------|----------|
| `versions` | Array  | Array of the versions being downloaded and being made into a package. | True     |
| `os`       | String | OS that the package will be loaded on. OS specific natives need this. | True     |


### Examples
```javascript
const launcher = require('minecraft-launcher-core');

launcher.authenticator.getAuth("email", "password").then(auth => {
    // Save the auth to a file so it can be used later on!
    launcher.core({
        authorization: auth,
        clientPackage: null,
        forge: null,
        root: "C:/Users/user/AppData/Roaming/.mc",
        os: "windows",
        version: {
            number: "1.13.2",
            type: "MCC-Launcher" 
        },
        memory: {
            max: "500"
        }
    });
});
```

##### Using Validate and Refresh

```javascript
let auth = require("pathToUserAuthJson.json");

const validateCheck = await launcher.authenticator.validate(auth.access_token);
if(!validateCheck) {
    auth = await launcher.authenticator.refreshAuth(auth.access_token, auth.client_token, auth.selected_profile);
}
launcher.core({
    authorization: auth,
    clientPackage: null,
    root: "directory",
    os: "windows",
    version: {
        number: "1.13.2",
        type: "MCC-Launcher"
    },
    memory: {
        max: "500"
    }
});
```

##### Using With Forge

```js
launcher.authenticator.getAuth("email", "password").then(auth => {
    launcher.core({
        authorization: auth,
        clientPackage: null,
        root: "C:/Users/user/AppData/Roaming/.mc",
        forge: {
            path: "C:/Users/user/Desktop/forge.jar"
        },
        os: "windows",
        version: {
            number: "1.12.2", // needs to be the same as the Forge version
            type: "MCC-Launcher" 
        },
        memory: {
            max: "500"
        }
    });
});
```


#### What should it look like running from console?

![gif](https://pierce.is-serious.business/7d91a7.gif)
