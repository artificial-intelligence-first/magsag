import { loadCatalogTools } from '@magsag/catalog-mcp';
import type { RunnerMcpRuntime } from '@magsag/core';
import {
  createMcpServerRuntime,
  type McpServerRuntime,
  type ToolDefinition
} from '@magsag/mcp-server';

const IMPLEMENTATION = {
  name: 'magsag-catalog-mcp',
  version: '2.0.0-alpha.0'
} as const;

export interface CatalogMcpRuntime {
  runtime: McpServerRuntime;
  http: RunnerMcpRuntime;
  tools: string[];
  stop(): Promise<void>;
}

export const launchCatalogMcpRuntime = async (repoPath: string): Promise<CatalogMcpRuntime> => {
  const runtime = createMcpServerRuntime({
    implementation: IMPLEMENTATION,
    http: {
      host: '127.0.0.1',
      port: 0,
      path: '/mcp'
    }
  });

  let registeredTools: ToolDefinition[] = [];

  try {
    registeredTools = await loadCatalogTools({ repoPath });
    for (const tool of registeredTools) {
      runtime.registerTool(tool);
    }

    await runtime.start();

    const address = runtime.getHttpAddress();
    if (!address) {
      throw new Error('MCP runtime did not provide an HTTP address');
    }

    const http: RunnerMcpRuntime = {
      url: address.url.toString(),
      host: address.host,
      port: address.port,
      path: address.path
    };

    const toolNames = registeredTools.map((tool) => tool.name);

    return {
      runtime,
      http,
      tools: toolNames,
      stop: async () => {
        await runtime.stop();
      }
    };
  } catch (error) {
    await shutdownQuietly(runtime);
    throw error;
  }
};

const shutdownQuietly = async (runtime: McpServerRuntime) => {
  try {
    await runtime.stop();
  } catch {
    // Suppress shutdown errors during launch failure cleanup.
  }
};
