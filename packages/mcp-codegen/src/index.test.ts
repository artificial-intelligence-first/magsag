import { describe, expect, it } from 'vitest';
import { __test__ } from './index.js';

describe('parseArgs', () => {
  it('resolves default directories', () => {
    const cwd = '/workspace/project';
    const options = __test__.parseArgs([], cwd);
    expect(options.serversDir).toBe('/workspace/project/tools/adk/servers');
    expect(options.outputDir).toBe('/workspace/project/servers');
  });

  it('detects --check flag', () => {
    const cwd = '/workspace/project';
    const options = __test__.parseArgs(['--check'], cwd);
    expect(options.check).toBe(true);
  });
});
