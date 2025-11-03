import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import split2 from 'split2';

const SUCCESS_STATUSES = new Set(['ok', 'success', 'succeeded', 'completed']);

export interface FlowSummary {
  runs: number;
  successes: number;
  success_rate: number;
  avg_latency_ms: number;
  errors: {
    total: number;
    by_type: Record<string, number>;
  };
  mcp: {
    calls: number;
    errors: number;
    tokens: {
      input: number;
      output: number;
      total: number;
    };
    cost_usd: number;
  };
  steps: Array<{
    name: string;
    runs: number;
    successes: number;
    errors: number;
    success_rate: number;
    avg_latency_ms: number;
    mcp?: {
      calls: number;
      errors: number;
    };
    models?: string[];
    error_types?: Record<string, number>;
  }>;
  models: Array<{
    name: string;
    calls: number;
    errors: number;
    tokens: {
      input: number;
      output: number;
      total: number;
    };
    cost_usd: number;
  }>;
}

interface StepMetrics {
  runs: number;
  successes: number;
  failures: number;
  totalLatencyMs: number;
  mcpCalls: number;
  mcpErrors: number;
  models: Set<string>;
  errorCategories: Map<string, number>;
}

interface ModelStats {
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

interface RunMetrics {
  succeeded: number;
  totalLatencyMs: number;
  completedSteps: number;
  errorCategories: Map<string, number>;
  stepStats: Map<string, StepMetrics>;
  mcpCalls: number;
  mcpErrors: number;
  modelStats: Map<string, ModelStats>;
}

const initStepMetrics = (): StepMetrics => ({
  runs: 0,
  successes: 0,
  failures: 0,
  totalLatencyMs: 0,
  mcpCalls: 0,
  mcpErrors: 0,
  models: new Set(),
  errorCategories: new Map()
});

const initRunMetrics = (): RunMetrics => ({
  succeeded: 0,
  totalLatencyMs: 0,
  completedSteps: 0,
  errorCategories: new Map(),
  stepStats: new Map(),
  mcpCalls: 0,
  mcpErrors: 0,
  modelStats: new Map()
});

const initModelStats = (): ModelStats => ({
  calls: 0,
  errors: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  costUsd: 0
});

const defaultSummary = (): FlowSummary => ({
  runs: 0,
  successes: 0,
  success_rate: 0,
  avg_latency_ms: 0,
  errors: { total: 0, by_type: {} },
  mcp: {
    calls: 0,
    errors: 0,
    tokens: { input: 0, output: 0, total: 0 },
    cost_usd: 0
  },
  steps: [],
  models: []
});

const loadJson = async (path: string): Promise<Record<string, unknown> | undefined> => {
  try {
    const raw = await fs.readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const extractModelName = (record: Record<string, unknown>): string => {
  const directKeys: Array<keyof typeof record> = ['model', 'model_name'];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === 'string' && value) {
      return value;
    }
  }

  const usage = record.usage;
  if (usage && typeof usage === 'object') {
    const candidate = (usage as Record<string, unknown>).model;
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  const config = record.config;
  if (config && typeof config === 'object') {
    const candidate = (config as Record<string, unknown>).model;
    if (typeof candidate === 'string' && candidate) {
      return candidate;
    }
  }

  return 'unknown';
};

const classifyError = (
  record: Record<string, unknown>,
  extra: Record<string, unknown> | undefined
): string => {
  const tokens: string[] = [];

  for (const key of ['error_type', 'error_code', 'status']) {
    const value = record[key];
    if (typeof value === 'string') {
      tokens.push(value.toLowerCase());
    }
  }

  const errorObj = record.error;
  if (errorObj && typeof errorObj === 'object') {
    const errorRecord = errorObj as Record<string, unknown>;
    for (const key of ['type', 'code', 'category', 'reason']) {
      const value = errorRecord[key];
      if (typeof value === 'string') {
        tokens.push(value.toLowerCase());
      }
    }
    const message = errorRecord.message;
    if (typeof message === 'string') {
      tokens.push(message.toLowerCase());
    }
  } else if (typeof errorObj === 'string') {
    tokens.push(errorObj.toLowerCase());
  }

  if (extra) {
    const extraError = extra.error;
    if (extraError && typeof extraError === 'object') {
      const extraErrorRecord = extraError as Record<string, unknown>;
      for (const key of ['type', 'code', 'category', 'reason']) {
        const value = extraErrorRecord[key];
        if (typeof value === 'string') {
          tokens.push(value.toLowerCase());
        }
      }
      const message = extraErrorRecord.message;
      if (typeof message === 'string') {
        tokens.push(message.toLowerCase());
      }
    } else if (typeof extraError === 'string') {
      tokens.push(extraError.toLowerCase());
    }
  }

  const classifiers: Array<[string, string[]]> = [
    ['timeout', ['timeout', 'deadline']],
    ['tool', ['tool', 'tools']],
    ['validation', ['validation', 'schema', 'invalid']],
    ['rate_limit', ['rate limit', 'ratelimit', 'throttle', '429']]
  ];

  for (const [label, keywords] of classifiers) {
    if (tokens.some((token) => keywords.some((keyword) => token.includes(keyword)))) {
      return label;
    }
  }

  return 'unknown';
};

const accumulateRunsFile = async (runDir: string, metrics: RunMetrics): Promise<boolean> => {
  const runsPath = join(runDir, 'runs.jsonl');
  try {
    await fs.access(runsPath);
  } catch {
    return false;
  }

  let runFailed = false;
  const stream = createReadStream(runsPath, { encoding: 'utf8' }).pipe(split2());

  for await (const line of stream) {
    const text = typeof line === 'string' ? line : line.toString();
    if (!text.trim()) {
      continue;
    }
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(text);
    } catch {
      continue;
    }
    if (record.event !== 'end') {
      continue;
    }

    const step = record.step;
    if (typeof step !== 'string' || !step) {
      continue;
    }

    const stepMetrics = metrics.stepStats.get(step) ?? initStepMetrics();
    metrics.stepStats.set(step, stepMetrics);
    stepMetrics.runs += 1;

    const latency = record.latency_ms;
    if (typeof latency === 'number' && Number.isFinite(latency)) {
      stepMetrics.totalLatencyMs += latency;
      metrics.totalLatencyMs += latency;
      metrics.completedSteps += 1;
    }

    const extra =
      record.extra && typeof record.extra === 'object'
        ? (record.extra as Record<string, unknown>)
        : undefined;

    if (extra) {
      const model = extra.model;
      if (typeof model === 'string' && model) {
        stepMetrics.models.add(model);
      }
      if (extra.type === 'mcp') {
        stepMetrics.mcpCalls += 1;
        const statusValue = typeof record.status === 'string' ? record.status.toLowerCase() : '';
        if (!SUCCESS_STATUSES.has(statusValue)) {
          stepMetrics.mcpErrors += 1;
        }
      }
    }

    const status = typeof record.status === 'string' ? record.status.toLowerCase() : '';
    if (SUCCESS_STATUSES.has(status)) {
      stepMetrics.successes += 1;
    } else {
      stepMetrics.failures += 1;
      const category = classifyError(record, extra);
      stepMetrics.errorCategories.set(
        category,
        (stepMetrics.errorCategories.get(category) ?? 0) + 1
      );
      metrics.errorCategories.set(category, (metrics.errorCategories.get(category) ?? 0) + 1);
      runFailed = true;
    }
  }

  return runFailed;
};

const aggregateMcpLogs = async (runDir: string, metrics: RunMetrics) => {
  const mcpPath = join(runDir, 'mcp_calls.jsonl');
  try {
    await fs.access(mcpPath);
  } catch {
    return;
  }

  const stream = createReadStream(mcpPath, { encoding: 'utf8' }).pipe(split2());

  for await (const line of stream) {
    const text = typeof line === 'string' ? line : line.toString();
    if (!text.trim()) {
      continue;
    }
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(text);
    } catch {
      continue;
    }

    metrics.mcpCalls += 1;
    const status = typeof record.status === 'string' ? record.status.toLowerCase() : '';
    const isSuccess = ['ok', 'success'].includes(status);
    if (!isSuccess) {
      metrics.mcpErrors += 1;
    }

    const modelName = extractModelName(record);
    const stats = metrics.modelStats.get(modelName) ?? initModelStats();
    metrics.modelStats.set(modelName, stats);
    stats.calls += 1;
    if (!isSuccess) {
      stats.errors += 1;
    }

    const usage =
      record.usage && typeof record.usage === 'object'
        ? (record.usage as Record<string, unknown>)
        : undefined;
    if (usage) {
      stats.inputTokens += Number(usage.input_tokens ?? 0) || 0;
      stats.outputTokens += Number(usage.output_tokens ?? 0) || 0;
      stats.totalTokens += Number(usage.total_tokens ?? 0) || 0;
      const costValue = usage.cost_usd;
      if (typeof costValue === 'number' || typeof costValue === 'string') {
        stats.costUsd += Number(costValue) || 0;
      }
    }

    for (const key of ['input_tokens', 'output_tokens', 'total_tokens'] as const) {
      const value = record[key];
      if (typeof value === 'number' || typeof value === 'string') {
        const numeric = Number(value) || 0;
        if (key === 'input_tokens') stats.inputTokens += numeric;
        if (key === 'output_tokens') stats.outputTokens += numeric;
        if (key === 'total_tokens') stats.totalTokens += numeric;
      }
    }

    const cost = record.cost_usd;
    if (typeof cost === 'number' || typeof cost === 'string') {
      stats.costUsd += Number(cost) || 0;
    }
  }
};

