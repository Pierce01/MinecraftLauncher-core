import { join } from 'node:path';
import { offline } from 'src';
import { Options } from './types';

let config: Options = {
    root: './minecraft',
    directory: '',
    authorization: offline('Steve'),
    detached: true,
    version: {
        number: '1.14.4',
        type: 'release',
    },
    url: {
        meta: 'https://launchermeta.mojang.com',
        resource: 'https://resources.download.minecraft.net',
    },
    memory: {
        min: Math.pow(2, 9),
        max: Math.pow(2, 10),
    },
};

const defineOptions = (newConfig: Partial<Options>): void => {
    config = { ...config, ...newConfig };
    config.directory = join(config.root, 'versions', config.version.custom || config.version.number);
    return;
};

export { config, defineOptions };
