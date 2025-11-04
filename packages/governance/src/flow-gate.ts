import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import yaml from 'yaml';
import { flowSummarySchema, type FlowSummary, type FlowSummaryStep } from '@magsag/schema';

const DEFAULT_POLICY_YAML = `
min_runs: 1
min_success_rate: 0.9
max_avg_latency_ms: 2500
required_steps:
  - hello

per_step:
  default:
    max_error_rate: 0.1
    max_avg_latency_ms: 3000
  finalize:
    max_error_rate: 0.05
    max_avg_latency_ms: 2000

mcp:
  max_error_rate: 0.05

models:
  denylist:
    - gpt-4o-realtime
    - internal-experimental-*
`.trim();

type JsonRecord = Record<string, unknown>;
type FlowPolicy = JsonRecord;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null;

const toRecord = (value: unknown): JsonRecord | undefined =>
  isRecord(value) ? value : undefined;

const requireRecord = (value: unknown, message: string): JsonRecord => {
  const record = toRecord(value);
  if (!record) {
    throw new Error(message);
  }
  return record;
};

const ratio = (numerator?: number, denominator?: number): number | undefined => {
  if (typeof numerator !== 'number' || typeof denominator !== 'number' || denominator === 0) {
    return undefined;
  }
  return numerator / denominator;
};

const escapeRegex = (value: string): string =>
  value.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');

const patternToRegex = (pattern: string): RegExp => {
  const escaped = escapeRegex(pattern).replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
};

const matchPattern = (value: string, pattern: string): boolean => {
  if (!pattern.includes('*') && !pattern.includes('?')) {
    return value === pattern;
  }
  return patternToRegex(pattern).test(value);
};

const numbers = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item)) : [];

const loadSummary = async (summaryPath: string): Promise<FlowSummary> => {
  const raw = await readFile(summaryPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  return flowSummarySchema.parse(parsed);
};

const toFlowPolicy = (value: unknown): FlowPolicy => {
  if (value === null || value === undefined) {
    return {};
  }
  const record = requireRecord(value, 'Policy data must be a mapping');
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => [String(key), entry])
  );
};

const loadPolicy = async (policyPath?: string): Promise<FlowPolicy> => {
  if (!policyPath) {
    return toFlowPolicy(yaml.parse(DEFAULT_POLICY_YAML) as unknown);
  }
  const raw = await readFile(policyPath, 'utf8');
  return toFlowPolicy(yaml.parse(raw) as unknown);
};

const evaluateStep = (
  step: FlowSummaryStep,
  stepPolicy: JsonRecord,
  errors: string[],
  rootPolicy: JsonRecord
) => {
  const stepExtras = step as FlowSummaryStep & JsonRecord;
  const name = String(step.name ?? '<unknown>');
  const runs = numbers(step.runs) ?? 0;
  const successes = numbers(step.successes) ?? 0;
  const errorRate = ratio(runs - successes, runs);
  const maxErrorRate = numbers(stepPolicy['max_error_rate']);
  if (errorRate !== undefined && maxErrorRate !== undefined && errorRate > maxErrorRate) {
    errors.push(`step ${name}: error_rate ${errorRate.toFixed(3)} > max ${maxErrorRate.toFixed(3)}`);
  }

  const avgLatency = numbers(step.avg_latency_ms);
  const maxLatency = numbers(stepPolicy['max_avg_latency_ms']);
  if (avgLatency !== undefined && maxLatency !== undefined && avgLatency > maxLatency) {
    errors.push(`step ${name}: avg_latency_ms ${avgLatency.toFixed(1)} > max ${maxLatency.toFixed(1)}`);
  }

  const models = step.models;
  let model: string | undefined;
  if (Array.isArray(models) && models.length > 0) {
    model = String(models[0]);
  } else if (typeof stepExtras.model === 'string') {
    model = String(stepExtras.model);
  }
  if (typeof model === 'string') {
    const modelPolicy = toRecord(rootPolicy.models) ?? {};
    const denylist = stringArray(modelPolicy.denylist);
    if (denylist.some((pattern) => matchPattern(model, pattern))) {
      errors.push(`step ${name}: model '${model}' is denied`);
    }

    const allowlist = stringArray(modelPolicy.allowlist);
    if (allowlist.length > 0 && !allowlist.some((pattern) => matchPattern(model, pattern))) {
      errors.push(`step ${name}: model '${model}' not allowed`);
    }
  }

  const mcp = step.mcp;
  const mcpCalls = numbers(mcp?.calls);
  const mcpErrors = numbers(mcp?.errors);
  const mcpErrorRate = ratio(mcpErrors, mcpCalls);
  const maxMcpErrorRate = numbers(stepPolicy['max_mcp_error_rate']);
  if (mcpErrorRate !== undefined && maxMcpErrorRate !== undefined && mcpErrorRate > maxMcpErrorRate) {
    errors.push(
      `step ${name}: mcp.error_rate ${mcpErrorRate.toFixed(3)} > max ${maxMcpErrorRate.toFixed(3)}`
    );
  }
};