const summaryIndicatesSuccess = (summary: Record<string, unknown>): boolean => {
  const failures = summary.failures;
  if (failures && typeof failures === 'object') {
    if (Array.isArray(failures)) {
      return failures.length === 0;
    }
    if (failures instanceof Map) {
      return [...failures.values()].every((value) => !value);
    }
    const failureValues = Object.values(failures as Record<string, unknown>);
    if (failureValues.length > 0) {
      return failureValues.every((value) => !value);
    }
  }

  if (failures === null || failures === false) {
    return true;
  }

  const statusFields = [summary.status, summary.result];
  for (const field of statusFields) {
    if (typeof field === 'string' && SUCCESS_STATUSES.has(field.toLowerCase())) {
      return true;
    }
  }

  return false;
};

const formatStepEntries = (
  metrics: RunMetrics
): { steps: FlowSummary['steps']; totalFailures: number } => {
  const steps: FlowSummary['steps'] = [];
  let totalFailures = 0;

  const sortedSteps = [...metrics.stepStats.entries()].sort(([a], [b]) =>
    a.localeCompare(b, 'en')
  );

  for (const [name, data] of sortedSteps) {
    const entry: FlowSummary['steps'][number] = {
      name,
      runs: data.runs,
      successes: data.successes,
      errors: data.failures,
      success_rate: data.runs ? data.successes / data.runs : 0,
      avg_latency_ms: data.runs ? data.totalLatencyMs / data.runs : 0
    };
    totalFailures += data.failures;

    if (data.mcpCalls || data.mcpErrors) {
      entry.mcp = {
        calls: data.mcpCalls,
        errors: data.mcpErrors
      };
    }

    if (data.models.size > 0) {
      entry.models = [...data.models].sort();
    }

    if (data.errorCategories.size > 0) {
      entry.error_types = Object.fromEntries(
        [...data.errorCategories.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))
      );
    }

    steps.push(entry);
  }

  return { steps, totalFailures };
};

