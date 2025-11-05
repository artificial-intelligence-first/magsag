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
      '@magsag/mcp-server': fromPackage('../mcp-server/src/index.ts'),
      '@magsag/manager': fromPackage('../manager/src/index.ts'),
      '@magsag/specialist': fromPackage('../specialist/src/index.ts'),
      '@magsag/worktree': fromPackage('../worktree/src/index.ts'),
      '@magsag/observability': fromPackage('../observability/src/index.ts'),
      '@magsag/shared-logging': fromPackage('../shared-logging/src/index.ts')
    }
  }
});
