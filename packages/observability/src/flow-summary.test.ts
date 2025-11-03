import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { summarizeFlowRuns } from './flow-summary.js';

const createTempDir = async () => {
  const base = await mkdtemp(join(tmpdir(), 'magsag-flow-summary-'));
  return base;
};

describe('summarizeFlowRuns', () => {
  it('aggregates metrics from flow run artifacts', async () => {
    const base = await createTempDir();
    const runDir = join(base, '20251104-000000');
    await mkdir(runDir);

    await writeFile(
      join(runDir, 'summary.json'),
      JSON.stringify(
        {
          status: 'success',
          failures: []
        },
        null,
        2
      ),
      'utf8'
    );

    await writeFile(
      join(runDir, 'runs.jsonl'),
      [
        JSON.stringify({
          event: 'end',
          step: 'hello',
          status: 'success',
          latency_ms: 100,
          extra: { type: 'mcp', model: 'gpt-4.1' }
        }),
        JSON.stringify({
          event: 'end',
          step: 'finalize',
          status: 'error',
          latency_ms: 200,
          extra: { error: { type: 'timeout' } }
        })
      ].join('\n'),
      'utf8'
    );

    await writeFile(
      join(runDir, 'mcp_calls.jsonl'),
      JSON.stringify({
        status: 'ok',
        model: 'gpt-4.1',
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, cost_usd: 0.05 }
      }),
      'utf8'
    );

    const summary = await summarizeFlowRuns(base);

    expect(summary.runs).toBe(1);
    expect(summary.successes).toBe(1);
    expect(summary.success_rate).toBeCloseTo(1);
    expect(summary.avg_latency_ms).toBeCloseTo((100 + 200) / 2);
    expect(summary.errors.total).toBe(1);
    expect(summary.errors.by_type.timeout).toBe(1);

    const hello = summary.steps.find((step) => step.name === 'hello');
    expect(hello).toBeDefined();
    expect(hello?.successes).toBe(1);
    expect(hello?.mcp?.calls).toBe(1);

    const finalize = summary.steps.find((step) => step.name === 'finalize');
    expect(finalize?.errors).toBe(1);

    expect(summary.models[0]?.name).toBe('gpt-4.1');
    expect(summary.models[0]?.tokens.total).toBe(30);
  });

  it('returns default summary when directory missing', async () => {
    const summary = await summarizeFlowRuns('/path/does/not/exist');
    expect(summary.runs).toBe(0);
    expect(summary.steps).toEqual([]);
  });
});
