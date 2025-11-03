import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  dts: true,
  clean: true,
  sourcemap: false,
  banner: {
    js: '#!/usr/bin/env node'
  },
  shims: false
});
