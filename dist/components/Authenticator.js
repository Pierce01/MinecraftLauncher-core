"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const request_1 = __importDefault(require("request"));
const uuid = require("uuid");
/* eslint @typescript-eslint/camelcase: 0 */
const api_url = 'https://authserver.mojang.com';
exports.default = {
    /**
     * Get authentication
     * @param {string} username Username to login with
     * @param {string?} password Password, Leave null for offline mode
     * @returns {Promise<UserProfile>}
     */
    getAuth: (username, password) => new Promise((resolve, reject) => {
        if (!password) {
            const user = {
                access_token: uuid(),
                client_token: uuid(),
                uuid: uuid(),
                name: username,
                user_properties: JSON.stringify({}),
            };
            resolve(user);
            return;
        }
        const requestObject = {
            url: `${api_url}/authenticate`,
            json: {
                agent: {
                    name: 'Minecraft',
                    version: 1,
                },
                username: username,
                password: password,
                clientToken: uuid(),
                requestUser: true,
            },
        };
        request_1.default.post(requestObject, (error, response, body) => {
            if (error)
                return reject(error);
            if (!body || !body.selectedProfile) {
                // eslint-disable-next-line prefer-promise-reject-errors
                return reject(`Validation error: ${response.statusMessage}`);
            }
            const userProfile = {
                access_token: body.accessToken,
                client_token: body.clientToken,
                uuid: body.selectedProfile.id,
                name: body.selectedProfile.name,
                selected_profile: body.selectedProfile,
                user_properties: JSON.stringify(body.user.properties || {}),
            };
            return resolve(userProfile);
        });
    }),
    validate: (access_token, client_token) => new Promise((resolve, reject) => {
        const requestObject = {
            url: `${api_url}/validate`,
            json: {
                accessToken: access_token,
                clientToken: client_token,
            },
        };
        // eslint-disable-next-line consistent-return
        request_1.default.post(requestObject, (error, _, body) => {
            if (error)
                return reject(error);
            if (!body)
                resolve(true);
            else
                reject(body);
        });
    }),
    refreshAuth: (accessToken, clientToken, selectedProfile) => new Promise((resolve, reject) => {
        const requestObject = {
            url: `${api_url}/refresh`,
            json: {
                accessToken: accessToken,
                clientToken: clientToken,
                selectedProfile: selectedProfile,
                requestUser: true,
            },
        };
        // eslint-disable-next-line consistent-return
        request_1.default.post(requestObject, (error, response, body) => {
            if (error)
                return reject(error);
            if (!body || !body.selectedProfile) {
                // eslint-disable-next-line prefer-promise-reject-errors
                return reject(`Validation error: ${response.statusMessage}`);
            }
            const userProfile = {
                access_token: body.accessToken,
                client_token: uuid(),
                uuid: body.selectedProfile.id,
                name: body.selectedProfile.name,
                user_properties: JSON.stringify(body.user.properties || {}),
            };
            resolve(userProfile);
        });
    }),
    invalidate: (accessToken, clientToken) => new Promise((resolve, reject) => {
        const requestObject = {
            url: `${api_url}/invalidate`,
            json: {
                accessToken: accessToken,
                clientToken: clientToken,
            },
        };
        // eslint-disable-next-line consistent-return
        request_1.default.post(requestObject, (error, _, body) => {
            if (error)
                return reject(error);
            if (!body)
                resolve(true);
            else
                reject(body);
        });
    }),
    signOut: (username, password) => new Promise((resolve, reject) => {
        const requestObject = {
            url: `${api_url}/signout`,
            json: {
                username: username,
                password: password,
            },
        };
        // eslint-disable-next-line consistent-return
        request_1.default.post(requestObject, (error, _, body) => {
            if (error)
                return reject(error);
            if (!body)
                resolve(true);
            else
                reject(body);
        });
    }),
};
