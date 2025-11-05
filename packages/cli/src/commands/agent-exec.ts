import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Args, Flags, Parser } from '@oclif/core';
import {
  type AgentContext,
  type DelegationEvent,
  type DelegationResult,
  type EngineId,
  type Plan,
  type TaskSpec
} from '@magsag/core';
import { SimpleManager } from '@magsag/manager';
import {
  RunnerSpecialistAgent,
  createWorktreeDelegationHandlers
} from '@magsag/specialist';
import { RunLogCollector } from '@magsag/observability';
import { resolvePrompt, resolveRepo, renderRunnerEvent } from './agent-run.js';
import { getDefaultRunnerRegistry } from '../registry.js';
import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedAgentExec {
  prompt?: string;
  repo: string;
  planPath?: string;
  providerMap: EngineProvider[];
  concurrency?: number;
  worktreeRoot?: string;
  baseRef?: string;
  runLogDir?: string;
}

interface EngineProvider {
  engine: EngineId;
  count: number;
}

const MAX_CONCURRENCY = 10;

const execFlags = {
  repo: Flags.string({
    char: 'r',
    summary: 'Repository root passed to the MAG/SAG workflow',
    description: 'Absolute or relative path to the repository root (defaults to current working directory).'
  }),
  plan: Flags.string({
    summary: 'Path to an existing plan JSON file',
    description: 'When provided, the CLI will execute the referenced plan instead of generating a new one from the prompt.'
  }),
  providerMap: Flags.string({
    summary: 'Comma-separated list of SAG provider engines with optional counts',
    description:
      'Format: engineId or engineId:count. Example: "claude-cli:2,codex-cli". Defaults to "claude-cli".'
  }),
  concurrency: Flags.integer({
    char: 'c',
    summary: 'Maximum number of concurrent SAG delegations',
    description: 'Must be between 1 and 10 and no greater than the number of instantiated SAG agents.'
  }),
  runLogDir: Flags.string({
    summary: 'Directory where run logs will be written',
    description: 'Defaults to <repo>/.magsag/runs when not provided.'
  }),
  worktreeRoot: Flags.string({
    summary: 'Root directory for git worktrees (optional)',
    description: 'Overrides the default location used when provisioning worktrees for SAG delegations.'
  }),
  base: Flags.string({
    summary: 'Git reference used when creating worktrees',
    description: 'Passed through to the worktree manager when preparing SAG workspaces (defaults to repository configuration).'
  })
} as const;

const execArgs = {
  prompt: Args.string({
    name: 'prompt',
    description: 'High-level task description (ignored when --plan is provided).',
    required: false
  })
} as const;

export const parseAgentExec = async (argv: string[]): Promise<ParsedAgentExec> => {
  const parsed = await Parser.parse(argv, {
    flags: execFlags,
    args: execArgs,
    strict: true
  });

  const planPath = parsed.flags.plan?.trim().length ? parsed.flags.plan : undefined;

  let prompt: string | undefined;
  if (!planPath) {
    prompt = await resolvePrompt(parsed.args.prompt);
  } else if (parsed.args.prompt && parsed.args.prompt.trim().length > 0) {
    prompt = parsed.args.prompt;
  }

  const repo = resolveRepo(parsed.flags.repo);
  const providerMap = parseProviderMap(parsed.flags.providerMap);
  const concurrency = parsed.flags.concurrency;
  const worktreeRoot = parsed.flags.worktreeRoot?.trim().length
    ? parsed.flags.worktreeRoot
    : undefined;
  const baseRef = parsed.flags.base?.trim().length ? parsed.flags.base : undefined;
  const runLogDir = parsed.flags.runLogDir?.trim().length
    ? parsed.flags.runLogDir
    : undefined;

  if (!planPath && !prompt) {
    throw new Error('Either a prompt or an existing plan must be provided.');
  }

  if (concurrency !== undefined && (Number.isNaN(concurrency) || concurrency < 1)) {
    throw new Error('Concurrency must be a positive integer.');
  }

  return {
    prompt,
    repo,
    planPath,
    providerMap,
    concurrency,
    worktreeRoot,
    baseRef,
    runLogDir
  };
};

const parseProviderMap = (raw?: string): EngineProvider[] => {
  if (!raw || raw.trim().length === 0) {
    return [{ engine: 'claude-cli', count: 1 }];
  }

  return raw
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map<EngineProvider>((segment) => {
      const [enginePart, countPart] = segment.split(':');
      if (!enginePart || enginePart.length === 0) {
        throw new Error(`Invalid provider entry '${segment}'.`);
      }
      const engine = validateEngine(enginePart);
      const count = countPart ? Number.parseInt(countPart, 10) : 1;
      if (!Number.isFinite(count) || count < 1) {
        throw new Error(`Invalid provider count in '${segment}'.`);
      }
      return { engine, count };
    });
};

const validateEngine = (value: string): EngineId => {
  const engines: EngineId[] = ['codex-cli', 'claude-cli', 'openai-agents', 'claude-agent', 'adk'];
  if (!engines.includes(value as EngineId)) {
    throw new Error(
      `Unsupported engine '${value}'. Supported engines: ${engines.sort().join(', ')}`
    );
  }
  return value as EngineId;
};

const buildTaskSpec = (prompt: string): TaskSpec => ({
  id: `task-${randomUUID()}`,
  goal: prompt,
  metadata: {
    source: 'cli',
    createdAt: new Date().toISOString()
  }
});

