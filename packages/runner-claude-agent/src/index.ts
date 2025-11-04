import type { Runner, RunnerEvent, RunSpec, RunnerMcpMetadata } from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

export interface ClaudeAgentRunnerOptions {
  apiKey?: string;
  cwd?: string;
  model?: string;
  maxThinkingTokens?: number;
}

type ClaudeAgentSdk = typeof import('@anthropic-ai/claude-agent-sdk');

interface SdkMessage {
  type: string;
  [key: string]: unknown;
}

const loadClaudeAgentSdk = async (): Promise<ClaudeAgentSdk> =>
  import('@anthropic-ai/claude-agent-sdk');

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const extractAssistantContent = (message: unknown): string | undefined => {
  if (!message || typeof message !== 'object') {
    return undefined;
  }

  if ('content' in message) {
    const content = (message as { content: unknown }).content;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (!part || typeof part !== 'object') {
            return undefined;
          }
          if ('text' in part && typeof (part as { text: unknown }).text === 'string') {
            return (part as { text: string }).text;
          }
          if ('input_text' in part && typeof (part as { input_text: unknown }).input_text === 'string') {
            return (part as { input_text: string }).input_text;
          }
          return undefined;
        })
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join('\n');
    }
  }

  if ('result' in message && typeof (message as { result?: unknown }).result === 'string') {
    return (message as { result: string }).result;
  }

  return undefined;
};

const messageToRunnerEvents = (sdkMessage: SdkMessage): RunnerEvent[] => {
  switch (sdkMessage.type) {
    case 'assistant': {
      const content = extractAssistantContent(sdkMessage.message);
      if (content) {
        return [
          {
            type: 'message',
            role: 'assistant',
            content
          }
        ];
      }
      return [];
    }
    case 'result': {
      const events: RunnerEvent[] = [];
      const content = extractAssistantContent(sdkMessage);
      if (content) {
        events.push({ type: 'message', role: 'assistant', content });
      }
      const stats: Record<string, unknown> = {};
      if ('usage' in sdkMessage) {
        stats.usage = sdkMessage.usage;
      }
      if ('duration_ms' in sdkMessage) {
        stats.duration_ms = sdkMessage.duration_ms;
      }
      if ('num_turns' in sdkMessage) {
        stats.num_turns = sdkMessage.num_turns;
      }
      if ('total_cost_usd' in sdkMessage) {
        stats.total_cost_usd = sdkMessage.total_cost_usd;
      }
      if (sdkMessage.subtype && typeof sdkMessage.subtype === 'string') {
        stats.subtype = sdkMessage.subtype;
      }
      const isError = Boolean(sdkMessage.is_error);
      if (isError) {
        const errors = Array.isArray(sdkMessage.errors)
          ? sdkMessage.errors
          : typeof sdkMessage.result === 'string'
            ? [sdkMessage.result]
            : [];
        events.push({
          type: 'error',
          error: {
            message: errors.length > 0 ? errors.join('\n') : 'claude-agent run reported an error',
            details: {
              subtype: sdkMessage.subtype,
              errors
            }
          }
        });
      }
      events.push({ type: 'done', stats: Object.keys(stats).length > 0 ? stats : undefined });
      return events;
    }
    case 'stream_event': {
      const event = sdkMessage.event;
      if (event && typeof event === 'object' && 'delta' in event) {
        const delta = (event as { delta?: unknown }).delta;
        if (delta && typeof delta === 'object' && 'type' in delta && delta.type === 'text_delta') {
          const text = (delta as { text?: unknown }).text;
          if (typeof text === 'string' && text.length > 0) {
            return [
              {
                type: 'message',
                role: 'assistant',
                content: text
              }
            ];
          }
        }
      }
      return [];
    }
    case 'system': {
      const subtype = sdkMessage.subtype;
      const data = typeof subtype === 'string' ? `${sdkMessage.type}:${subtype}` : 'system';
      return [
        {
          type: 'log',
          data
        }
      ];
    }
    case 'tool_progress': {
      const progress = asNumber(sdkMessage.elapsed_time_seconds, 0);
      const toolName = asString(sdkMessage.tool_name, 'unknown');
      return [
        {
          type: 'log',
          data: `tool_progress:${toolName}:${progress}`
        }
      ];
    }
    case 'auth_status': {
      return [
        {
          type: 'log',
          data: Array.isArray(sdkMessage.output)
            ? sdkMessage.output.join('\n')
            : 'claude-agent authentication update'
        }
      ];
    }
    default:
      return [
        {
          type: 'log',
          data: `Unhandled claude-agent event: ${sdkMessage.type}`
        }
      ];
  }
};

export class ClaudeAgentRunner implements Runner {
  constructor(private readonly options: ClaudeAgentRunnerOptions = {}) {}

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const validated = runSpecSchema.parse(spec);
    const apiKey = this.options.apiKey ?? process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      yield {
        type: 'error',
        error: { message: 'ANTHROPIC_API_KEY is required for claude-agent runner' }
      };
      yield { type: 'done' };
      return;
    }

    const prev = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = apiKey;

    const restoreMcpEnvironment = applyMcpEnvironment(validated.extra?.mcp);

    try {
      const { query } = await loadClaudeAgentSdk();

      const options = {
        cwd: this.options.cwd ?? validated.repo,
        model: this.options.model,
        maxThinkingTokens: this.options.maxThinkingTokens,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: apiKey
        }
      } satisfies Parameters<typeof query>[0]['options'];

      const stream = query({ prompt: validated.prompt, options });

      let sawDone = false;

      for await (const message of stream as AsyncIterable<SdkMessage>) {
        const events = messageToRunnerEvents(message);
        for (const event of events) {
          if (event.type === 'done') {
            sawDone = true;
          }
          yield event;
        }
      }

      if (!sawDone) {
        yield { type: 'done' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'claude-agent run failed';
      yield {
        type: 'error',
        error: { message }
      };
      yield { type: 'done' };
    } finally {
      if (prev !== undefined) {
        process.env.ANTHROPIC_API_KEY = prev;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
      restoreMcpEnvironment();
    }
  }
}

export const createClaudeAgentRunner = (
  options?: ClaudeAgentRunnerOptions
): Runner => new ClaudeAgentRunner(options);

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
