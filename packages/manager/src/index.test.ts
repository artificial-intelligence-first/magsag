import { describe, expect, it } from 'vitest';
import type {
  DelegationContext,
  DelegationRequest,
  Plan,
  RunnerEvent,
  SpecialistAgent
} from '@magsag/core';
import { SimpleManager } from './index.js';

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const createPlan = (stepCount: number, dependsOn?: Record<string, string[]>): Plan => {
  const taskId = 'task-1';
  return {
    id: 'plan-1',
    task: {
      id: taskId,
      goal: 'demo goal'
    },
    steps: Array.from({ length: stepCount }, (_, index) => {
      const stepId = `step-${index + 1}`;
      return {
        id: stepId,
        subtask: {
          id: `subtask-${index + 1}`,
          taskId,
          title: `Subtask ${index + 1}`
        },
        dependsOn: dependsOn?.[stepId] ?? []
      };
    })
  };
};

interface FakeAgentOptions {
  failSubtasks?: Set<string>;
  delayMs?: number;
}

const createFakeAgent = (
  id: string,
  options: FakeAgentOptions,
  trackers: {
    activeCounts: number[];
    starts: string[];
  }
): SpecialistAgent => {
  const { failSubtasks = new Set<string>(), delayMs = 0 } = options;

  return {
    id,
    async *execute(request: DelegationRequest): AsyncIterable<RunnerEvent> {
      trackers.starts.push(`${id}:${request.subtask.id}`);
      trackers.activeCounts[0] += 1;
      trackers.activeCounts[1] = Math.max(trackers.activeCounts[1], trackers.activeCounts[0]);

      if (delayMs > 0) {
        await delay(delayMs);
      }

      if (failSubtasks.has(request.subtask.id)) {
        trackers.activeCounts[0] -= 1;
        throw new Error(`failure requested for ${request.subtask.id}`);
      }

      yield { type: 'log', data: `${id} running ${request.subtask.id}` };

      if (delayMs > 0) {
        await delay(delayMs);
      }

      trackers.activeCounts[0] -= 1;
      return;
    }
  };
};

const collectEvents = async (
  manager: SimpleManager,
  plan: Plan,
  sagPool: SpecialistAgent[],
  prepareDelegation?: (subtaskId: string) => DelegationContext
) => {
  const events = [];
  const iterable = manager.run(plan, {
    sagPool,
    prepareDelegation: async (step) =>
      prepareDelegation?.(step.subtask.id) ?? {
        worktreePath: `/tmp/${step.subtask.id}`,
        env: {}
      }
  });

  for await (const event of iterable) {
    events.push(event);
  }

  return events;
};

describe('SimpleManager', () => {
  it('runs subtasks with bounded concurrency', async () => {
    const manager = new SimpleManager();
    const plan = createPlan(3);
    const trackers = { activeCounts: [0, 0], starts: [] };

    const agents = [
      createFakeAgent('sag-1', { delayMs: 5 }, trackers),
      createFakeAgent('sag-2', { delayMs: 5 }, trackers)
    ];

    const events = await collectEvents(manager, plan, agents);

    const results = events.filter(
      (event): event is Extract<typeof event, { type: 'result' }> =>
        event.type === 'result'
    );

    expect(results).toHaveLength(3);
    expect(new Set(results.map((r) => r.result.status))).toEqual(
      new Set(['completed'])
    );
    expect(trackers.activeCounts[1]).toBeLessThanOrEqual(2);
    expect(trackers.starts).toHaveLength(3);
  });

  it('marks dependents as skipped after failure', async () => {
    const manager = new SimpleManager();
    const plan = createPlan(2, { 'step-2': ['step-1'] });
    const trackers = { activeCounts: [0, 0], starts: [] };

    const agents = [
      createFakeAgent(
        'sag-1',
        { delayMs: 0, failSubtasks: new Set(['subtask-1']) },
        trackers
      ),
      createFakeAgent('sag-2', { delayMs: 0 }, trackers)
    ];

    const events = await collectEvents(manager, plan, agents);

    const results = events
      .filter(
        (event): event is Extract<typeof event, { type: 'result' }> =>
          event.type === 'result'
      )
      .map((event) => event.result);

    const statusBySubtask = Object.fromEntries(
      results.map((result) => [result.subtaskId, result.status])
    );

    expect(statusBySubtask['subtask-1']).toBe('failed');
    expect(statusBySubtask['subtask-2']).toBe('skipped');
  });

  it('handles prepareDelegation failures gracefully', async () => {
    const manager = new SimpleManager();
    const plan = createPlan(1);
    const trackers = { activeCounts: [0, 0], starts: [] };
    const agents = [createFakeAgent('sag-1', { delayMs: 0 }, trackers)];

    const events = await collectEvents(manager, plan, agents, () => {
      throw new Error('prepare failed');
    });

    const resultEvent = events.find(
      (event): event is Extract<typeof event, { type: 'result' }> =>
        event.type === 'result'
    );

    expect(resultEvent?.result.status).toBe('failed');
    expect(resultEvent?.result.detail).toContain('prepare failed');
    expect(trackers.starts).toHaveLength(0);
  });
});
