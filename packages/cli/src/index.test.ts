import { describe, expect, it } from 'vitest';

import { __test__ } from './index.js';

describe('resolveCommand', () => {
  it('treats "ls" as part of the mcp alias rather than an argument', () => {
    const { registration, rest } = __test__.resolveCommand(['mcp', 'ls']);
    expect(registration?.id).toBe('mcp:ls');
    expect(rest).toEqual([]);
  });

  it('passes server id through when invoked as `mcp <server>`', () => {
    const { registration, rest } = __test__.resolveCommand(['mcp', 'notion']);
    expect(registration?.id).toBe('mcp:ls');
    expect(rest).toEqual(['notion']);
  });

  it('resolves `mcp doctor` to the doctor command', () => {
    const { registration, rest } = __test__.resolveCommand(['mcp', 'doctor']);
    expect(registration?.id).toBe('mcp:doctor');
    expect(rest).toEqual([]);
  });
});
