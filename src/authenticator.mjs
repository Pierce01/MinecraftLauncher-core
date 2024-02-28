import axios from 'axios';
import { v3 } from 'uuid';

let uuid;
let api_url = 'https://authserver.mojang.com';

export function getAuth(username, password, client_token = null) {
    return new Promise((resolve, reject) => {
        if (!uuid) uuid = v3(username, v3.DNS);
        if (!password)
            return resolve({
                access_token: uuid,
                client_token: client_token || uuid,
                uuid,
                name: username,
                user_properties: '{}',
            });

        axios
            .post(api_url + '/authenticate', {
                agent: {
                    name: 'Minecraft',
                    version: 1,
                },
                username,
                password,
                clientToken: uuid,
                requestUser: true,
            })
            .then(({ body }) => {
                if (!body || !body.selectedProfile)
                    return reject(new Error('Validation error: ' + response.statusMessage));

                return resolve({
                    access_token: body.accessToken,
                    client_token: body.clientToken,
                    uuid: body.selectedProfile.id,
                    name: body.selectedProfile.name,
                    selected_profile: body.selectedProfile,
                    user_properties: parsePropts(body.user.properties),
                });
            })
            .catch((error) => reject(error));
    });
}

export function validate(accessToken, clientToken) {
    return new Promise((resolve, reject) =>
        axios
            .post(api_url + '/validate', { accessToken, clientToken })
            .then(({ data }) => (!data ? resolve(true) : reject(data)))
            .catch((error) => reject(error)),
    );
}

export function refreshAuth(accessToken, clientToken) {
    return new Promise((resolve, reject) =>
        axios
            .post(api_url + '/refresh', { accessToken, clientToken, requestUser: true })
            .then(({ body }) => {
                if (!body || !body.selectedProfile)
                    return reject(new Error('Validation error: ' + response.statusMessage));

                return resolve({
                    access_token: body.accessToken,
                    client_token: getUUID(body.selectedProfile.name),
                    uuid: body.selectedProfile.id,
                    name: body.selectedProfile.name,
                    user_properties: parsePropts(body.user.properties),
                });
            })
            .catch((error) => reject(error)),
    );
}

export function invalidate(accessToken, clientToken) {
    return new Promise((resolve, reject) =>
        axios
            .post(api_url + '/invalidate', { accessToken, clientToken })
            .then(({ data }) => (!data ? resolve(true) : reject(data)))
            .catch((error) => reject(error)),
    );
}

export function signOut(username, password) {
    return new Promise((resolve, reject) =>
        axios
            .post(api_url + '/signout', { username, password })
            .then(({ data }) => (!data ? resolve(true) : reject(data)))
            .catch((error) => reject(error)),
    );
}

export function changeApiUrl(url) {
    api_url = url;
    return;
}

const parsePropts = (array) => {
    if (!array) return '{}';

    const newObj = {};
    for (const entry of array)
        newObj[entry.name] ? newObj[entry.name].push(entry.value) : (newObj[entry.name] = [entry.value]);

    return JSON.stringify(newObj);
};
