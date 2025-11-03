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

export interface RunSpec {
  engine: EngineId;
  repo: string;
  prompt: string;
  resumeId?: string;
  extra?: Record<string, unknown>;
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
  | { type: 'diff'; files: Array<{ path: string; patch: string }> }
  | { type: 'tool-call'; call: ToolCallPayload }
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
