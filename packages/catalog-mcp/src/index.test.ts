import { describe, expect, test } from 'vitest';
import { loadCatalogTools } from './index.js';

const repoPath = process.cwd();

describe('loadCatalogTools', () => {
  test('exposes baseline catalog tools', async () => {
    const tools = await loadCatalogTools({ repoPath });
    const names = tools.map((tool) => tool.name);

    expect(names).toContain('skill.task-decomposition');
    expect(names).toContain('skill.result-aggregation');
    expect(names).toContain('skill.test-helper-transform');
  });

  test('task decomposition tool produces JSON payload', async () => {
    const tools = await loadCatalogTools({ repoPath });
    const tool = tools.find((entry) => entry.name === 'skill.task-decomposition');
    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error('task decomposition tool missing');
    }

    const result = await tool.handler({ candidate_profile: { name: 'Test' } }, {} as never);
    expect(result.isError).toBe(false);
    const textContent = result.content.find(
      (entry): entry is { type: 'text'; text: string } => entry.type === 'text'
    );
    expect(textContent).toBeDefined();
    if (!textContent) {
      throw new Error('Text content missing');
    }
    const tasks = JSON.parse(textContent.text) as unknown[];
    expect(Array.isArray(tasks)).toBe(true);
  });
});
