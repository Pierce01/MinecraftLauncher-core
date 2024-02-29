import { Options } from './types';

const config: Options = {
    root: './minecraft',
    authorization: {
        access_token: 'e9df5bd1-28bb-31c6-8eb0-4ad41f47d874',
        client_token: 'e9df5bd1-28bb-31c6-8eb0-4ad41f47d874',
        uuid: 'e9df5bd1-28bb-31c6-8eb0-4ad41f47d874',
        name: 'Steve',
        user_properties: '{}',
    },
    detached: true,
    version: {
        number: '1.7.10',
        type: 'release',
    },
    url: {
        meta: 'https://launchermeta.mojang.com',
        resource: 'https://resources.download.minecraft.net',
    },
    memory: {
        min: '2G',
        max: '4G',
    },
    maxSockets: 32,
};

const setConfig = <K extends keyof Options>(key: K, value: Options[K]) => (config[key] = value);

export { config, setConfig };
