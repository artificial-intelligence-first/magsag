import { describe, expect, test, vi } from 'vitest';
import type { Runner, RunnerEvent, RunnerFactory, RunSpec } from '@magsag/core';
import type { CatalogMcpRuntime } from '../mcp/runtime-manager.js';
import { withCatalogMcpRuntime, type McpRuntimeLauncher } from './mcp.js';

describe('withCatalogMcpRuntime', () => {
  test('injects MCP metadata and stops runtime', async () => {
    const runnerEvents: RunnerEvent[] = [{ type: 'log', data: 'inner runner' }];
    let receivedSpec: RunSpec | undefined;
    const stubRunner: Runner = {
      async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
        receivedSpec = spec;
        yield* runnerEvents;
        yield { type: 'done' };
      }
    };

    const factory: RunnerFactory = {
      id: 'codex-cli',
      create: () => stubRunner
    };

    const stop = vi.fn().mockResolvedValue(undefined);

    const runtime: CatalogMcpRuntime = {
      runtime: {} as unknown as CatalogMcpRuntime['runtime'],
      http: {
        url: 'http://127.0.0.1:3333/mcp',
        host: '127.0.0.1',
        port: 3333,
        path: '/mcp'
      },
      tools: ['skill.task-decomposition'],
      stop
    };

    const launcher: McpRuntimeLauncher = vi.fn(async () => runtime);

    const decoratedFactory = withCatalogMcpRuntime(factory, launcher);
    const runner = decoratedFactory.create();

    const collected: RunnerEvent[] = [];
    const spec: RunSpec = {
      engine: 'codex-cli',
      repo: '/workspace/repo',
      prompt: 'hello'
    };

    for await (const event of runner.run(spec)) {
      collected.push(event);
    }

    expect(launcher).toHaveBeenCalledWith('/workspace/repo');
    expect(stop).toHaveBeenCalledTimes(1);

    expect(receivedSpec?.extra?.mcp?.runtime.url).toBe('http://127.0.0.1:3333/mcp');
    expect(receivedSpec?.extra?.mcp?.tools).toEqual(['skill.task-decomposition']);

    const logMessages = collected
      .filter((event) => event.type === 'log')
      .map((event) => (event as Extract<RunnerEvent, { type: 'log' }>).data);
    expect(logMessages[0]).toContain('MCP runtime listening at http://127.0.0.1:3333/mcp');
    expect(logMessages[1]).toContain('Registered MCP tools');
  });
});
