import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesRoot = join(__dirname, '..', '..', 'packages').replace(/\\/g, '/');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@magsag\/(.+)$/,
        replacement: `${packagesRoot}/$1/src/index.ts`
      }
    ]
  },
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    include: ['src/**/*.test.ts']
  }
});
