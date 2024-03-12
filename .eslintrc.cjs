/** @type {import('eslint').Linter.Config} */
module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        project: './tsconfig.json',
        tsconfigRootDir: './',
    },
    env: {
        browser: true,
        es6: true,
    },
    plugins: ['prettier', '@typescript-eslint'],
    extends: ['plugin:prettier/recommended', 'eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    rules: {
        eqeqeq: 'error',
        'prettier/prettier': ['error', {}, { usePrettierrc: true }],
        '@typescript-eslint/no-explicit-any': 0,
        'no-use-before-define': 0,
        '@typescript-eslint/no-use-before-define': 'warn',
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
    },
};
