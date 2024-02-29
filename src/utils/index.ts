import { createHash } from 'node:crypto';
import { createReadStream, stat } from 'node:fs';
import { resolve as _resolve } from 'node:path';
import { config } from './config';
import { Version } from './types';

const popString = (path: string) => path.split('/').slice(0, -1).join('/');
const cleanUp = (array: string[]) => [...new Set(Object.values(array).filter((value) => value !== null))];

const getOS = () => {
    if (config.os) {
        return config.os;
    } else {
        switch (process.platform) {
            case 'win32':
                return 'windows';
            case 'darwin':
                return 'osx';
            default:
                return 'linux';
        }
    }
};

const checksumFile = (filename: string, callback: (error: Error | null, hash?: string) => void) => {
    stat(filename, (err, stat) => {
        if (!err && !stat.isFile()) err = new Error('Not a file');
        if (err) return callback(err);

        const hash = createHash('sha1');
        const fileStream = createReadStream(filename);

        hash.setEncoding('hex');
        fileStream.pipe(hash, { end: false });

        fileStream.on('end', function () {
            hash.end();
            callback(null, hash.read());
        });
    });
};

const isLegacy = (version: Version) => version.assets === 'legacy' || version.assets === 'pre-1.6';

export { popString, cleanUp, getOS, checksumFile, isLegacy };
