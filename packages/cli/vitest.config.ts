import path from 'node:path';
import { defineConfig } from 'vitest/config';

const fromPackage = (relative: string) => path.resolve(__dirname, relative);

export default defineConfig({
  test: {
    environment: 'node'
  },
  resolve: {
    alias: {
      '@magsag/catalog-mcp': fromPackage('../catalog-mcp/src/index.ts'),
      '@magsag/mcp-client': fromPackage('../mcp-client/src/mcp-client.ts'),
      '@magsag/mcp-server': fromPackage('../mcp-server/src/index.ts')
    }
  }
});
