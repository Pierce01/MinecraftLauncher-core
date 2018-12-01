# Minecraft Launcher Core
### Currently only supports MC 1.7.3 and up.

A script that launches Minecraft using NodeJS.

#### Usage

##### Basic Login
```javascript
const launcher = require('./pathtomodule');

launcher.authenticator("email", "password").then(auth => {
    // Save the auth to a file so it can be used later on!
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

##### Using Validate and Refresh

```javascript
    let auth = require("pathToUserAuthJson.json");

    const validateCheck = await launcher.authenticator.validate(auth.access_token); // required arguments.
    if(!validateCheck) {
        auth = await launcher.authenticator.refreshAuth(auth.access_token, auth.client_token, auth.selected_profile); // required arguments.
    }
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
