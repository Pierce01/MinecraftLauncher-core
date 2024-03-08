import type { JestConfigWithTsJest } from 'ts-jest';

const jestConfig: JestConfigWithTsJest = {
    preset: 'ts-jest',
    testMatch: ['<rootDir>/tests/**/*.ts'],
};

export default jestConfig;
