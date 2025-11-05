import type { FlowSummary } from '@magsag/schema';

export const ENGINE_IDS = [
  'codex-cli',
  'claude-cli',
  'openai-agents',
  'claude-agent',
  'adk'
] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

export type EngineMode = 'auto' | 'subscription' | 'api' | 'oss';

export interface EngineSelection {
  mode: EngineMode;
  mag: EngineId;
  sag: EngineId;
}

export interface RunnerMcpRuntime {
  url: string;
  host: string;
  port: number;
  path: string;
}

export interface RunnerMcpMetadata {
  runtime: RunnerMcpRuntime;
  tools?: string[];
}

export const RUNNER_MCP_ENV = {
  url: 'MAGSAG_MCP_SERVER_URL',
  host: 'MAGSAG_MCP_SERVER_HOST',
  port: 'MAGSAG_MCP_SERVER_PORT',
  path: 'MAGSAG_MCP_SERVER_PATH',
  tools: 'MAGSAG_MCP_TOOLS'
} as const;

export const buildRunnerMcpEnv = (
  metadata?: RunnerMcpMetadata
): Record<string, string> => {
  const runtime = metadata?.runtime;
  if (!runtime) {
    return {};
  }

  const env: Record<string, string> = {
    [RUNNER_MCP_ENV.url]: runtime.url,
    [RUNNER_MCP_ENV.host]: runtime.host,
    [RUNNER_MCP_ENV.port]: String(runtime.port),
    [RUNNER_MCP_ENV.path]: runtime.path,
    MCP_SERVER: runtime.url
  };

  const tools = metadata?.tools;
  if (tools && tools.length > 0) {
    env[RUNNER_MCP_ENV.tools] = tools.join(',');
  }

  return env;
};

export const applyRunnerMcpEnv = (metadata?: RunnerMcpMetadata): (() => void) => {
  const runtime = metadata?.runtime;
  if (!runtime) {
    return () => undefined;
  }

  const envUpdates = buildRunnerMcpEnv(metadata);
  const keysToTrack = new Set<string>([
    ...Object.keys(envUpdates),
    RUNNER_MCP_ENV.tools
  ]);

  const previous = new Map<string, string | undefined>();
  for (const key of keysToTrack) {
    previous.set(key, process.env[key]);
  }

  for (const [key, value] of Object.entries(envUpdates)) {
    process.env[key] = value;
  }

  if (!metadata?.tools || metadata.tools.length === 0) {
    delete process.env[RUNNER_MCP_ENV.tools];
  }

  return () => {
    for (const [key, previousValue] of previous.entries()) {
      if (previousValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previousValue;
      }
    }
  };
};

export interface RunSpecExtra extends Record<string, unknown> {
  mcp?: RunnerMcpMetadata;
}

export interface RunSpec {
  engine: EngineId;
  repo: string;
  prompt: string;
  resumeId?: string;
  extra?: RunSpecExtra;
}

export interface ToolCallPayload {
  name: string;
  arguments: Record<string, unknown>;
}

export interface RunnerErrorPayload {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

export type RunnerEvent =
  | { type: 'log'; data: string }
  | { type: 'message'; role: 'assistant' | 'tool' | 'system'; content: string }
  | { type: 'diff'; files: { path: string; patch: string }[] }
  | { type: 'tool-call'; call: ToolCallPayload }
  | { type: 'flow-summary'; summary: FlowSummary }
  | { type: 'done'; sessionId?: string; stats?: Record<string, unknown> }
  | { type: 'error'; error: RunnerErrorPayload };

export interface Runner {
  run(spec: RunSpec): AsyncIterable<RunnerEvent>;
}

export interface RunnerFactory {
  readonly id: EngineId;
  create(config?: Record<string, unknown>): Runner;
}

export interface RunnerRegistry {
  register(factory: RunnerFactory): void;
  get(engine: EngineId): RunnerFactory | undefined;
  list(): RunnerFactory[];
}

export class InMemoryRunnerRegistry implements RunnerRegistry {
  private factories = new Map<EngineId, RunnerFactory>();

  register(factory: RunnerFactory): void {
    this.factories.set(factory.id, factory);
  }

  get(engine: EngineId): RunnerFactory | undefined {
    return this.factories.get(engine);
  }

  list(): RunnerFactory[] {
    return Array.from(this.factories.values());
  }
}

export const DEFAULT_ENGINE_SELECTION: EngineSelection = {
  mode: 'subscription',
  mag: 'codex-cli',
  sag: 'claude-cli'
};

export const ENGINE_ENV = {
  mode: 'ENGINE_MODE',
  mag: 'ENGINE_MAG',
  sag: 'ENGINE_SAG'
} as const;

const isEngineId = (value: string | undefined): value is EngineId =>
  typeof value === 'string' && (ENGINE_IDS as readonly string[]).includes(value);

const isEngineMode = (value: string | undefined): value is EngineMode =>
  typeof value === 'string' &&
  (['auto', 'subscription', 'api', 'oss'] as readonly string[]).includes(value);

export const resolveEngineSelection = (
  env: Record<string, string | undefined>
): EngineSelection => {
  const candidateMode = env[ENGINE_ENV.mode];
  const mode: EngineMode = isEngineMode(candidateMode)
    ? candidateMode
    : DEFAULT_ENGINE_SELECTION.mode;

  const candidateMag = env[ENGINE_ENV.mag];
  const mag: EngineId = isEngineId(candidateMag)
    ? candidateMag
    : DEFAULT_ENGINE_SELECTION.mag;

  const candidateSag = env[ENGINE_ENV.sag];
  const sag: EngineId = isEngineId(candidateSag)
    ? candidateSag
    : DEFAULT_ENGINE_SELECTION.sag;

  return { mode, mag, sag };
};

export interface RunnerDispatch {
  mag: Runner;
  sag: Runner;
}
