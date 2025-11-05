import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      '@magsag/core': join(__dirname, '../core/src/index.ts')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    include: ['src/**/*.test.ts']
  }
});
