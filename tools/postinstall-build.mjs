#!/usr/bin/env node

/**
 * Safely trigger workspace builds after install.
 *
 * Skips execution when running in production installs (NODE_ENV=production) or
 * when devDependencies are not present.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

const isProduction = () => process.env.NODE_ENV === 'production';

const hasDevTools = () => {
  try {
    require.resolve('tsup');
    return true;
  } catch {
    return existsSync(join(rootDir, 'node_modules', '.bin', 'tsup'));
  }
};

const main = async () => {
  if (isProduction()) {
    return;
  }
  if (!hasDevTools()) {
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['-r', 'build'], {
      stdio: 'inherit',
      cwd: rootDir,
      env: process.env
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pnpm -r build exited with code ${code}`));
      }
    });
  });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