export const evaluateFlowSummary = async (
  summaryPath: string,
  policyPath?: string
): Promise<string[]> => {
  const summary = await loadSummary(resolve(summaryPath));
  const policy = await loadPolicy(policyPath ? resolve(policyPath) : undefined);

  const errors: string[] = [];

  const minRuns = numbers(policy['min_runs']);
  const runs = numbers(summary.runs) ?? 0;
  if (minRuns !== undefined && runs < minRuns) {
    errors.push(`runs ${runs} < min ${minRuns}`);
  }

  const minSuccessRate = numbers(policy['min_success_rate']);
  const successRate = numbers(summary.success_rate);
  if (minSuccessRate !== undefined && successRate !== undefined && successRate < minSuccessRate) {
    errors.push(`success_rate ${successRate.toFixed(3)} < min ${minSuccessRate.toFixed(3)}`);
  }

  const maxAvgLatency = numbers(policy['max_avg_latency_ms']);
  const avgLatency = numbers(summary.avg_latency_ms);
  if (maxAvgLatency !== undefined && avgLatency !== undefined && avgLatency > maxAvgLatency) {
    errors.push(`avg_latency_ms ${avgLatency.toFixed(1)} > max ${maxAvgLatency.toFixed(1)}`);
  }

  const steps = summary.steps;

  const requiredSteps = stringArray(policy['required_steps']);
  if (requiredSteps.length > 0) {
    const presentSteps = new Set(steps.map((step) => String(step.name ?? '')));
    const missing = requiredSteps.filter((stepName) => !presentSteps.has(stepName));
    if (missing.length > 0) {
      errors.push(`missing required steps: ${missing.join(', ')}`);
    }
  }

  const perStepPolicy = toRecord(policy.per_step) ?? {};
  const defaultStepPolicy = toRecord(perStepPolicy.default) ?? {};

  for (const step of steps) {
    const name = String(step.name ?? '<unknown>');
    const stepPolicy = toRecord(perStepPolicy[name]) ?? defaultStepPolicy;
    evaluateStep(step, stepPolicy, errors, policy);
  }

  const mcpPolicy = toRecord(policy.mcp);
  const maxMcpRate = numbers(mcpPolicy?.max_error_rate);
  if (maxMcpRate !== undefined) {
    const mcpSummary = toRecord(summary.mcp) ?? {};
    let totalCalls = numbers(mcpSummary.calls);
    let totalErrors = numbers(mcpSummary.errors);
    if (totalCalls === undefined) {
      totalCalls = steps.reduce(
        (acc, step) => acc + (numbers(toRecord(step.mcp)?.calls) ?? 0),
        0
      );
    }
    if (totalErrors === undefined) {
      totalErrors = steps.reduce(
        (acc, step) => acc + (numbers(toRecord(step.mcp)?.errors) ?? 0),
        0
      );
    }
    const rate = ratio(totalErrors, totalCalls);
    if (rate !== undefined && rate > maxMcpRate) {
      errors.push(`mcp.error_rate ${rate.toFixed(3)} > max ${maxMcpRate.toFixed(3)}`);
    }
  }

  return errors;
};