const buildAgentContext = (repo: string, worktreeRoot?: string): AgentContext => ({
  repoDir: repo,
  worktreeRoot
});

const loadPlanFromFile = async (planPath: string): Promise<Plan> => {
  const raw = await fs.readFile(planPath, 'utf8');
  const parsed = JSON.parse(raw) as Plan;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.steps)) {
    throw new Error(`Plan file '${planPath}' is missing required fields.`);
  }
  return parsed;
};

const buildSagAgents = (providers: EngineProvider[]): RunnerSpecialistAgent[] => {
  const registry = getDefaultRunnerRegistry();
  const agents: RunnerSpecialistAgent[] = [];
  const counters = new Map<EngineId, number>();

  for (const provider of providers) {
    const factory = registry.get(provider.engine);
    if (!factory) {
      throw new Error(`Runner not registered for engine '${provider.engine}'.`);
    }
    const startingIndex = counters.get(provider.engine) ?? 0;
    for (let index = 0; index < provider.count; index += 1) {
      const suffix = startingIndex + index + 1;
      const agentId = `${provider.engine}-${suffix}`;
      agents.push(
        new RunnerSpecialistAgent({
          id: agentId,
          runnerFactory: factory,
          engine: provider.engine
        })
      );
    }
    counters.set(provider.engine, startingIndex + provider.count);
  }

  return agents;
};

const handleDelegationEvent = (
  event: DelegationEvent,
  streams: CliStreams,
  results: Map<string, DelegationResult>
) => {
  switch (event.type) {
    case 'state': {
      const detail = event.detail ? ` (${event.detail})` : '';
      writeLine(streams.stderr, `[${event.subtaskId}] state=${event.state}${detail}`);
      break;
    }
    case 'runner':
      renderRunnerEvent(event.event, streams, { prefix: event.subtaskId });
      break;
    case 'result':
      results.set(event.result.subtaskId, event.result);
      break;
    default:
      break;
  }
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return JSON.stringify(error);
};

const sanitizeRunId = (value: string): string =>
  value.replace(/[^a-z0-9-_]+/gi, '-');

export const agentExecHandler = async (
  parsed: ParsedAgentExec,
  streams: CliStreams
): Promise<number> => {
  const sagAgents = buildSagAgents(parsed.providerMap);
  if (sagAgents.length === 0) {
    throw new Error('At least one SAG provider must be configured.');
  }

  const maxConcurrency = Math.min(
    parsed.concurrency ?? sagAgents.length,
    sagAgents.length,
    MAX_CONCURRENCY
  );

  if (maxConcurrency < 1) {
    throw new Error('Calculated concurrency is less than 1.');
  }

  const manager = new SimpleManager({
    onError: (error) => writeLine(streams.stderr, `[manager] ${errorMessage(error)}`)
  });

  const task = parsed.prompt ? buildTaskSpec(parsed.prompt) : undefined;
  const agentContext = buildAgentContext(parsed.repo, parsed.worktreeRoot);
  let plan: Plan;
  if (parsed.planPath) {
    plan = await loadPlanFromFile(parsed.planPath);
  } else {
    if (!task) {
      throw new Error('Prompt is required when no plan file is supplied.');
    }
    plan = await manager.createPlan(task, agentContext);
  }

  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error('Plan contains no steps to execute.');
  }

  const { prepare, finalize } = createWorktreeDelegationHandlers({
    repoPath: parsed.repo,
    worktreesRoot: parsed.worktreeRoot,
    baseRef: parsed.baseRef
  });

  const runLogDir = parsed.runLogDir ?? path.join(parsed.repo, '.magsag', 'runs');
  await fs.mkdir(runLogDir, { recursive: true });
  const runId = `${sanitizeRunId(plan.id)}-${randomUUID().slice(0, 8)}`;
  const collector = new RunLogCollector(runId);

  writeLine(
    streams.stderr,
    `Executing plan ${plan.id} (${plan.steps.length} steps) with ${sagAgents.length} specialists (concurrency=${maxConcurrency}).`
  );

  const controller = new AbortController();
  const onSigint = () => {
    controller.abort(new Error('Execution aborted by user'));
  };

  process.once('SIGINT', onSigint);

  const results = new Map<string, DelegationResult>();
  let exitCode = 0;

  try {
    const iterator = manager.run(plan, {
      sagPool: sagAgents,
      maxConcurrency,
      signal: controller.signal,
      prepareDelegation: prepare,
      finalizeDelegation: finalize
    });

    for await (const event of iterator) {
      collector.record(event);
      handleDelegationEvent(event, streams, results);
    }
  } catch (error) {
    exitCode = 1;
    writeLine(streams.stderr, `[error] ${errorMessage(error)}`);
  } finally {
    process.off('SIGINT', onSigint);
  }

  for (const result of results.values()) {
    const detail = result.detail ? ` (${result.detail})` : '';
    writeLine(streams.stderr, `[${result.subtaskId}] result=${result.status}${detail}`);
  }

  const summary = collector.summary();

  const logPath = path.join(runLogDir, `${runId}.jsonl`);
  await collector.writeToFile(logPath);

  writeLine(streams.stderr, `Summary: completed=${summary.totals.completed} failed=${summary.totals.failed} skipped=${summary.totals.skipped}`);
  writeLine(streams.stderr, `Run log saved to ${logPath}`);

  if (exitCode === 0) {
    const hasFailure = summary.totals.failed > 0;
    if (hasFailure) {
      exitCode = 1;
    }
  }

  return exitCode;
};
