import { describe, expect, it, vi } from 'vitest';
import { callMcpTool, createPostgresQuery, type McpExecutionContext } from './execution.js';

const createContext = (overrides: Partial<McpExecutionContext> = {}): McpExecutionContext => {
  const invokeTool = vi.fn(async () => ({ success: true, output: { rows: [] } }));
  const queryPostgres = vi.fn(async () => ({ success: true, output: { rows: [] } }));
  return {
    invokeTool,
    queryPostgres,
    emitLog: vi.fn(),
    ...overrides
  } satisfies McpExecutionContext;
};

describe('callMcpTool', () => {
  it('invokes the MCP context and returns typed output', async () => {
    const context = createContext({
      invokeTool: vi.fn(async () => ({ success: true, output: { value: 42 } }))
    });

    const run = callMcpTool<{ foo: string }, { value: number }>({
      serverId: 'demo',
      toolName: 'echo'
    });

    const result = await run(context, { foo: 'bar' });
    expect(result).toEqual({ value: 42 });
    expect(context.invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: 'demo',
        toolName: 'echo',
        args: { foo: 'bar' }
      })
    );
  });

  it('computes cache keys unless disabled', async () => {
    const context = createContext({
      invokeTool: vi.fn(async () => ({ success: true, output: {} }))
    });
    const run = callMcpTool<{ q: string }, Record<string, never>>({
      serverId: 'demo',
      toolName: 'search'
    });

    await run(context, { q: 'hello' }, { cache: { disable: true } });
    expect(context.invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({ cacheKey: undefined, disableCache: true })
    );
  });

  it('throws when invocation fails', async () => {
    const context = createContext({
      invokeTool: vi.fn(async () => ({ success: false, error: 'boom' }))
    });
    const run = callMcpTool<Record<string, never>, Record<string, never>>({
      serverId: 'demo',
      toolName: 'broken'
    });

    await expect(run(context, {})).rejects.toThrow('boom');
  });
});

describe('createPostgresQuery', () => {
  it('delegates to queryPostgres()', async () => {
    const querySpy = vi.fn(async () => ({ success: true, output: { rows: [{ id: 1 }] } }));
    const context = createContext({ queryPostgres: querySpy });

    const runQuery = createPostgresQuery<{ sql: string }, { rows?: unknown[] }>({
      serverId: 'pg-readonly'
    });

    const result = await runQuery(context, { sql: 'SELECT 1' });
    expect(result.rows).toEqual([{ id: 1 }]);
    expect(querySpy).toHaveBeenCalledWith(
      expect.objectContaining({ serverId: 'pg-readonly', sql: 'SELECT 1' })
    );
  });
});
