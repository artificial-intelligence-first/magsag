import {
  type AgentContext,
  TaskQueue,
  type DelegationContext,
  type DelegationEvent,
  type DelegationRequest,
  type DelegationResult,
  type ManagerAgent,
  type ManagerRunOptions,
  type Plan,
  type PlanStep,
  type SpecialistAgent,
  type TaskSpec
} from '@magsag/core';

const MAX_CONCURRENCY = 10;

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : JSON.stringify(error);
};

class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly buffer: T[] = [];
  private readonly waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failure: unknown;

  push(event: T): void {
    if (this.closed || this.failure) {
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value: event, done: false });
      return;
    }
    this.buffer.push(event);
  }

  close(): void {
    if (this.closed || this.failure) {
      return;
    }
    this.closed = true;
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.resolve({ value: undefined, done: true });
    }
  }

  fail(error: unknown): void {
    if (this.closed || this.failure) {
      return;
    }
    this.failure = error instanceof Error ? error : new Error(errorMessage(error));
    while (this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      waiter?.reject(this.failure);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.buffer.length > 0) {
          const event = this.buffer.shift() as T;
          return Promise.resolve({ value: event, done: false });
        }
        if (this.failure) {
          return Promise.reject(this.failure);
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiters.push({ resolve, reject });
        });
      }
    };
  }
}

class SagAllocator {
  private readonly busy = new Set<string>();
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly pool: readonly SpecialistAgent[]) {
    if (pool.length === 0) {
      throw new Error('sagPool must include at least one specialist agent');
    }
  }

  release(agent: SpecialistAgent): void {
    this.busy.delete(agent.id);
    const waiter = this.waiters.shift();
    waiter?.();
  }

  async acquire(
    request: DelegationRequest,
    signal?: AbortSignal
  ): Promise<SpecialistAgent> {
    const awaitAvailability = (): Promise<void> =>
      new Promise((resolve, reject) => {
        const onAbort = () => {
          cleanup();
          reject(
            requestAbortError(signal?.reason ?? new Error('Delegation aborted'))
          );
        };

        const resume = () => {
          cleanup();
          resolve();
        };

        const cleanup = () => {
          const index = this.waiters.indexOf(resume);
          if (index >= 0) {
            this.waiters.splice(index, 1);
          }
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
        };

        this.waiters.push(resume);
        if (signal) {
          if (signal.aborted) {
            cleanup();
            reject(requestAbortError(signal.reason));
            return;
          }
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });

    while (true) {
      let foundIdle = false;
      for (const agent of this.pool) {
        if (this.busy.has(agent.id)) {
          continue;
        }
        foundIdle = true;
        const canHandle =
          typeof agent.canHandle === 'function'
            ? await agent.canHandle(request)
            : true;
        if (!canHandle) {
          continue;
        }
        this.busy.add(agent.id);
        return agent;
      }

      if (foundIdle && this.busy.size === 0) {
        throw new Error(
          `No specialist can handle subtask ${request.subtask.id}`
        );
      }

      await awaitAvailability();
    }
  }
}

const requestAbortError = (reason: unknown): Error => {
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error(errorMessage(reason));
  error.name = 'AbortError';
  return error;
};

export interface SimpleManagerOptions {
  onError?: (error: unknown) => void;
}

export class SimpleManager implements ManagerAgent {
  constructor(private readonly options: SimpleManagerOptions = {}) {}

  async createPlan(task: TaskSpec, context: AgentContext): Promise<Plan> {
    void context;
    const planId = `${task.id}-plan`;
    return {
      id: planId,
      task,
      steps: [
        {
          id: `${planId}-step-1`,
          subtask: {
            id: `${task.id}-subtask-1`,
            taskId: task.id,
            title: task.goal,
            description: task.goal,
            acceptance: task.acceptance,
            metadata: task.metadata
          }
        }
      ]
    };
  }

