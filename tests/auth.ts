import { describe, expect, test } from 'vitest';
import { offline } from '../src';

describe('Testing the offline authentication', () => {
    test('Using Pierce as the username', () => {
        expect(offline('Pierce')).toStrictEqual({
            access_token: '882661dc-e54f-35ae-b9e7-6c691a8095cb',
            client_token: '882661dc-e54f-35ae-b9e7-6c691a8095cb',
            uuid: '882661dc-e54f-35ae-b9e7-6c691a8095cb',
            name: 'Pierce',
            user_properties: '{}',
        });
    });
});
