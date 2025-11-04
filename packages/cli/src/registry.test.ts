import { describe, expect, it, vi } from 'vitest';

vi.mock('./runner/mcp.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./runner/mcp.js')>();
  return {
    ...actual,
    withCatalogMcpRuntime: vi.fn(
      (factory: import('@magsag/core').RunnerFactory) => factory
    )
  };
});

describe('createDefaultRunnerRegistry', () => {
  it('wraps runner factories with the catalog MCP runtime', async () => {
    const { createDefaultRunnerRegistry } = await import('./registry.js');
    const { withCatalogMcpRuntime } = await import('./runner/mcp.js');

    createDefaultRunnerRegistry();

    const wrapped = withCatalogMcpRuntime as unknown as ReturnType<typeof vi.fn>;
    expect(wrapped).toHaveBeenCalledTimes(5);
  });
});
