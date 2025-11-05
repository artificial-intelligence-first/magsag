import { describe, expect, it } from 'vitest';
import { parseMcpBrowse } from './mcp-browse.js';

describe('parseMcpBrowse', () => {
  it('defaults to filesystem server and no path', async () => {
    const parsed = await parseMcpBrowse([]);
    expect(parsed.kind).toBe('mcp:browse');
    expect(parsed.serverId).toBe('filesystem');
    expect(parsed.path).toBeUndefined();
    expect(parsed.json).toBe(false);
  });
});
