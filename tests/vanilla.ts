import { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, rmdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { Client } from '../src';

describe('Minecraft Vanilla Legacy (1.8.9)', () => {
    test(
        'Installation',
        async () => {
            await new Client({
                version: {
                    number: '1.8.9',
                    type: 'release',
                },
            }).install();
            expect(existsSync(resolve('./minecraft/natives/1.8.9'))).toBe(true);
            expect(existsSync(resolve('./minecraft/versions/1.8.9/1.8.9.jar'))).toBe(true);
            expect(existsSync(resolve('./minecraft/versions/1.8.9/1.8.9.json'))).toBe(true);
        },
        3 * 60 * 1000,
    );

    test(
        'Starting',
        async () => {
            const process = await new Client({
                version: {
                    number: '1.8.9',
                    type: 'release',
                },
            }).start();
            expect(process && typeof process.kill === 'function').toBe(true);
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    (process as ChildProcessWithoutNullStreams).kill();
                    resolve();
                }, 10 * 1000);
            });
            expect(existsSync(resolve('./minecraft/saves'))).toBe(true);
            expect(existsSync(resolve('./minecraft/resourcepacks'))).toBe(true);
        },
        3 * 60 * 1000,
    );

    // Cleanup for other tests
    afterAll(() => {
        rmdirSync(resolve('./minecraft/saves'));
        rmdirSync(resolve('./minecraft/resourcepacks'));
    });
});

describe('Minecraft Vanilla Modern (1.14.4)', () => {
    test(
        'Installation',
        async () => {
            await new Client({
                version: {
                    number: '1.14.4',
                    type: 'release',
                },
            }).install();
            expect(existsSync(resolve('./minecraft/natives/1.14.4'))).toBe(true);
            expect(existsSync(resolve('./minecraft/versions/1.14.4/1.14.4.jar'))).toBe(true);
            expect(existsSync(resolve('./minecraft/versions/1.14.4/1.14.4.json'))).toBe(true);
        },
        3 * 60 * 1000,
    );

    test(
        'Starting',
        async () => {
            const process = await new Client({
                version: {
                    number: '1.14.4',
                    type: 'release',
                },
            }).start();
            expect(process && typeof process.kill === 'function').toBe(true);
            await new Promise<void>((resolve) => {
                setTimeout(() => {
                    (process as ChildProcessWithoutNullStreams).kill();
                    resolve();
                }, 10 * 1000);
            });
            expect(existsSync(resolve('./minecraft/saves'))).toBe(true);
            expect(existsSync(resolve('./minecraft/resourcepacks'))).toBe(true);
        },
        3 * 60 * 1000,
    );

    // Cleanup for other tests
    afterAll(() => {
        rmdirSync(resolve('./minecraft/saves'));
        rmdirSync(resolve('./minecraft/resourcepacks'));
    });
});
