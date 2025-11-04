import { randomUUID } from 'node:crypto';

import { AgentContext, Delegation, RunnerGateway, SagInvocationResult } from '../shared/types.js';

const FALLBACK_SAG_ID = 'compensation-advisor-sag';

const ensureRunner = (context: AgentContext): RunnerGateway => {
  if (!context.runner) {
    throw new Error('Runner interface is required for offer-orchestrator-mag');
  }
  return context.runner;
};

const extractCandidateProfile = (
  payload: Record<string, unknown>,
  task: Record<string, unknown>
): Record<string, unknown> => {
  const taskInput = task.input;
  if (taskInput && typeof taskInput === 'object') {
    const candidateProfile = (taskInput as { candidate_profile?: unknown }).candidate_profile;
    if (candidateProfile && typeof candidateProfile === 'object') {
      return candidateProfile as Record<string, unknown>;
    }
  }

  if (typeof task.candidate_profile === 'object' && task.candidate_profile !== null) {
    return task.candidate_profile as Record<string, unknown>;
  }

  const candidate: Record<string, unknown> = {};
  for (const key of ['role', 'level', 'location', 'experience_years', 'notes'] as const) {
    if (Object.prototype.hasOwnProperty.call(task, key)) {
      candidate[key] = task[key];
    } else if (Object.prototype.hasOwnProperty.call(payload, key)) {
      candidate[key] = payload[key];
    }
  }
  return candidate;
};

const normalizeTasks = (payload: Record<string, unknown>): Record<string, unknown>[] => {
  const candidate = payload.tasks;
  if (Array.isArray(candidate) && candidate.length > 0) {
    return candidate.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  }
  return [payload];
};

const ensureTaskId = (task: Record<string, unknown>, index: number): string => {
  const value = task.task_id;
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return `task-${index}-${randomUUID().slice(0, 8)}`;
};

const buildDelegation = (
  payload: Record<string, unknown>,
  task: Record<string, unknown>,
  index: number,
  total: number,
  runId: string
): Delegation => {
  const taskInput =
    task.input && typeof task.input === 'object' ? (task.input as Record<string, unknown>) : {};
  const mergedInput = { ...taskInput, candidate_profile: extractCandidateProfile(payload, task) };
  const taskId = ensureTaskId(task, index);
  const sagId = typeof task.sag_id === 'string' && task.sag_id.length > 0 ? task.sag_id : FALLBACK_SAG_ID;

  const baseDelegation: Delegation = {
    taskId,
    sagId,
    input: mergedInput,
    context: {
      requested_by: 'offer-orchestrator-mag',
      task_index: index,
      total_tasks: total,
      parent_run_id: runId
    }
  };

  // Preserve snake_case keys for runner compatibility while keeping camelCase for local typings.
  const snakeCaseDelegation: Delegation & { task_id: string; sag_id: string } = {
    ...baseDelegation,
    task_id: taskId,
    sag_id: sagId
  };

  return snakeCaseDelegation;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const resolveTaskId = (item: SagInvocationResult): string | undefined => {
  const camelCaseId = item.taskId;
  if (typeof camelCaseId === 'string' && camelCaseId.trim().length > 0) {
    return camelCaseId;
  }
  const snakeCaseId = (item as { task_id?: unknown }).task_id;
  if (typeof snakeCaseId === 'string' && snakeCaseId.trim().length > 0) {
    return snakeCaseId;
  }
  return undefined;
};

const aggregateResults = (results: SagInvocationResult[], runId: string): Record<string, unknown> => {
  const success = results.find((item) => item.status === 'success');
  const successOutput = asRecord(success?.output);
  const offer = asRecord(successOutput?.offer);
  const metadataRecord = asRecord(successOutput?.metadata);
  const offersCount = results.length;
  const successCount = results.filter((item) => item.status === 'success').length;

  const numbersTotal = results.reduce((total, item) => {
    if (item.status !== 'success') {
      return total;
    }
    const output = asRecord(item.output);
    const analysis = asRecord(output?.analysis);
    const summary = asRecord(analysis?.summary);
    const candidateTotal = summary?.numbers_total;
    return total + (typeof candidateTotal === 'number' ? candidateTotal : 0);
  }, 0);

  return {
    offer: offer ?? {},
    metadata: {
      generated_by: 'OfferOrchestratorMAG',
      run_id: typeof metadataRecord?.run_id === 'string' ? metadataRecord.run_id : runId,
      timestamp: new Date().toISOString(),
      version: '0.1.0',
      task_count: offersCount,
      successful_tasks: successCount
    },
    mag: 'offer-orchestrator-mag',
    results: results.map((item) => ({
      task_id: resolveTaskId(item),
      status: item.status,
      output: item.output
    })),
    aggregates: {
      numbers_total: numbersTotal,
      tasks_processed: offersCount
    }
  };
};

export const run = async (
  payload: Record<string, unknown>,
  context: AgentContext = {}
): Promise<Record<string, unknown>> => {
  const runner = ensureRunner(context);
  const tasks = normalizeTasks(payload);
  const obs = context.obs;
  const runId =
    (typeof obs?.runId === 'string' && obs.runId.length > 0)
      ? obs.runId
      : (typeof obs?.run_id === 'string' && obs.run_id.length > 0)
          ? obs.run_id
          : (typeof payload.run_id === 'string' && payload.run_id.length > 0
              ? payload.run_id
              : `mag-${randomUUID().slice(0, 6)}`);

  obs?.log?.('mag.start', { agent: 'offer-orchestrator-mag', run_id: runId });

  const results: SagInvocationResult[] = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const delegation = buildDelegation(payload, task, index, tasks.length, runId);
    const response = await runner.invokeSagAsync(delegation);
    results.push(response);
  }

  const successes = results.filter((item) => item.status === 'success');
  if (successes.length === 0) {
    obs?.log?.('mag.error', {
      agent: 'offer-orchestrator-mag',
      run_id: runId,
      tasks_attempted: tasks.length,
      failures: results.map((item) => resolveTaskId(item))
    });
    throw new Error('All delegations failed; no offer generated.');
  }

  obs?.metric?.('latency_ms', Math.max(1, tasks.length * 5));
  obs?.log?.('mag.end', {
    agent: 'offer-orchestrator-mag',
    run_id: runId,
    tasks_processed: tasks.length
  });

  return aggregateResults(results, runId);
};
