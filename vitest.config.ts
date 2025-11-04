import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defineConfig, defineProject } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesRoot = join(__dirname, 'packages').replace(/\\/g, '/');

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
    include: ['tests/vitest/**/*.test.ts'],
    reporters: 'default',
    coverage: {
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage'
    },
    watchExclude: ['dist/**', 'build/**']
  },
  projects: [
    defineProject({
      name: 'unit',
      test: {
        include: ['tests/vitest/unit/**/*.test.ts']
      }
    }),
    defineProject({
      name: 'integration',
      test: {
        include: ['tests/vitest/integration/**/*.test.ts']
      }
    }),
    defineProject({
      name: 'cli',
      test: {
        include: ['tests/vitest/cli/**/*.test.ts']
      }
    }),
    defineProject({
      name: 'e2e',
      test: {
        include: ['**/tests/vitest/e2e/**/*.test.ts'],
        sequence: {
          concurrent: false
        },
        timeout: 20000
      }
    })
  ]
});