  run(plan: Plan, options: ManagerRunOptions): AsyncIterable<DelegationEvent> {
    const eventQueue = new AsyncEventQueue<DelegationEvent>();
    const { sagPool, maxConcurrency, signal } = options;
    if (!Array.isArray(sagPool) || sagPool.length === 0) {
      eventQueue.fail(new Error('Manager run requires at least one SAG agent'));
      return eventQueue;
    }

    if (!options.prepareDelegation) {
      eventQueue.fail(
        new Error('Manager run requires a prepareDelegation function')
      );
      return eventQueue;
    }

    const limit = Math.max(
      1,
      Math.min(maxConcurrency ?? sagPool.length, sagPool.length, MAX_CONCURRENCY)
    );

    const queue = new TaskQueue(limit);
    const allocator = new SagAllocator(sagPool);

    if (signal?.aborted) {
      const abortError = requestAbortError(signal.reason);
      eventQueue.fail(abortError);
      return eventQueue;
    }

    const onAbort = () => {
      const abortError = requestAbortError(
        signal?.reason ?? new Error('Run aborted')
      );
      queue.cancelAll(abortError);
      eventQueue.fail(abortError);
    };

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    void this.executePlan(plan, options, queue, allocator, eventQueue).then(
      () => {
        signal?.removeEventListener('abort', onAbort);
        eventQueue.close();
      },
      (error) => {
        signal?.removeEventListener('abort', onAbort);
        queue.cancelAll(error);
        this.options.onError?.(error);
        eventQueue.fail(error);
      }
    );

    return eventQueue;
  }

  private async executePlan(
    plan: Plan,
    options: ManagerRunOptions,
    queue: TaskQueue,
    allocator: SagAllocator,
    events: AsyncEventQueue<DelegationEvent>
  ): Promise<void> {
    if (plan.steps.length === 0) {
      return;
    }

    const prepareDelegation = options.prepareDelegation;
    if (!prepareDelegation) {
      throw new Error('prepareDelegation is required');
    }

    const finalizeDelegation = options.finalizeDelegation;

    const remainingDeps = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    const stepMap = new Map<string, PlanStep>();
    const unscheduled = new Set<string>();
    const blocked = new Map<string, string>();
    const inFlight = new Set<Promise<void>>();

    for (const step of plan.steps) {
      const deps = step.dependsOn ?? [];
      remainingDeps.set(step.id, deps.length);
      for (const dep of deps) {
        const current = dependents.get(dep) ?? [];
        current.push(step.id);
        dependents.set(dep, current);
      }
      stepMap.set(step.id, step);
      unscheduled.add(step.id);
    }

    const scheduleReady = () => {
      for (const stepId of [...unscheduled]) {
        if (blocked.has(stepId)) {
          skipStep(stepId, blocked.get(stepId) as string);
          continue;
        }
        if ((remainingDeps.get(stepId) ?? 0) === 0) {
          const step = stepMap.get(stepId);
          if (step) {
            launchStep(step);
          }
        }
      }
    };

    const launchStep = (step: PlanStep) => {
      unscheduled.delete(step.id);
      events.push({
        type: 'state',
        subtaskId: step.subtask.id,
        state: 'queued'
      });

      const promise = queue
        .push((signal) =>
          this.executeStep(
            step,
            signal,
            prepareDelegation,
            finalizeDelegation,
            allocator,
            events
          )
        )
        .then((result) => {
          if (result.status === 'completed') {
            for (const dependentId of dependents.get(step.id) ?? []) {
              const remaining = (remainingDeps.get(dependentId) ?? 0) - 1;
              remainingDeps.set(dependentId, remaining);
            }
          } else if (result.status === 'failed') {
            const detail =
              result.detail ??
              `Subtask ${step.subtask.id} failed with unknown error`;
            for (const dependentId of dependents.get(step.id) ?? []) {
              if (!blocked.has(dependentId)) {
                blocked.set(dependentId, detail);
              }
            }
          }
        })
        .finally(() => {
          inFlight.delete(promise);
          scheduleReady();
        });

      inFlight.add(promise);
    };

    const skipStep = (stepId: string, detail: string) => {
      if (!unscheduled.delete(stepId)) {
        return;
      }
      const step = stepMap.get(stepId);
      if (!step) {
        return;
      }
      const result: DelegationResult = {
        subtaskId: step.subtask.id,
        status: 'skipped',
        detail
      };
      events.push({
        type: 'state',
        subtaskId: step.subtask.id,
        state: 'failed',
        detail
      });
      events.push({
        type: 'result',
        result
      });
      for (const dependentId of dependents.get(stepId) ?? []) {
        if (!blocked.has(dependentId)) {
          blocked.set(dependentId, detail);
        }
      }
    };

    scheduleReady();

    while (inFlight.size > 0) {
      await Promise.race(inFlight);
    }

    for (const stepId of [...unscheduled]) {
      const detail =
        blocked.get(stepId) ?? `Subtask ${stepId} was not scheduled`;
      skipStep(stepId, detail);
    }
  }

