import { describe, expect, test, vi } from 'vitest';
import { parseMcpLs, mcpLsHandler } from './mcp-ls.js';
import * as configModule from '../mcp/config.js';

describe('parseMcpLs', () => {
  test('parses without arguments', async () => {
    const parsed = await parseMcpLs([]);
    expect(parsed).toEqual({ kind: 'mcp:ls', serverId: undefined, json: false });
  });

  test('parses server argument', async () => {
    const parsed = await parseMcpLs(['notion']);
    expect(parsed.serverId).toBe('notion');
  });

  test('parses json flag', async () => {
    const parsed = await parseMcpLs(['--json']);
    expect(parsed.json).toBe(true);
  });
});

describe('mcpLsHandler', () => {
  test('prints empty message when server presets absent', async () => {
    const loadSpy = vi
      .spyOn(configModule, 'loadMcpServerDefinitions')
      .mockResolvedValueOnce([]);

    const stdoutWrite = vi.fn();
    const stderrWrite = vi.fn();

    await mcpLsHandler({ kind: 'mcp:ls', json: false }, {
      stdout: { write: stdoutWrite } as unknown as NodeJS.WritableStream,
      stderr: { write: stderrWrite } as unknown as NodeJS.WritableStream
    });

    expect(loadSpy).toHaveBeenCalled();
    const stdoutOutput = stdoutWrite.mock.calls.map(([chunk]) => chunk).join('');
    expect(stdoutOutput).toContain('No MCP server presets found');
    expect(stderrWrite).not.toHaveBeenCalled();
  });
});
