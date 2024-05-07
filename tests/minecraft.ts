import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { Client } from '../src';

describe('Minecraft 1.8.9', () => {
    const client = new Client({
        version: {
            number: '1.8.9',
            type: 'release',
        },
    });

    test(
        'Installation',
        async () => {
            await client.install();
            expect(existsSync(resolve('./minecraft/natives/1.8.9'))).toBe(true);
            expect(existsSync(resolve('./minecraft/versions/1.8.9/1.8.9.jar'))).toBe(true);
            expect(existsSync(resolve('./minecraft/versions/1.8.9/1.8.9.json'))).toBe(true);
        },
        3 * 60 * 1000,
    );
});

describe('Minecraft 1.14.4', () => {
    const client = new Client({
        version: {
            number: '1.14.4',
            type: 'release',
        },
    });

    test(
        'Installation',
        async () => {
            await client.install();
            expect(existsSync(resolve('./minecraft/natives/1.14.4'))).toBe(true);
            expect(existsSync(resolve('./minecraft/versions/1.14.4/1.14.4.jar'))).toBe(true);
            expect(existsSync(resolve('./minecraft/versions/1.14.4/1.14.4.json'))).toBe(true);
        },
        3 * 60 * 1000,
    );
});
