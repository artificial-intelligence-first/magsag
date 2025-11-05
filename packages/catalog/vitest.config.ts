import path from 'node:path';
import { defineConfig } from 'vitest/config';

const fromRepo = (relative: string) => path.resolve(__dirname, relative);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    clearMocks: true,
    include: ['src/__tests__/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@magsag/servers': fromRepo('../../servers')
    }
  }
});
