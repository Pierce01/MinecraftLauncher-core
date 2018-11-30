# Minecraft Launcher Core
### Currently only supports MC 1.7.3 and up.

A script that launches Minecraft using NodeJS.

#### Usage

```javascript
const launcher = require('./pathtomodule');

launcher.authenticator("email", "password").then(auth => {
    launcher.core({
        authorization: auth,
	// All of the following is required
        root: "directory", // C:/Users/user/AppData/Roaming/.mc
        os: "windows", // windows, osx, linux
        version: {
            number: "1.13.2", // Minecraft version you want to launch
            type: "MCC-Launcher" // Type. Can be anything
        },
        memory: {
            max: "500"
        }
    });
});
```

#### What should it look like running from console?

![gif](https://pierce.is-serious.business/7d91a7.gif)
