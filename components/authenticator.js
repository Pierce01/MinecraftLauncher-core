const request = require('request');
const uuid = require('uuid/v1');
const api_url = "https://authserver.mojang.com";


function login(username, password) {
    return new Promise(resolve => {
        const requestObject = {
            url: api_url + "/authenticate",
            json: {
                agent: {
                    name: "Minecraft",
                    version: 1
                },
                username: username,
                password: password,
                requestUser: true
            }
        };

        request.post(requestObject, function(error, response, body) {
            if (error) resolve(error);
            if(!body.selectedProfile) {
                throw new Error("Validation error: " + response.statusMessage);
            }

            const userProfile = {
                access_token: body.accessToken,
                client_token: uuid(),
                uuid: body.selectedProfile.id,
                name: body.selectedProfile.name,
                user_properties: JSON.stringify((body.user || {}).properties || {})
            };

            resolve(userProfile);
        });
    });
}

function offline(username) {
    let user = {
        access_token: uuid(),
        client_token: uuid(),
        uuid: uuid(),
        name: username,
        user_object: JSON.stringify({})
    };

    return user;
}


module.exports = async function(_offline, username, password) {
    if(_offline) {
        return offline(username);
    }

    return await login(username, password);
};