# Minecraft Launcher Core
### Currently only supports MC 1.7.3 and up.

A script that launches Minecraft using NodeJS.

#### Usage

```javascript
const launch = require('./pathtomodule').core;

launch({
    login: {
        username: "", // required
        password: "", // optional
        offline: false // optional
    },
	// All of the following is required
    root: "directory", // C:/Users/user/AppData/Roaming/.mc
    os: "windows", // windows, osx, linux
    version: {
        number: "1.12.2", // Minecraft version you want to launch
        type: "MC-Launcher" // Type. Can be anything
    },
    memory: {
        max: "5000"
    }
})
```