  private async executeStep(
    step: PlanStep,
    signal: AbortSignal,
    prepare: (step: PlanStep) => Promise<DelegationContext>,
    finalize: ManagerRunOptions['finalizeDelegation'],
    allocator: SagAllocator,
    events: AsyncEventQueue<DelegationEvent>
  ): Promise<DelegationResult> {
    const subtaskId = step.subtask.id;
    let context: DelegationContext;
    try {
      context = await prepare(step);
    } catch (error) {
      const detail = errorMessage(error);
      const result: DelegationResult = {
        subtaskId,
        status: 'failed',
        detail
      };
      events.push({
        type: 'state',
        subtaskId,
        state: 'failed',
        detail
      });
      events.push({ type: 'result', result });
      return result;
    }

    const request: DelegationRequest = {
      subtask: step.subtask,
      context
    };

    let agent: SpecialistAgent | undefined;
    let result: DelegationResult = {
      subtaskId,
      status: 'completed'
    };
    let runnerErrorDetail: string | undefined;

    let acquireFailed = false;

    try {
      agent = await allocator.acquire(request, signal);
    } catch (error) {
      acquireFailed = true;
      const detail = errorMessage(error);
      result = {
        subtaskId,
        status: 'failed',
        detail
      };
      events.push({
        type: 'state',
        subtaskId,
        state: 'failed',
        detail
      });
      events.push({ type: 'result', result });
    }

    if (acquireFailed) {
      if (finalize) {
        try {
          await finalize(step, context, result);
        } catch (error) {
          this.options.onError?.(error);
        }
      }
      return result;
    }

    events.push({
      type: 'state',
      subtaskId,
      state: 'running'
    });

    try {
      for await (const event of agent.execute(request, signal)) {
        events.push({ type: 'runner', subtaskId, event });
        if (event.type === 'error' && !runnerErrorDetail) {
          runnerErrorDetail = event.error?.message ?? 'Runner reported an error';
        }
      }

      if (runnerErrorDetail) {
        result = {
          subtaskId,
          status: 'failed',
          detail: runnerErrorDetail
        };
        events.push({
          type: 'state',
          subtaskId,
          state: 'failed',
          detail: runnerErrorDetail
        });
        events.push({ type: 'result', result });
      } else {
        result = {
          subtaskId,
          status: 'completed'
        };
        events.push({
          type: 'state',
          subtaskId,
          state: 'completed'
        });
        events.push({ type: 'result', result });
      }
    } catch (error) {
      const detail = errorMessage(error);
      result = {
        subtaskId,
        status: 'failed',
        detail
      };
      events.push({
        type: 'state',
        subtaskId,
        state: 'failed',
        detail
      });
      events.push({ type: 'result', result });
    } finally {
      if (agent) {
        allocator.release(agent);
      }
      if (finalize) {
        try {
          await finalize(step, context, result);
        } catch (error) {
          this.options.onError?.(error);
        }
      }
    }

    return result;
  }
}
