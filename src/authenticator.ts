import { v3 } from 'uuid';
import { User } from './utils/types';

export const offline = (username: string): User => {
    const uuid = v3(username, v3.DNS);
    return { access_token: uuid, client_token: uuid, uuid, name: username, user_properties: '{}' };
};
