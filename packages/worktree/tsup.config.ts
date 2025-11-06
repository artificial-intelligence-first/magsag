import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/manager.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  clean: true,
  dts: true,
  external: [/^@magsag\//],
  banner: {
    js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);"
  }
});
