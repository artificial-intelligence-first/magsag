import type { Runner, RunnerEvent, RunnerFactory, RunSpec } from '@magsag/core';
import { launchCatalogMcpRuntime, type CatalogMcpRuntime } from '../mcp/runtime-manager.js';

export type McpRuntimeLauncher = (repoPath: string) => Promise<CatalogMcpRuntime>;

export const withCatalogMcpRuntime = (
  factory: RunnerFactory,
  launcher: McpRuntimeLauncher = launchCatalogMcpRuntime
): RunnerFactory => ({
  id: factory.id,
  create(config) {
    const inner = factory.create(config);
    return new CatalogMcpRunner(inner, launcher);
  }
});

class CatalogMcpRunner implements Runner {
  constructor(
    private readonly inner: Runner,
    private readonly launcher: McpRuntimeLauncher
  ) {}

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const runtime = await this.launcher(spec.repo);

    const enhancedSpec: RunSpec = {
      ...spec,
      extra: {
        ...(spec.extra ?? {}),
        mcp: {
          runtime: runtime.http,
          tools: runtime.tools
        }
      }
    };

    let stopError: unknown;

    try {
      yield {
        type: 'log',
        data: `MCP runtime listening at ${runtime.http.url}`
      };

      if (runtime.tools.length > 0) {
        yield {
          type: 'log',
          data: `Registered MCP tools: ${runtime.tools.join(', ')}`
        };
      } else {
        yield {
          type: 'log',
          data: 'No MCP tools registered for this run.'
        };
      }

      for await (const event of this.inner.run(enhancedSpec)) {
        yield event;
      }
    } finally {
      try {
        await runtime.stop();
      } catch (error) {
        stopError = error;
      }
    }

    if (stopError) {
      yield {
        type: 'log',
        data: `Failed to stop MCP runtime cleanly: ${formatError(stopError)}`
      };
    }
  }
}

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
};
