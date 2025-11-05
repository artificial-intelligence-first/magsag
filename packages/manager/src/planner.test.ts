import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HeuristicPlanner } from './planner.js';
import type { TaskSpec, AgentContext, Plan } from '@magsag/core';

describe('HeuristicPlanner', () => {
  let planner: HeuristicPlanner;
  let mockContext: AgentContext;

  beforeEach(() => {
    mockContext = {
      repoDir: '/test/repo',
      metadata: {
        runId: 'test-run-123',
        logDir: '/test/logs'
      }
    } as AgentContext;
  });

  describe('Basic functionality', () => {
    it('should create a plan without providers', async () => {
      planner = new HeuristicPlanner();

      const task: TaskSpec = {
        id: 'test-task',
        goal: 'Fix TypeScript errors'
      };

      const plan = await planner.createPlan(task, mockContext);

      expect(plan).toBeDefined();
      expect(plan.id).toBe('test-task-plan');
      expect(plan.task).toBe(task);
      expect(plan.steps).toBeDefined();
      expect(Array.isArray(plan.steps)).toBe(true);
      const planDetails = plan as Plan & { metadata?: { strategy?: string } };
      expect(planDetails.metadata?.strategy).toBe('heuristic-v1');
    });

    it('should calculate max parallel based on CPU count', async () => {
      planner = new HeuristicPlanner({ cpuMultiplier: 0.5 });

      const task: TaskSpec = {
        id: 'test-task',
        goal: 'Build packages'
      };

      const plan = await planner.createPlan(task, mockContext);

      const planDetails = plan as Plan & { metadata?: { maxParallel?: number } };
      expect(planDetails.metadata?.maxParallel).toBeDefined();
      expect(planDetails.metadata?.maxParallel).toBeGreaterThan(0);
      expect(planDetails.metadata?.maxParallel).toBeLessThanOrEqual(10);
    });

    it('should respect maxParallel configuration', async () => {
      planner = new HeuristicPlanner({ maxParallel: 2 });

      const task: TaskSpec = {
        id: 'test-task',
        goal: 'Test task'
      };

      const plan = await planner.createPlan(task, mockContext);

      const planDetails = plan as Plan & { metadata?: { maxParallel?: number } };
      expect(planDetails.metadata?.maxParallel).toBe(2);
    });
  });

  describe('ExclusiveKeys support', () => {
    it('should add exclusiveKeys when fileLocking is enabled', async () => {
      planner = new HeuristicPlanner({ fileLocking: true });

      const task: TaskSpec = {
        id: 'test-task',
        goal: 'Fix errors with file locking'
      };

      const plan = await planner.createPlan(task, mockContext);

      // Check if at least one step has exclusiveKeys
      const stepsWithKeys = plan.steps.filter((step: any) =>
        step.exclusiveKeys && step.exclusiveKeys.length > 0
      );

      if (plan.steps.length > 0) {
        expect(stepsWithKeys.length).toBeGreaterThan(0);

        const firstStepWithKeys = stepsWithKeys[0] as any;
        expect(firstStepWithKeys.exclusiveKeys).toBeDefined();
        expect(Array.isArray(firstStepWithKeys.exclusiveKeys)).toBe(true);

        // Should include package.json
        const hasPackageJson = firstStepWithKeys.exclusiveKeys.some((key: string) =>
          key.includes('package.json')
        );
        expect(hasPackageJson).toBe(true);
      }
    });

    it('should not add exclusiveKeys when fileLocking is disabled', async () => {
      planner = new HeuristicPlanner({ fileLocking: false });

      const task: TaskSpec = {
        id: 'test-task',
        goal: 'Fix errors without file locking'
      };

      const plan = await planner.createPlan(task, mockContext);

      const stepsWithKeys = plan.steps.filter((step: any) =>
        step.exclusiveKeys && step.exclusiveKeys.length > 0
      );

      expect(stepsWithKeys.length).toBe(0);
    });
  });

  describe('Provider integration', () => {
    it('should use providers when available', async () => {
      const mockProviders = {
        graph: {
          getPackageGraph: vi.fn().mockResolvedValue(new Map([
            ['@magsag/core', ['@magsag/schema']],
            ['@magsag/schema', []],
            ['@magsag/cli', ['@magsag/core']]
          ]))
        },
        diag: {
          collectErrors: vi.fn().mockResolvedValue(new Map([
            ['@magsag/core', { errorCount: 5, files: ['src/index.ts'] }],
            ['@magsag/schema', { errorCount: 2, files: ['src/types.ts'] }],
            ['@magsag/cli', { errorCount: 8, files: ['src/commands.ts'] }]
          ]))
        },
        metrics: {
          getAverageExecutionTime: vi.fn().mockResolvedValue(3000),
          recordExecution: vi.fn().mockResolvedValue(undefined)
        },
        repo: {
          getChangedFiles: vi.fn().mockResolvedValue(['src/index.ts']),
          getChangedLines: vi.fn().mockResolvedValue(42)
        }
      };

      planner = new HeuristicPlanner({}, mockProviders);

      const task: TaskSpec = {
        id: 'test-task',
        goal: 'Fix with providers'
      };

      const plan = await planner.createPlan(task, mockContext);

      expect(mockProviders.graph.getPackageGraph).toHaveBeenCalled();
      expect(mockProviders.diag.collectErrors).toHaveBeenCalled();
      expect(plan.steps.length).toBeGreaterThan(0);

      // Verify dependency ordering
      const coreStep = plan.steps.find(s =>
        (s.subtask.metadata as any)?.package === '@magsag/core'
      );
      const schemaStep = plan.steps.find(s =>
        (s.subtask.metadata as any)?.package === '@magsag/schema'
      );
      const cliStep = plan.steps.find(s =>
        (s.subtask.metadata as any)?.package === '@magsag/cli'
      );

      if (coreStep && schemaStep && cliStep) {
        // CLI should depend on core
        expect(cliStep.dependsOn).toContain(coreStep.id);
        // Core should depend on schema
        expect(coreStep.dependsOn).toContain(schemaStep.id);
      }
    });
  });

  describe('Topological sorting', () => {
    it('should sort packages by dependencies', async () => {
      const mockProviders = {
        graph: {
          getPackageGraph: vi.fn().mockResolvedValue(new Map([
            ['@magsag/a', ['@magsag/b', '@magsag/c']],
            ['@magsag/b', ['@magsag/c']],
            ['@magsag/c', []],
            ['@magsag/d', ['@magsag/a']]
          ]))
        }
      };

      planner = new HeuristicPlanner({ preferLeaf: false }, mockProviders);

      const task: TaskSpec = {
        id: 'test-task',
        goal: 'Test topological sort'
      };

      const plan = await planner.createPlan(task, mockContext);

      // Find step indices
      const stepIndices = new Map<string, number>();
      plan.steps.forEach((step, index) => {
        const pkg = (step.subtask.metadata as any)?.package;
        if (pkg) {
          stepIndices.set(pkg, index);
        }
      });

      // Verify ordering: c should come before b, b before a, a before d
      if (stepIndices.has('@magsag/c') && stepIndices.has('@magsag/b')) {
        expect(stepIndices.get('@magsag/c')).toBeLessThan(stepIndices.get('@magsag/b')!);
      }
      if (stepIndices.has('@magsag/b') && stepIndices.has('@magsag/a')) {
        expect(stepIndices.get('@magsag/b')).toBeLessThan(stepIndices.get('@magsag/a')!);
      }
      if (stepIndices.has('@magsag/a') && stepIndices.has('@magsag/d')) {
        expect(stepIndices.get('@magsag/a')).toBeLessThan(stepIndices.get('@magsag/d')!);
      }
    });

    it('should retain dependency edges when preferLeaf is true', async () => {
      const mockProviders = {
        graph: {
          getPackageGraph: vi.fn().mockResolvedValue(new Map([
            ['@magsag/a', ['@magsag/b']],
            ['@magsag/b', ['@magsag/c']],
            ['@magsag/c', []]
          ]))
        }
      };

      planner = new HeuristicPlanner({ preferLeaf: true }, mockProviders);

      const task: TaskSpec = {
        id: 'test-task',
        goal: 'Test preferLeaf=true ordering'
      };

      const plan = await planner.createPlan(task, mockContext);

      const stepMap = new Map<string, any>();
      plan.steps.forEach(step => {
        const pkg = (step.subtask.metadata as any)?.package;
        if (pkg) {
          stepMap.set(pkg, step);
        }
      });

      const stepA = stepMap.get('@magsag/a');
      const stepB = stepMap.get('@magsag/b');
      const stepC = stepMap.get('@magsag/c');

      expect(stepA).toBeDefined();
      expect(stepB).toBeDefined();
      expect(stepC).toBeDefined();

      expect(stepA.dependsOn).toContain(`${plan.id}-step-2`);
      expect(stepB.dependsOn).toContain(`${plan.id}-step-3`);
      expect(stepC.dependsOn).toBeUndefined();

      const indexA = plan.steps.findIndex(step => (step.subtask.metadata as any)?.package === '@magsag/a');
      const indexB = plan.steps.findIndex(step => (step.subtask.metadata as any)?.package === '@magsag/b');
      const indexC = plan.steps.findIndex(step => (step.subtask.metadata as any)?.package === '@magsag/c');

      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });
  });
});
