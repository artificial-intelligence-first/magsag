import { describe, expect, it } from 'vitest';
import { parseMcpSearch } from './mcp-search.js';

describe('parseMcpSearch', () => {
  it('parses query and optional server flag', async () => {
    const parsed = await parseMcpSearch(['--server', 'notion', 'templates']);
    expect(parsed.kind).toBe('mcp:search');
    expect(parsed.serverId).toBe('notion');
    expect(parsed.query).toBe('templates');
    expect(parsed.json).toBe(false);
  });
});
