import {
  ExecutionWorkspace,
  applyRunnerMcpEnv,
  type Runner,
  type RunnerEvent,
  type RunSpec
} from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

export interface OpenAiAgentsRunnerOptions {
  apiKey?: string;
  instructions?: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
  project?: string;
  moduleLoader?: () => Promise<{
    Agent: new (options: { name: string; instructions?: string; model?: string }) => unknown;
    Runner: new (config?: {
      modelProvider?: unknown;
      model?: string;
      tracingDisabled?: boolean;
      traceIncludeSensitiveData?: boolean;
    }) => {
      run: (
        agent: unknown,
        input: string,
        options?: { context?: unknown }
      ) => Promise<unknown>;
    };
    OpenAIProvider: new (options: {
      apiKey?: string;
      baseURL?: string;
      organization?: string;
      project?: string;
    }) => unknown;
  }>;
}

const loadAgentsModule = async () =>
  (await import('@openai/agents')) as unknown as {
    Agent: new (options: { name: string; instructions?: string; model?: string }) => unknown;
    Runner: new (config?: {
      modelProvider?: unknown;
      model?: string;
      tracingDisabled?: boolean;
      traceIncludeSensitiveData?: boolean;
    }) => {
      run: (
        agent: unknown,
        input: string,
        options?: { context?: unknown }
      ) => Promise<unknown>;
    };
    OpenAIProvider: new (options: {
      apiKey?: string;
      baseURL?: string;
      organization?: string;
      project?: string;
    }) => unknown;
  };

const extractFinalOutput = (result: unknown): string | undefined => {
  if (!result || typeof result !== 'object') {
    return undefined;
  }

  if ('finalOutput' in result) {
    const value = (result as { finalOutput?: unknown }).finalOutput;
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object' && 'output' in value) {
      const output = (value as { output?: unknown }).output;
      if (typeof output === 'string') {
        return output;
      }
    }
  }

  return undefined;
};

const normalizeEnvRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const entries = value as Record<string, unknown>;
  return Object.entries(entries).reduce<Record<string, string>>((acc, [key, entry]) => {
    if (typeof entry === 'string') {
      acc[key] = entry;
    } else if (typeof entry === 'number' || typeof entry === 'boolean') {
      acc[key] = String(entry);
    }
    return acc;
  }, {});
};

interface ResolvedOpenAiConfig {
  apiKey?: string;
  baseURL?: string;
  organization?: string;
  project?: string;
}

const resolveOpenAiConfig = (
  options: OpenAiAgentsRunnerOptions,
  env: Record<string, string>
): ResolvedOpenAiConfig => {
  const apiKey =
    options.apiKey ?? env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? undefined;
  const baseURL =
    options.baseUrl ??
    env.OPENAI_BASE_URL ??
    env.OPENAI_API_BASE ??
    process.env.OPENAI_BASE_URL ??
    process.env.OPENAI_API_BASE ??
    undefined;
  const organization =
    options.organization ?? env.OPENAI_ORGANIZATION ?? process.env.OPENAI_ORGANIZATION;
  const project = options.project ?? env.OPENAI_PROJECT ?? process.env.OPENAI_PROJECT;

  return {
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    ...(organization ? { organization } : {}),
    ...(project ? { project } : {})
  };
};

export class OpenAiAgentsRunner implements Runner {
  private readonly config: Omit<OpenAiAgentsRunnerOptions, 'moduleLoader'>;
  private readonly loadModule: () => ReturnType<typeof loadAgentsModule>;

  constructor(options: OpenAiAgentsRunnerOptions = {}) {
    const { moduleLoader, ...rest } = options;
    this.config = rest;
    this.loadModule = moduleLoader ?? loadAgentsModule;
  }

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const validated = runSpecSchema.parse(spec);
    const envOverrides = normalizeEnvRecord(validated.extra?.env);
    const credentials = resolveOpenAiConfig(this.config, envOverrides);

    if (!credentials.apiKey) {
      yield {
        type: 'error',
        error: { message: 'OPENAI_API_KEY is required for openai-agents runner' }
      };
      yield { type: 'done' };
      return;
    }

    const workspaceEvents: RunnerEvent[] = [];
    const flushWorkspace = function* (): Generator<RunnerEvent> {
      while (workspaceEvents.length > 0) {
        yield workspaceEvents.shift()!;
      }
    };

    const workspace = validated.extra?.workspace
      ? await ExecutionWorkspace.create(validated.extra.workspace, ({ channel, message }) => {
          workspaceEvents.push({ type: 'log', data: message, channel });
        })
      : null;

    const runtimeEnv = {
      ...envOverrides,
      ...(workspace ? workspace.environment() : {})
    };

    const restoreMcpEnvironment = applyRunnerMcpEnv(validated.extra?.mcp);
    yield* flushWorkspace();

    try {
      const { Agent, Runner, OpenAIProvider } = await this.loadModule();
      const agent = new Agent({
        name: 'MAGSAG Runner',
        instructions: this.config.instructions ?? validated.prompt,
        model: this.config.model
      });
      const provider = new OpenAIProvider({
        apiKey: credentials.apiKey,
        ...(credentials.baseURL ? { baseURL: credentials.baseURL } : {}),
        ...(credentials.organization ? { organization: credentials.organization } : {}),
        ...(credentials.project ? { project: credentials.project } : {})
      });
      const runner = new Runner({
        modelProvider: provider,
        ...(this.config.model ? { model: this.config.model } : {})
      });

      yield {
        type: 'log',
        data: 'Starting OpenAI Agents SDK run'
      };
      yield* flushWorkspace();

      const result = await runner.run(agent, validated.prompt, {
        context: { environment: runtimeEnv }
      });
      const output = extractFinalOutput(result);

      if (output) {
        yield {
          type: 'message',
          role: 'assistant',
          content: output
        };
      } else {
        yield {
          type: 'log',
          data: 'OpenAI Agents SDK completed without final output payload'
        };
      }
      yield* flushWorkspace();

      yield {
        type: 'done',
        stats: typeof result === 'object' && result ? { result } : undefined
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'openai-agents run failed';
      yield {
        type: 'error',
        error: { message }
      };
      yield { type: 'done' };
      yield* flushWorkspace();
    } finally {
      restoreMcpEnvironment();
      await workspace?.finalize();
      yield* flushWorkspace();
    }
  }
}

export const createOpenAiAgentsRunner = (
  options?: OpenAiAgentsRunnerOptions
): Runner => new OpenAiAgentsRunner(options);
