const request = require('request');
const uuid = require('uuid/v1');
const api_url = "https://authserver.mojang.com";


function getAuth(username, password) {
    return new Promise(resolve => {
        if(!password) {
            const user = {
                access_token: uuid(),
                client_token: uuid(),
                uuid: uuid(),
                name: username,
                user_object: JSON.stringify({})
            };

            resolve(user);
        }

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

module.exports = async function(username, password) {
    return await getAuth(username, password);
};