const formatModelEntries = (
  metrics: RunMetrics
): {
  models: FlowSummary['models'];
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  totalCost: number;
} => {
  const models: FlowSummary['models'] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalTokens = 0;
  let totalCost = 0;

  const sortedModels = [...metrics.modelStats.entries()].sort(([a], [b]) =>
    a.localeCompare(b, 'en')
  );

  for (const [name, stats] of sortedModels) {
    models.push({
      name,
      calls: stats.calls,
      errors: stats.errors,
      tokens: {
        input: stats.inputTokens,
        output: stats.outputTokens,
        total: stats.totalTokens
      },
      cost_usd: stats.costUsd
    });

    totalInput += stats.inputTokens;
    totalOutput += stats.outputTokens;
    totalTokens += stats.totalTokens;
    totalCost += stats.costUsd;
  }

  return { models, totalInput, totalOutput, totalTokens, totalCost };
};

const collectRunDirectories = async (base: string): Promise<string[]> => {
  const entries = await fs.readdir(base, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => join(base, entry.name));
};

export const summarizeFlowRuns = async (base?: string): Promise<FlowSummary> => {
  const root = resolve(base ?? '.runs');
  try {
    const stats = await fs.stat(root);
    if (!stats.isDirectory()) {
      return defaultSummary();
    }
  } catch {
    return defaultSummary();
  }

  const runDirs = await collectRunDirectories(root);
  if (runDirs.length === 0) {
    return defaultSummary();
  }

  const metrics = initRunMetrics();
  let totalRuns = 0;

  for (const runDir of runDirs) {
    const summary = await loadJson(join(runDir, 'summary.json'));
    if (!summary) {
      continue;
    }
    totalRuns += 1;

    const runFailed = await accumulateRunsFile(runDir, metrics);
    const summarySuccess = summaryIndicatesSuccess(summary);
    if (summarySuccess || !runFailed) {
      metrics.succeeded += 1;
    }
    await aggregateMcpLogs(runDir, metrics);
  }

  if (totalRuns === 0) {
    return defaultSummary();
  }

  const successRate = totalRuns ? metrics.succeeded / totalRuns : 0;
  const avgLatency =
    metrics.completedSteps > 0 ? metrics.totalLatencyMs / metrics.completedSteps : 0;

  if (metrics.mcpCalls === 0) {
    metrics.mcpCalls = [...metrics.stepStats.values()].reduce(
      (acc, step) => acc + step.mcpCalls,
      0
    );
  }
  if (metrics.mcpErrors === 0) {
    metrics.mcpErrors = [...metrics.stepStats.values()].reduce(
      (acc, step) => acc + step.mcpErrors,
      0
    );
  }

  const { steps, totalFailures } = formatStepEntries(metrics);
  const { models, totalInput, totalOutput, totalTokens, totalCost } = formatModelEntries(metrics);

  const errors = {
    total: totalFailures,
    by_type: Object.fromEntries(
      [...metrics.errorCategories.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))
    )
  };

  return {
    runs: totalRuns,
    successes: metrics.succeeded,
    success_rate: successRate,
    avg_latency_ms: avgLatency,
    errors,
    mcp: {
      calls: metrics.mcpCalls,
      errors: metrics.mcpErrors,
      tokens: {
        input: totalInput,
        output: totalOutput,
        total: totalTokens
      },
      cost_usd: totalCost
    },
    steps,
    models
  };
};
