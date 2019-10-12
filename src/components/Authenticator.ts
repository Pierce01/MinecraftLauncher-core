import Request from 'request';
import uuid = require('uuid');

/* eslint @typescript-eslint/camelcase: 0 */
const api_url = 'https://authserver.mojang.com';

interface UserProfile {
  access_token: any;
  client_token: any;
  uuid: any;
  name: string;
  selected_profile?: string;
  user_properties: string;
}

export default {
  /**
   * Get authentication
   * @param {string} username Username to login with
   * @param {string?} password Password, Leave null for offline mode
   * @returns {Promise<UserProfile>}
   */
  getAuth: (username: string, password?: string): Promise<UserProfile> => new Promise((resolve, reject) => {
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

    Request.post(requestObject, (error, response, body) => {
      if (error) return reject(error);
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
  validate: (access_token: string, client_token: string) => new Promise((resolve, reject) => {
    const requestObject = {
      url: `${api_url}/validate`,
      json: {
        accessToken: access_token,
        clientToken: client_token,
      },
    };

    // eslint-disable-next-line consistent-return
    Request.post(requestObject, (error, _, body) => {
      if (error) return reject(error);

      if (!body) resolve(true);
      else reject(body);
    });
  }),
  refreshAuth: (accessToken: string, clientToken: string, selectedProfile: string) => new Promise((resolve, reject) => {
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
    Request.post(requestObject, (error, response, body) => {
      if (error) return reject(error);
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
  invalidate: (accessToken: string, clientToken: string) => new Promise((resolve, reject) => {
    const requestObject = {
      url: `${api_url}/invalidate`,
      json: {
        accessToken: accessToken,
        clientToken: clientToken,
      },
    };

    // eslint-disable-next-line consistent-return
    Request.post(requestObject, (error, _, body) => {
      if (error) return reject(error);

      if (!body) resolve(true);
      else reject(body);
    });
  }),
  signOut: (username: string, password: string) => new Promise((resolve, reject) => {
    const requestObject = {
      url: `${api_url}/signout`,
      json: {
        username: username,
        password: password,
      },
    };

    // eslint-disable-next-line consistent-return
    Request.post(requestObject, (error, _, body) => {
      if (error) return reject(error);

      if (!body) resolve(true);
      else reject(body);
    });
  }),
};
