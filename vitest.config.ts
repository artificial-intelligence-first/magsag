import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { defineConfig, defineProject } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packagesRoot = join(__dirname, 'packages').replace(/\\/g, '/');
const serversRoot = join(__dirname, 'servers').replace(/\\/g, '/');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@magsag\/servers\/(.+)$/,
        replacement: `${serversRoot}/$1/index.ts`
      },
      {
        find: /^@magsag\/([^/]+)\/(.+)$/,
        replacement: `${packagesRoot}/$1/src/$2`
      },
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
    reporters: ['default'],
    coverage: {
      enabled: true,
      all: true,
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      include: [
        'packages/runner-openai-agents/src/index.ts',
        'packages/server/src/**/*.ts',
        'packages/worktree/src/**/*.ts'
      ],
      exclude: ['**/*.test.ts', '**/__mocks__/**'],
      thresholds: {
        global: {
          statements: 80,
          branches: 70,
          functions: 75,
          lines: 80
        }
      }
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
