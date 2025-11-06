import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesRoot = join(__dirname, '..').replace(/\\/g, '/');

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
    include: ['src/**/*.test.ts'],
  },
});
