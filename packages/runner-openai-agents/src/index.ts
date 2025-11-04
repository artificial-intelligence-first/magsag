import type { Runner, RunnerEvent, RunSpec, RunnerMcpMetadata } from '@magsag/core';
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

    const restoreMcpEnvironment = applyMcpEnvironment(validated.extra?.mcp);

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
    } finally {
      if (previous !== undefined) {
        process.env.OPENAI_API_KEY = previous;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
      restoreMcpEnvironment();
    }
  }
}

export const createOpenAiAgentsRunner = (
  options?: OpenAiAgentsRunnerOptions
): Runner => new OpenAiAgentsRunner(options);

const applyMcpEnvironment = (metadata?: RunnerMcpMetadata): (() => void) => {
  if (!metadata?.runtime) {
    return () => undefined;
  }

  const previousEntries: [string, string | undefined][] = [
    ['MAGSAG_MCP_SERVER_URL', process.env.MAGSAG_MCP_SERVER_URL],
    ['MAGSAG_MCP_SERVER_HOST', process.env.MAGSAG_MCP_SERVER_HOST],
    ['MAGSAG_MCP_SERVER_PORT', process.env.MAGSAG_MCP_SERVER_PORT],
    ['MAGSAG_MCP_SERVER_PATH', process.env.MAGSAG_MCP_SERVER_PATH],
    ['MCP_SERVER', process.env.MCP_SERVER],
    ['MAGSAG_MCP_TOOLS', process.env.MAGSAG_MCP_TOOLS]
  ];

  process.env.MAGSAG_MCP_SERVER_URL = metadata.runtime.url;
  process.env.MAGSAG_MCP_SERVER_HOST = metadata.runtime.host;
  process.env.MAGSAG_MCP_SERVER_PORT = String(metadata.runtime.port);
  process.env.MAGSAG_MCP_SERVER_PATH = metadata.runtime.path;
  process.env.MCP_SERVER = metadata.runtime.url;

  if (metadata.tools?.length) {
    process.env.MAGSAG_MCP_TOOLS = metadata.tools.join(',');
  } else {
    delete process.env.MAGSAG_MCP_TOOLS;
  }

  return () => {
    for (const [key, value] of previousEntries) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
};
