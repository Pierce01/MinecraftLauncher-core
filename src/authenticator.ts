import { User } from '@types';
import { v3 } from 'uuid';

export const offline = (username: string): User => {
    const uuid = v3(username, v3.DNS);
    return { access_token: uuid, client_token: uuid, uuid, name: username };
};
