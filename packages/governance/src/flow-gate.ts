import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { ValidateFunction, ErrorObject } from 'ajv';
import yaml from 'yaml';

const FLOW_SUMMARY_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'FlowSummary',
  type: 'object',
  required: [
    'runs',
    'successes',
    'success_rate',
    'avg_latency_ms',
    'errors',
    'mcp',
    'steps',
    'models'
  ],
  properties: {
    runs: { type: 'integer', minimum: 0 },
    successes: { type: 'integer', minimum: 0 },
    success_rate: { type: 'number', minimum: 0, maximum: 1 },
    avg_latency_ms: { type: 'number', minimum: 0 },
    errors: {
      type: 'object',
      required: ['total', 'by_type'],
      properties: {
        total: { type: 'integer', minimum: 0 },
        by_type: {
          type: 'object',
          additionalProperties: { type: 'integer', minimum: 0 }
        }
      },
      additionalProperties: true
    },
    mcp: {
      type: 'object',
      required: ['calls', 'errors', 'tokens', 'cost_usd'],
      properties: {
        calls: { type: 'integer', minimum: 0 },
        errors: { type: 'integer', minimum: 0 },
        tokens: {
          type: 'object',
          required: ['input', 'output', 'total'],
          properties: {
            input: { type: 'integer', minimum: 0 },
            output: { type: 'integer', minimum: 0 },
            total: { type: 'integer', minimum: 0 }
          },
          additionalProperties: true
        },
        cost_usd: { type: 'number', minimum: 0 }
      },
      additionalProperties: true
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'runs', 'successes', 'errors'],
        properties: {
          name: { type: 'string', minLength: 1 },
          runs: { type: 'integer', minimum: 0 },
          successes: { type: 'integer', minimum: 0 },
          errors: { type: 'integer', minimum: 0 },
          success_rate: { type: 'number', minimum: 0, maximum: 1 },
          avg_latency_ms: { type: 'number', minimum: 0 },
          mcp: {
            type: 'object',
            properties: {
              calls: { type: 'integer', minimum: 0 },
              errors: { type: 'integer', minimum: 0 }
            },
            additionalProperties: true
          },
          models: {
            type: 'array',
            items: { type: 'string' }
          },
          error_types: {
            type: 'object',
            additionalProperties: { type: 'integer', minimum: 0 }
          }
        },
        additionalProperties: true
      }
    },
    models: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'calls', 'errors', 'tokens', 'cost_usd'],
        properties: {
          name: { type: 'string', minLength: 1 },
          calls: { type: 'integer', minimum: 0 },
          errors: { type: 'integer', minimum: 0 },
          tokens: {
            type: 'object',
            required: ['input', 'output', 'total'],
            properties: {
              input: { type: 'integer', minimum: 0 },
              output: { type: 'integer', minimum: 0 },
              total: { type: 'integer', minimum: 0 }
            },
            additionalProperties: true
          },
          cost_usd: { type: 'number', minimum: 0 }
        },
        additionalProperties: true
      }
    }
  },
  additionalProperties: true
} as const;

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

type FlowSummary = Record<string, unknown>;
type FlowPolicy = Record<string, unknown>;

const require = createRequire(import.meta.url);
const Ajv2020Factory = require('ajv/dist/2020').default as any;
const ajv = new Ajv2020Factory({ allErrors: true, strict: false });
let validator: ValidateFunction | undefined;

