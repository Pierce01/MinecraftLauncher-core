import { createHash } from 'node:crypto';
import { createReadStream, stat } from 'node:fs';
import { resolve as _resolve } from 'node:path';
import { OS, Version } from '@/types';
import { config } from '@/utils/config';
import { log } from '@/utils/log';

const popString = (path: string) => path.split('/').slice(0, -1).join('/');
const cleanUp = (array: string[]) => [...new Set(Object.values(array).filter((value) => value !== null))];

const getOS = (): OS => {
    if (config.os) return config.os;

    switch (process.platform) {
        case 'win32':
            return 'windows';
        case 'darwin':
            return 'osx';
        default:
            return 'linux';
    }
};

const checkSum = (hash: string, file: string): Promise<boolean> =>
    new Promise((resolve, reject) => {
        stat(file, (err, stat) => {
            if (err || !stat.isFile()) {
                log('debug', `Failed to check file due to ${err}`);
                return reject(err || new Error('Not a file'));
            }

            const hashStream = createHash('sha1');
            const fileStream = createReadStream(file);

            hashStream.setEncoding('hex');
            fileStream.pipe(hashStream, { end: false });

            fileStream.on('end', () => {
                hashStream.end();
                resolve(hash === hashStream.read());
            });
        });
    });

const isLegacy = (version: Version) => version.assets === 'legacy' || version.assets === 'pre-1.6';

export { popString, cleanUp, getOS, isLegacy, checkSum };
