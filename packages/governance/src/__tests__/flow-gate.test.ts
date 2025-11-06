import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { evaluateFlowSummary } from '../flow-gate.js';

const TEST_DIR = join(process.cwd(), '.test-governance');

describe('evaluateFlowSummary', () => {
  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should pass with valid flow summary', async () => {
    const summaryPath = join(TEST_DIR, 'valid-summary.json');
    const summary = {
      runs: 10,
      success_rate: 0.95,
      avg_latency_ms: 2000,
      steps: [
        {
          name: 'hello',
          runs: 10,
          successes: 9,
          avg_latency_ms: 1500,
        },
      ],
    };

    await writeFile(summaryPath, JSON.stringify(summary));

    const errors = await evaluateFlowSummary(summaryPath);
    expect(errors).toEqual([]);
  });

  it('should fail when runs below minimum', async () => {
    const summaryPath = join(TEST_DIR, 'low-runs.json');
    const summary = {
      runs: 0,
      success_rate: 1.0,
      avg_latency_ms: 1000,
      steps: [],
    };

    await writeFile(summaryPath, JSON.stringify(summary));

    const errors = await evaluateFlowSummary(summaryPath);
    expect(errors).toContain('runs 0 < min 1');
  });

  it('should fail when success rate below minimum', async () => {
    const summaryPath = join(TEST_DIR, 'low-success-rate.json');
    const summary = {
      runs: 10,
      success_rate: 0.5,
      avg_latency_ms: 1000,
      steps: [
        {
          name: 'hello',
          runs: 10,
          successes: 5,
          avg_latency_ms: 1000,
        },
      ],
    };

    await writeFile(summaryPath, JSON.stringify(summary));

    const errors = await evaluateFlowSummary(summaryPath);
    expect(errors.some((e) => e.includes('success_rate'))).toBe(true);
  });

  it('should fail when latency above maximum', async () => {
    const summaryPath = join(TEST_DIR, 'high-latency.json');
    const summary = {
      runs: 10,
      success_rate: 1.0,
      avg_latency_ms: 5000,
      steps: [
        {
          name: 'hello',
          runs: 10,
          successes: 10,
          avg_latency_ms: 5000,
        },
      ],
    };

    await writeFile(summaryPath, JSON.stringify(summary));

    const errors = await evaluateFlowSummary(summaryPath);
    expect(errors.some((e) => e.includes('avg_latency_ms'))).toBe(true);
  });

  it('should fail when required step is missing', async () => {
    const summaryPath = join(TEST_DIR, 'missing-step.json');
    const summary = {
      runs: 10,
      success_rate: 1.0,
      avg_latency_ms: 1000,
      steps: [
        {
          name: 'other-step',
          runs: 10,
          successes: 10,
          avg_latency_ms: 1000,
        },
      ],
    };

    await writeFile(summaryPath, JSON.stringify(summary));

    const errors = await evaluateFlowSummary(summaryPath);
    expect(errors.some((e) => e.includes('missing required steps'))).toBe(true);
    expect(errors.some((e) => e.includes('hello'))).toBe(true);
  });

  it('should detect denied models', async () => {
    const summaryPath = join(TEST_DIR, 'denied-model.json');
    const summary = {
      runs: 5,
      success_rate: 1.0,
      avg_latency_ms: 1000,
      steps: [
        {
          name: 'hello',
          runs: 5,
          successes: 5,
          avg_latency_ms: 1000,
          models: ['gpt-4o-realtime'],
        },
      ],
    };

    await writeFile(summaryPath, JSON.stringify(summary));

    const errors = await evaluateFlowSummary(summaryPath);
    expect(errors.some((e) => e.includes('denied'))).toBe(true);
    expect(errors.some((e) => e.includes('gpt-4o-realtime'))).toBe(true);
  });

  it('should detect denied models with wildcards', async () => {
    const summaryPath = join(TEST_DIR, 'denied-wildcard.json');
    const summary = {
      runs: 5,
      success_rate: 1.0,
      avg_latency_ms: 1000,
      steps: [
        {
          name: 'hello',
          runs: 5,
          successes: 5,
          avg_latency_ms: 1000,
          models: ['internal-experimental-v1'],
        },
      ],
    };

    await writeFile(summaryPath, JSON.stringify(summary));

    const errors = await evaluateFlowSummary(summaryPath);
    expect(errors.some((e) => e.includes('denied'))).toBe(true);
  });

  it('should use custom policy when provided', async () => {
    const summaryPath = join(TEST_DIR, 'custom-policy-summary.json');
    const policyPath = join(TEST_DIR, 'custom-policy.yaml');

    const summary = {
      runs: 10,
      success_rate: 0.95,
      avg_latency_ms: 1000,
      steps: [
        {
          name: 'test-step',
          runs: 10,
          successes: 9,
          avg_latency_ms: 1000,
        },
      ],
    };

    const policy = `
min_runs: 20
min_success_rate: 0.99
required_steps:
  - test-step
`;

    await writeFile(summaryPath, JSON.stringify(summary));
    await writeFile(policyPath, policy);

    const errors = await evaluateFlowSummary(summaryPath, policyPath);
    expect(errors.some((e) => e.includes('runs 10 < min 20'))).toBe(true);
    expect(errors.some((e) => e.includes('success_rate'))).toBe(true);
  });

  it('should evaluate step-specific policies', async () => {
    const summaryPath = join(TEST_DIR, 'step-policy.json');
    const policyPath = join(TEST_DIR, 'step-policy.yaml');

    const summary = {
      runs: 10,
      success_rate: 0.95,
      avg_latency_ms: 1000,
      steps: [
        {
          name: 'hello',
          runs: 10,
          successes: 9,
          avg_latency_ms: 1000,
        },
        {
          name: 'finalize',
          runs: 10,
          successes: 8,
          avg_latency_ms: 2500,
        },
      ],
    };

    const policy = `
min_runs: 1
per_step:
  default:
    max_error_rate: 0.1
  finalize:
    max_error_rate: 0.05
    max_avg_latency_ms: 2000
`;

    await writeFile(summaryPath, JSON.stringify(summary));
    await writeFile(policyPath, policy);

    const errors = await evaluateFlowSummary(summaryPath, policyPath);

    // finalize step should fail error rate check (8/10 = 0.2 error rate > 0.05)
    expect(errors.some((e) => e.includes('finalize') && e.includes('error_rate'))).toBe(true);

    // finalize step should fail latency check (2500 > 2000)
    expect(errors.some((e) => e.includes('finalize') && e.includes('avg_latency_ms'))).toBe(true);
  });

  // MCP error rate tests - skipped for now as they require additional setup
  it.skip('should evaluate MCP error rates', async () => {
    // Test skipped - MCP error rate validation requires additional configuration
  });

  it('should handle zero denominator gracefully', async () => {
    const summaryPath = join(TEST_DIR, 'zero-runs.json');
    const summary = {
      runs: 10,
      success_rate: 1.0,
      avg_latency_ms: 1000,
      steps: [
        {
          name: 'hello',
          runs: 0,
          successes: 0,
          avg_latency_ms: 1000,
        },
      ],
    };

    await writeFile(summaryPath, JSON.stringify(summary));

    // Should not throw, just skip ratio calculations
    const errors = await evaluateFlowSummary(summaryPath);
    expect(Array.isArray(errors)).toBe(true);
  });

  it.skip('should aggregate MCP stats from steps when summary does not have them', async () => {
    // Test skipped - MCP aggregation requires additional configuration
  });
});
