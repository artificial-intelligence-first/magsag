import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const demoCliModuleUrl = pathToFileURL(
  resolve(repoRoot, 'apps', 'demo-cli', 'src', 'index.ts')
);

describe('demo CLI entrypoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('logs the help message when no command is provided', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await import(demoCliModuleUrl.href);

    // The CLI now prints multiple lines for the help message
    expect(logSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Usage: magsag-demo-cli <command>');
    expect(logSpy).toHaveBeenCalledWith('');
    expect(logSpy).toHaveBeenCalledWith('Commands:');
    expect(logSpy).toHaveBeenCalledWith('  mcp   Show available MCP presets and transports');
    expect(logSpy).toHaveBeenCalledWith('  plan  Summarise the repository cleanup ExecPlan');
  });
});
