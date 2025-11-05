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
}

const loadAgentsModule = async () =>
  (await import('@openai/agents')) as unknown as {
    Agent: new (options: { name?: string; instructions?: string }) => unknown;
    run: (
      agent: unknown,
      input: string,
      options?: { stream?: boolean }
    ) => Promise<unknown>;
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

export class OpenAiAgentsRunner implements Runner {
  constructor(private readonly options: OpenAiAgentsRunnerOptions = {}) {}

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const validated = runSpecSchema.parse(spec);
    const apiKey = this.options.apiKey ?? process.env.OPENAI_API_KEY;

    if (!apiKey) {
      yield {
        type: 'error',
        error: { message: 'OPENAI_API_KEY is required for openai-agents runner' }
      };
      yield { type: 'done' };
      return;
    }

    const previous = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = apiKey;

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

    const extraEnv = {
      ...normalizeEnvRecord(validated.extra?.env),
      ...(workspace ? workspace.environment() : {})
    };
    const previousEnvEntries = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(extraEnv)) {
      previousEnvEntries.set(key, process.env[key]);
      process.env[key] = value;
    }

    const restoreMcpEnvironment = applyRunnerMcpEnv(validated.extra?.mcp);
    yield* flushWorkspace();

    try {
      const { Agent, run } = await loadAgentsModule();
      const agent = new Agent({
        name: 'MAGSAG Runner',
        instructions: this.options.instructions ?? validated.prompt
      });

      yield {
        type: 'log',
        data: 'Starting OpenAI Agents SDK run'
      };
      yield* flushWorkspace();

      const result = await run(agent, validated.prompt);
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
      if (previous !== undefined) {
        process.env.OPENAI_API_KEY = previous;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      for (const [key, previousValue] of previousEnvEntries.entries()) {
        if (previousValue !== undefined) {
          process.env[key] = previousValue;
        } else {
          delete process.env[key];
        }
      }
      restoreMcpEnvironment();
      await workspace?.finalize();
      yield* flushWorkspace();
    }
  }
}

export const createOpenAiAgentsRunner = (
  options?: OpenAiAgentsRunnerOptions
): Runner => new OpenAiAgentsRunner(options);
