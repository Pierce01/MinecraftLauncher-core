import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { Agent as http } from 'node:http';
import { Agent as https } from 'node:https';
import { join } from 'node:path';
import { checkSum } from '@utils';
import { config } from '@utils/config';
import { log } from '@utils/log';
import axios, { AxiosInstance } from 'axios';

class FileDownloader {
    axios: AxiosInstance;

    constructor() {
        this.axios = axios.create({
            responseType: 'stream',
            timeout: config.timeout || 50000,
            httpAgent: new http({ maxSockets: config.maxSockets || Infinity }),
            httpsAgent: new https({ maxSockets: config.maxSockets || Infinity }),
        });
    }

    async download(
        url: string,
        directory: string,
        name: string,
        type: string,
        sha1: string | null,
        retry: boolean = true,
    ): Promise<boolean> {
        const fileToCheck = join(directory, name);

        try {
            mkdirSync(directory, { recursive: true });

            const response = await this.axios.get(url);
            const totalBytes = parseInt(response.headers['content-length']);
            let receivedBytes = 0;

            response.data.on('data', (data: Buffer | string) => {
                typeof data === 'string' ? (receivedBytes += Buffer.byteLength(data)) : (receivedBytes += data.length);

                log('download-status', {
                    name: name,
                    type: type,
                    current: receivedBytes,
                    total: totalBytes,
                });
            });

            await response.data.pipe(createWriteStream(fileToCheck));

            return new Promise((resolve, reject) => {
                response.data.on('finish', async () => {
                    if (sha1) {
                        const sum = await checkSum(sha1, fileToCheck);
                        if (!sum) {
                            if (retry) await this.download(url, directory, name, type, sha1, false);
                            reject(false);
                        }
                    }

                    resolve(true);
                });

                response.data.on('error', async (e: Error) => {
                    log('debug', `Failed to download asset to ${fileToCheck} due to\n${e}. Retrying...`);
                    if (existsSync(fileToCheck)) unlinkSync(fileToCheck);
                    if (retry) await this.download(url, directory, name, type, sha1, false);
                    reject(false);
                });
            });
        } catch (error) {
            log('debug', `Failed to download asset to ${fileToCheck} due\n${error}. Retrying...`);
            if (retry) await this.download(url, directory, name, type, sha1, false);
            return false;
        }
    }
}

export default FileDownloader;
