import { existsSync, rm } from 'node:fs';

// A simple way to delete the `build` folder
// instead of `rm -rf` which is limited per OS
if (existsSync('build')) rm('build', { recursive: true, force: true }, () => void 0);
