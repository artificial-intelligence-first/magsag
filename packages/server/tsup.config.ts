import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  dts: true,
  clean: true,
  shims: false,
  splitting: false,
  external: [
    /^@magsag\//,
    /^@modelcontextprotocol\/sdk/,
    /^hono/,
    'ws',
    'zod-to-json-schema'
  ]
});
