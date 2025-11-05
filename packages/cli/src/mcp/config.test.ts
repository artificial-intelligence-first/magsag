import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMcpServerDefinitions } from './config.js';

const createPresetYaml = (id: string): string => `type: mcp
id: ${id}
transport:
  type: http
  url: https://example.com/${id}
`;

describe('loadMcpServerDefinitions', () => {
  it('falls back to next directory when earlier candidate is empty', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mcp-config-'));
    const toolsDir = join(root, 'tools', 'adk', 'servers');
    const legacyDir = join(root, 'ops', 'adk', 'servers');

    await mkdir(toolsDir, { recursive: true });
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'demo.yaml'), createPresetYaml('demo'), 'utf8');

    try {
      const definitions = await loadMcpServerDefinitions([toolsDir, legacyDir]);
      expect(definitions).toHaveLength(1);
      expect(definitions[0]?.id).toBe('demo');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
