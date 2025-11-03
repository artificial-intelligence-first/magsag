import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { evaluateFlowSummary } from './flow-gate.js';

const createTempSummary = async (summary: Record<string, unknown>) => {
  const dir = await mkdtemp(join(tmpdir(), 'magsag-flow-gate-'));
  const summaryPath = join(dir, 'summary.json');
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  return summaryPath;
};

describe('evaluateFlowSummary', () => {
  it('passes the default policy when requirements are met', async () => {
    const summaryPath = await createTempSummary({
      runs: 1,
      successes: 1,
      success_rate: 1,
      avg_latency_ms: 1500,
      errors: { total: 0, by_type: {} },
      mcp: {
        calls: 1,
        errors: 0,
        tokens: { input: 10, output: 20, total: 30 },
        cost_usd: 0.05
      },
      steps: [
        {
          name: 'hello',
          runs: 1,
          successes: 1,
          errors: 0,
          success_rate: 1,
          avg_latency_ms: 1500,
          mcp: { calls: 1, errors: 0 },
          models: ['gpt-4.1']
        }
      ],
      models: [
        {
          name: 'gpt-4.1',
          calls: 1,
          errors: 0,
          tokens: { input: 10, output: 20, total: 30 },
          cost_usd: 0.05
        }
      ]
    });

    const errors = await evaluateFlowSummary(summaryPath);
    expect(errors).toEqual([]);
  });

  it('reports violations when policy thresholds are exceeded', async () => {
    const summaryPath = await createTempSummary({
      runs: 2,
      successes: 1,
      success_rate: 0.5,
      avg_latency_ms: 4000,
      errors: { total: 1, by_type: { timeout: 1 } },
      mcp: {
        calls: 2,
        errors: 1,
        tokens: { input: 10, output: 20, total: 30 },
        cost_usd: 0.1
      },
      steps: [
        {
          name: 'hello',
          runs: 2,
          successes: 1,
          errors: 1,
          success_rate: 0.5,
          avg_latency_ms: 4000,
          mcp: { calls: 2, errors: 1 },
          models: ['internal-experimental-foo']
        }
      ],
      models: [
        {
          name: 'internal-experimental-foo',
          calls: 2,
          errors: 1,
          tokens: { input: 10, output: 20, total: 30 },
          cost_usd: 0.1
        }
      ]
    });

    const errors = await evaluateFlowSummary(summaryPath);
    expect(errors).not.toHaveLength(0);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('success_rate'),
        expect.stringContaining('avg_latency_ms'),
        expect.stringContaining("model 'internal-experimental-foo' is denied")
      ])
    );
  });

  it('applies custom policy overrides', async () => {
    const summaryPath = await createTempSummary({
      runs: 1,
      successes: 1,
      success_rate: 1,
      avg_latency_ms: 100,
      errors: { total: 0, by_type: {} },
      mcp: {
        calls: 1,
        errors: 0,
        tokens: { input: 1, output: 2, total: 3 },
        cost_usd: 0.01
      },
      steps: [
        {
          name: 'hello',
          runs: 1,
          successes: 1,
          errors: 0,
          success_rate: 1,
          avg_latency_ms: 100,
          mcp: { calls: 1, errors: 0 },
          models: ['custom-model']
        }
      ],
      models: [
        {
          name: 'custom-model',
          calls: 1,
          errors: 0,
          tokens: { input: 1, output: 2, total: 3 },
          cost_usd: 0.01
        }
      ]
    });

    const policyPath = await (async () => {
      const dir = await mkdtemp(join(tmpdir(), 'magsag-policy-'));
      const path = join(dir, 'policy.yaml');
      await writeFile(
        path,
        [
          'min_runs: 1',
          'per_step:',
          '  hello:',
          '    max_error_rate: 0.0',
          'models:',
          '  allowlist:',
          '    - custom-*'
        ].join('\n'),
        'utf8'
      );
      return path;
    })();

    const errors = await evaluateFlowSummary(summaryPath, policyPath);
    expect(errors).toEqual([]);
  });
});