const getValidator = (): ValidateFunction => {
  if (!validator) {
    validator = ajv.compile(FLOW_SUMMARY_SCHEMA);
  }
  return validator!;
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

const loadSummary = async (summaryPath: string): Promise<FlowSummary> => {
  const raw = await readFile(summaryPath, 'utf8');
  const parsed = JSON.parse(raw) as FlowSummary;
  const validate = getValidator();
  if (!validate(parsed)) {
    const message = validate.errors
      ?.map((err: ErrorObject) => `${err.instancePath} ${err.message}`)
      .join(', ');
    throw new Error(`Summary does not match schema: ${message ?? 'unknown error'}`);
  }
  return parsed;
};

const loadPolicy = async (policyPath?: string): Promise<FlowPolicy> => {
  if (!policyPath) {
    return (yaml.parse(DEFAULT_POLICY_YAML) ?? {}) as FlowPolicy;
  }
  const raw = await readFile(policyPath, 'utf8');
  const parsed = yaml.parse(raw);
  if (parsed === null) {
    return {};
  }
  if (typeof parsed !== 'object') {
    throw new Error('Policy data must be a mapping');
  }
  const entries = Object.entries(parsed as Record<string, unknown>).map(([key, value]) => [
    String(key),
    value
  ]);
  return Object.fromEntries(entries);
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

const ensureRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const evaluateStep = (
  step: Record<string, unknown>,
  stepPolicy: Record<string, unknown>,
  errors: string[],
  rootPolicy: Record<string, unknown>
) => {
  const name = String(step.name ?? '<unknown>');
  const runs = numbers(step.runs) ?? 0;
  const successes = numbers(step.successes) ?? 0;
  const errorRate = ratio(runs - successes, runs);
  const maxErrorRate = numbers(stepPolicy.max_error_rate);
  if (errorRate !== undefined && maxErrorRate !== undefined && errorRate > maxErrorRate) {
    errors.push(`step ${name}: error_rate ${errorRate.toFixed(3)} > max ${maxErrorRate.toFixed(3)}`);
  }

  const avgLatency = numbers(step.avg_latency_ms);
  const maxLatency = numbers(stepPolicy.max_avg_latency_ms);
  if (avgLatency !== undefined && maxLatency !== undefined && avgLatency > maxLatency) {
    errors.push(
      `step ${name}: avg_latency_ms ${avgLatency.toFixed(1)} > max ${maxLatency.toFixed(1)}`
    );
  }

  const models = step.models;
  let model: string | undefined;
  if (Array.isArray(models) && models.length > 0) {
    model = String(models[0]);
  } else if (typeof step.model === 'string') {
    model = step.model;
  }
  if (typeof model === 'string') {
    const modelPolicy = ensureRecord(rootPolicy.models) ?? {};
    const denylist = stringArray(modelPolicy.denylist);
    if (denylist.some((pattern) => matchPattern(model!, pattern))) {
      errors.push(`step ${name}: model '${model}' is denied`);
    }

    const allowlist = stringArray(modelPolicy.allowlist);
    if (allowlist.length > 0 && !allowlist.some((pattern) => matchPattern(model!, pattern))) {
      errors.push(`step ${name}: model '${model}' not allowed`);
    }
  }

  const mcp = ensureRecord(step.mcp);
  const mcpCalls = numbers(mcp?.calls);
  const mcpErrors = numbers(mcp?.errors);
  const mcpErrorRate = ratio(mcpErrors, mcpCalls);
  const maxMcpErrorRate = numbers(stepPolicy.max_mcp_error_rate);
  if (
    mcpErrorRate !== undefined &&
    maxMcpErrorRate !== undefined &&
    mcpErrorRate > maxMcpErrorRate
  ) {
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

  const minRuns = numbers(policy.min_runs);
  const runs = numbers(summary.runs) ?? 0;
  if (minRuns !== undefined && runs < minRuns) {
    errors.push(`runs ${runs} < min ${minRuns}`);
  }

  const minSuccessRate = numbers(policy.min_success_rate);
  const successRate = numbers(summary.success_rate);
  if (
    minSuccessRate !== undefined &&
    successRate !== undefined &&
    successRate < minSuccessRate
  ) {
    errors.push(
      `success_rate ${successRate.toFixed(3)} < min ${minSuccessRate.toFixed(3)}`
    );
  }

  const maxAvgLatency = numbers(policy.max_avg_latency_ms);
  const avgLatency = numbers(summary.avg_latency_ms);
  if (maxAvgLatency !== undefined && avgLatency !== undefined && avgLatency > maxAvgLatency) {
    errors.push(
      `avg_latency_ms ${avgLatency.toFixed(1)} > max ${maxAvgLatency.toFixed(1)}`
    );
  }

  const steps = Array.isArray(summary.steps)
    ? (summary.steps as Array<Record<string, unknown>>)
    : [];

  const requiredSteps = stringArray(policy.required_steps);
  if (requiredSteps.length > 0) {
    const presentSteps = new Set(steps.map((step) => String(step.name ?? '')));
    const missing = requiredSteps.filter((step) => !presentSteps.has(step));
    if (missing.length > 0) {
      errors.push(`missing required steps: ${missing.join(', ')}`);
    }
  }

  const perStepPolicy = ensureRecord(policy.per_step) ?? {};
  const defaultStepPolicy = ensureRecord(perStepPolicy.default) ?? {};

  for (const step of steps) {
    const name = String(step.name ?? '<unknown>');
    const stepPolicy = ensureRecord(perStepPolicy[name]) ?? defaultStepPolicy;
    evaluateStep(step, stepPolicy, errors, policy);
  }

  const mcpPolicy = ensureRecord(policy.mcp);
  const maxMcpRate = numbers(mcpPolicy?.max_error_rate);
  if (maxMcpRate !== undefined) {
    const mcpSummary = ensureRecord(summary.mcp) ?? {};
    let totalCalls = numbers(mcpSummary.calls);
    let totalErrors = numbers(mcpSummary.errors);
    if (totalCalls === undefined) {
      totalCalls = steps.reduce(
        (acc, step) => acc + (numbers(ensureRecord(step.mcp)?.calls) ?? 0),
        0
      );
    }
    if (totalErrors === undefined) {
      totalErrors = steps.reduce(
        (acc, step) => acc + (numbers(ensureRecord(step.mcp)?.errors) ?? 0),
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
