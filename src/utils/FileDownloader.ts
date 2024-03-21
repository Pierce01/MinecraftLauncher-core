import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { Agent as http } from 'node:http';
import { Agent as https } from 'node:https';
import { join } from 'node:path';
import { checkSum } from '@utils';
import { config } from '@utils/config';
import { log } from '@utils/log';
import axios, { AxiosInstance } from 'axios';

interface DownloadableFile {
    url: string;
    directory: string;
    name: string;
    type: string;
    hash?: string;
    retriedCount?: number;
}

class FileDownloader {
    axios: AxiosInstance;
    maxParallel: number;
    maxRetries: number;
    queue: DownloadableFile[] = [];
    private _counter: number = 0;
    private _total: number = 0;

    constructor(maxParallel?: number, maxRetries?: number) {
        this.axios = axios.create({
            responseType: 'stream',
            timeout: config.timeout || 50000,
            httpAgent: new http({ maxSockets: config.maxSockets || Infinity }),
            httpsAgent: new https({ maxSockets: config.maxSockets || Infinity }),
        });
        this.maxParallel = maxParallel || 5;
        this.maxRetries = maxRetries || 5;
    }

    public add(file: DownloadableFile) {
        this.queue.push(file);
        this._total++;
    }

    public reset() {
        this.queue = [];
        this._counter = 0;
        this._total = 0;
    }

    public get counter() {
        return this._counter;
    }

    public get total() {
        return this._total;
    }

    public async start() {
        const promises: Promise<boolean>[] = [];

        while (this.queue.length > 0 && this.counter < this.maxParallel) {
            const file = this.queue.shift();
            if (file) {
                this._counter++;
                promises.push(this.download(file));
            }
        }

        try {
            await Promise.all(promises);
        } catch (err) {
            console.error(err);
        }
    }

    private onDownloadFinished() {
        this._counter++;
        const nextFile = this.queue.shift();
        if (nextFile) this.download(nextFile);
    }

    public async download(file: DownloadableFile): Promise<boolean> {
        const fileToCheck = join(file.directory, file.name);

        try {
            mkdirSync(file.directory, { recursive: true });

            const response = await this.axios.get(file.url);
            const totalBytes = parseInt(response.headers['content-length']);
            let receivedBytes = 0;

            response.data.on('data', (data: Buffer | string) => {
                typeof data === 'string' ? (receivedBytes += Buffer.byteLength(data)) : (receivedBytes += data.length);

                log('download-status', {
                    name: file.name,
                    type: file.type,
                    current: receivedBytes,
                    total: totalBytes,
                });
            });

            const fileStream = createWriteStream(fileToCheck);
            response.data.pipe(fileStream);

            return await new Promise((resolve, reject) => {
                fileStream.on('finish', async () => {
                    if (file.hash) {
                        const sum = await checkSum(file.hash, fileToCheck);
                        if (!sum) this.onFileDownloadFailed(file);
                    }

                    this.onDownloadFinished();
                    resolve(true);
                });

                fileStream.on('error', (error: Error) => {
                    log('debug', `Failed to download asset to ${fileToCheck} due\n${error}. Retrying...`);
                    if (existsSync(fileToCheck)) unlinkSync(fileToCheck);

                    this.onFileDownloadFailed(file);
                    reject();
                });
            });
        } catch (error) {
            log('debug', `Failed to download asset to ${fileToCheck} due\n${error}. Retrying...`);
            this.onFileDownloadFailed(file);
            return false;
        }
    }

    private onFileDownloadFailed(file: DownloadableFile) {
        file.retriedCount = file.retriedCount ? file.retriedCount + 1 : 1;
        if (file.retriedCount >= this.maxRetries)
            throw new Error(
                `Failed to download asset too many times. ${file.name} has been retried ${this.maxRetries} times and still failed.`,
            );

        this._counter--;
        this._total--;
        this.add(file);
        return;
    }
}

export default FileDownloader;
