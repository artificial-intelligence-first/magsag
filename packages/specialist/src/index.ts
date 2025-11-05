import { randomUUID } from 'node:crypto';
import {
  type DelegationContext,
  type DelegationRequest,
  type DelegationResult,
  type ManagerRunOptions,
  type PlanStep,
  type RunnerEvent,
  type RunnerFactory,
  type RunnerMcpMetadata,
  type RunSpec,
  type RunSpecExtra,
  type SpecialistAgent
} from '@magsag/core';
import { WorktreeManager, type WorktreeManagerOptions } from '@magsag/worktree';
import { createLogger } from '@magsag/shared-logging';

const specialistLogger = createLogger({ name: 'magsag:specialist' });

const requestAbortError = (reason: unknown): Error => {
  if (reason instanceof Error) {
    return reason;
  }
  const error = new Error(typeof reason === 'string' ? reason : 'Delegation aborted');
  error.name = 'AbortError';
  return error;
};

const isRunnerMcpMetadata = (value: unknown): value is RunnerMcpMetadata => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'runtime' in value && typeof (value as { runtime?: unknown }).runtime === 'object';
};

export interface WorktreeDelegationOptions
  extends Pick<WorktreeManagerOptions, 'repoPath' | 'worktreesRoot' | 'gitBinary' | 'maxConcurrency' | 'env'> {
  baseRef?: string;
  lock?: boolean;
  lockReason?: string;
  keepOnSuccess?: boolean;
  keepOnFailure?: boolean;
}

export interface WorktreeDelegationHandlers {
  manager: WorktreeManager;
  prepare: NonNullable<ManagerRunOptions['prepareDelegation']>;
  finalize: NonNullable<ManagerRunOptions['finalizeDelegation']>;
}

const buildWorktreeId = (step: PlanStep): string => {
  const suffix = randomUUID().slice(0, 8);
  return `${step.id}-${suffix}`;
};

export const createWorktreeDelegationHandlers = (
  options: WorktreeDelegationOptions
): WorktreeDelegationHandlers => {
  const manager = new WorktreeManager(options);
  const keepOnSuccess = options.keepOnSuccess ?? false;
  const keepOnFailure = options.keepOnFailure ?? false;
  const baseRef = options.baseRef;
  const lock = options.lock ?? false;
  const lockReason = options.lockReason;

  const prepare: NonNullable<ManagerRunOptions['prepareDelegation']> = async (
    step
  ) => {
    const worktreeId = buildWorktreeId(step);
    const state = await manager.create({
      id: worktreeId,
      task: step.subtask.title ?? step.subtask.id,
      base: baseRef,
      lock,
      lockReason
    });

    return {
      worktreePath: state.path,
      env: {},
      metadata: {
        worktreeId: state.id,
        worktreePath: state.path,
        base: baseRef
      }
    } satisfies DelegationContext;
  };

  const finalize: NonNullable<ManagerRunOptions['finalizeDelegation']> = async (
    _step,
    context,
    result: DelegationResult
  ) => {
    const worktreeId =
      (context.metadata as { worktreeId?: string } | undefined)?.worktreeId;
    if (!worktreeId) {
      return;
    }

    const keep =
      (result.status === 'completed' && keepOnSuccess) ||
      (result.status !== 'completed' && keepOnFailure);

    if (keep) {
      return;
    }

    try {
      await manager.remove(worktreeId, { force: true });
    } catch (error) {
      // Swallow cleanup errors to avoid masking SAG outcomes; callers can prune later.
      if (process.env.DEBUG?.includes('magsag:specialist')) {
        // eslint-disable-next-line no-console
        const detail =
          error instanceof Error ? error.message : String(error ?? 'unknown');
        specialistLogger.warn(`Failed to remove worktree ${worktreeId}`, {
          worktreeId,
          detail
        });
      }
    }
  };

  return { manager, prepare, finalize };
};

export interface RunnerSpecialistAgentOptions {
  id: string;
  runnerFactory: RunnerFactory;
  engine?: RunSpec['engine'];
  promptBuilder?: (request: DelegationRequest) => string;
  extraBuilder?: (request: DelegationRequest) => Record<string, unknown> | undefined;
}

export class RunnerSpecialistAgent implements SpecialistAgent {
  readonly id: string;
  private readonly runnerFactory: RunnerFactory;
  private readonly engine: RunSpec['engine'];
  private readonly promptBuilder: (request: DelegationRequest) => string;
  private readonly extraBuilder?: (request: DelegationRequest) => Record<string, unknown> | undefined;

  constructor(options: RunnerSpecialistAgentOptions) {
    if (!options.runnerFactory) {
      throw new Error('runnerFactory is required');
    }
    this.id = options.id;
    this.runnerFactory = options.runnerFactory;
    this.engine = options.engine ?? options.runnerFactory.id;
    this.promptBuilder =
      options.promptBuilder ??
      ((request) =>
        request.subtask.description ?? request.subtask.title ?? request.subtask.id);
    this.extraBuilder = options.extraBuilder;
  }

  async *execute(
    request: DelegationRequest,
    signal?: AbortSignal
  ): AsyncIterable<RunnerEvent> {
    if (signal?.aborted) {
      throw requestAbortError(signal.reason);
    }

    const prompt = this.promptBuilder(request).trim();
    if (!prompt) {
      throw new Error(`Prompt is required for subtask ${request.subtask.id}`);
    }

    const baseExtra: RunSpecExtra = {};
    if (request.context.env && Object.keys(request.context.env).length > 0) {
      baseExtra.env = request.context.env;
    }

    const maybeMcp = (request.context.metadata as { mcp?: unknown } | undefined)?.mcp;
    if (isRunnerMcpMetadata(maybeMcp)) {
      baseExtra.mcp = maybeMcp;
    }

    const customExtra = this.extraBuilder?.(request) ?? {};
    const mergedExtra = { ...customExtra, ...baseExtra } as RunSpecExtra;
    const spec: RunSpec = {
      engine: this.engine,
      repo: request.context.worktreePath,
      prompt,
      extra: Object.keys(mergedExtra).length > 0 ? mergedExtra : undefined
    };

    const runner = this.runnerFactory.create();
    const iterator = runner.run(spec);

    for await (const event of iterator) {
      if (signal?.aborted) {
        throw requestAbortError(signal.reason);
      }
      yield event;
    }
  }
}
