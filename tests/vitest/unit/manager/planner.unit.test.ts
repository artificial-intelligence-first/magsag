import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AgentContext, TaskSpec } from '@magsag/core';
import { HeuristicPlanner } from '@magsag/manager/planner';

const mockContext: AgentContext = {
  repoDir: '/tmp/repo',
  metadata: {
    runId: 'unit-run',
    logDir: '/tmp/logs'
  }
} as AgentContext;

const basicTask: TaskSpec = {
  id: 'unit-task',
  goal: 'Cover planner heuristics'
};

const exclusiveProviders = {
  graph: {
    getPackageGraph: vi.fn().mockResolvedValue(new Map([['@magsag/test', []]]))
  }
};

const heavyProviders = {
  graph: {
    getPackageGraph: vi.fn().mockResolvedValue(
      new Map([
        ['@magsag/cli', ['@magsag/core']],
        ['@magsag/core', ['@magsag/schema']],
        ['@magsag/schema', []]
      ])
    )
  },
  diag: {
    collectErrors: vi.fn().mockResolvedValue(
      new Map([
        ['@magsag/cli', { errorCount: 80, files: ['src/cli.ts'] }],
        ['@magsag/core', { errorCount: 120, files: ['src/index.ts'] }],
        ['@magsag/schema', { errorCount: 20, files: ['src/types.ts'] }]
      ])
    )
  },
  metrics: {
    getAverageExecutionTime: vi.fn().mockResolvedValue(25000),
    recordExecution: vi.fn().mockResolvedValue(undefined)
  },
  repo: {
    getChangedFiles: vi.fn().mockResolvedValue(['src/index.ts', 'src/utils.ts']),
    getChangedLines: vi.fn().mockResolvedValue(180)
  }
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('HeuristicPlanner', () => {
  test('applies exclusive file and directory locks', async () => {
    const planner = new HeuristicPlanner({ fileLocking: true }, exclusiveProviders);
    const plan = await planner.createPlan(basicTask, mockContext);
    const step = plan.steps.find((candidate) => candidate.subtask.metadata?.package);
    expect(step).toBeDefined();
    const exclusiveKeys = (step as any).exclusiveKeys as string[] | undefined;
    expect(exclusiveKeys).toBeDefined();
    expect(exclusiveKeys).toEqual(
      expect.arrayContaining([
        expect.stringContaining('pkg:@'),
        expect.stringContaining('dir:'),
        expect.stringContaining('package.json')
      ])
    );
  });

  test('reduces concurrency for heavy workloads', async () => {
    const planner = new HeuristicPlanner({}, heavyProviders);
    const plan = await planner.createPlan(basicTask, mockContext);
    const metadata = (plan as unknown as { metadata?: Record<string, any> }).metadata;
    expect(metadata?.adaptiveConcurrency?.parallel).toBeGreaterThan(0);
    expect(metadata?.adaptiveConcurrency?.parallel).toBeLessThanOrEqual(metadata?.adaptiveConcurrency?.baseParallel ?? Infinity);
    expect(metadata?.adaptiveConcurrency?.adjustments).toMatchObject({
      errorPenalty: expect.any(Number)
    });
  });
});
