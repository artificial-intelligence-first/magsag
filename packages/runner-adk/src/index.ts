import type { Runner, RunnerEvent, RunSpec, RunnerMcpMetadata } from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

export interface GoogleAdkRunnerOptions {
  apiKey?: string;
  model?: string;
  appName?: string;
  userId?: string;
}

type GoogleAdkSdk = typeof import('@google/adk');

const loadAdk = async (): Promise<GoogleAdkSdk> => import('@google/adk');

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_APP_NAME = 'magsag-adk';
const DEFAULT_USER_ID = 'default-user';

const textFromEvent = (adk: GoogleAdkSdk, event: unknown): string | undefined => {
  try {
    if (!event || typeof event !== 'object') {
      return undefined;
    }
    return adk.stringifyContent(event as Parameters<typeof adk.stringifyContent>[0]);
  } catch {
    return undefined;
  }
};

const functionCallsFromEvent = (adk: GoogleAdkSdk, event: unknown): { name?: unknown; args?: unknown }[] => {
  try {
    if (!event || typeof event !== 'object') {
      return [];
    }
    const calls = adk.getFunctionCalls(event as Parameters<typeof adk.getFunctionCalls>[0]);
    return Array.isArray(calls) ? calls : [];
  } catch {
    return [];
  }
};

const isFinalResponse = (adk: GoogleAdkSdk, event: unknown): boolean => {
  try {
    if (!event || typeof event !== 'object') {
      return false;
    }
    return adk.isFinalResponse(event as Parameters<typeof adk.isFinalResponse>[0]);
  } catch {
    return false;
  }
};

const authorOfEvent = (event: unknown): string | undefined => {
  if (!event || typeof event !== 'object') {
    return undefined;
  }
  const candidate = (event as { author?: unknown }).author;
  return typeof candidate === 'string' ? candidate : undefined;
};

const eventTimestamp = (event: unknown): number | undefined => {
  if (!event || typeof event !== 'object') {
    return undefined;
  }
  const value = (event as { timestamp?: unknown }).timestamp;
  return typeof value === 'number' ? value : undefined;
};

const eventActions = (event: unknown): unknown =>
  event && typeof event === 'object' ? (event as { actions?: unknown }).actions : undefined;

const toRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const toolCallEvents = (calls: { name?: unknown; args?: unknown }[]): RunnerEvent[] => {
  const events: RunnerEvent[] = [];
  for (const call of calls) {
    const name = typeof call.name === 'string' ? call.name : 'anonymous_tool';
    events.push({
      type: 'tool-call',
      call: {
        name,
        arguments: toRecord(call.args)
      }
    });
  }
  return events;
};

export class GoogleAdkRunner implements Runner {
  constructor(private readonly options: GoogleAdkRunnerOptions = {}) {}

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const validated = runSpecSchema.parse(spec);

    const apiKey = this.options.apiKey ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      yield {
        type: 'error',
        error: { message: 'GOOGLE_API_KEY is required for adk runner' }
      };
      yield { type: 'done' };
      return;
    }

    const prev = process.env.GOOGLE_API_KEY;
    process.env.GOOGLE_API_KEY = apiKey;

    const extraEnv = validated.extra?.env ?? {};
    const previousEnvEntries = new Map<string, string | undefined>();
    for (const [key, value] of Object.entries(extraEnv)) {
      previousEnvEntries.set(key, process.env[key]);
      process.env[key] = value;
    }

    const restoreMcpEnvironment = applyMcpEnvironment(validated.extra?.mcp);

    const appName = this.options.appName ?? DEFAULT_APP_NAME;
    const userId = this.options.userId ?? DEFAULT_USER_ID;
    const sessionId = `${appName}-${Date.now()}`;

    try {
      const adk = await loadAdk();

      const agent = new adk.LlmAgent({
        name: 'magsag_adk_agent',
        description: 'MAG/SAG execution via Google ADK',
        instruction: validated.prompt,
        model: this.options.model ?? DEFAULT_MODEL
      });

      const sessionService = new adk.InMemorySessionService();
      await sessionService.createSession({
        appName,
        userId,
        sessionId,
        state: {}
      });

      const runner = new adk.Runner({
        appName,
        agent,
        sessionService
      });

      const newMessage: Parameters<typeof runner.runAsync>[0]['newMessage'] = {
        role: 'user',
        parts: [
          {
            text: validated.prompt
          }
        ]
      };

      const events = runner.runAsync({
        userId,
        sessionId,
        newMessage,
        runConfig: {
          streamingMode: adk.StreamingMode.NONE
        }
      });

      let sawDone = false;

      for await (const event of events) {
        if (authorOfEvent(event) === 'user') {
          continue;
        }

        const text = textFromEvent(adk, event);
        if (text && text.trim().length > 0) {
          yield {
            type: 'message',
            role: 'assistant',
            content: text
          };
        }

        const calls = toolCallEvents(functionCallsFromEvent(adk, event));
        for (const call of calls) {
          yield call;
        }

        if (isFinalResponse(adk, event)) {
          sawDone = true;
          yield {
            type: 'done',
            stats: {
              author: authorOfEvent(event),
              timestamp: eventTimestamp(event),
              actions: eventActions(event)
            }
          };
        }
      }

      if (!sawDone) {
        yield { type: 'done' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'adk runner failed';
      yield {
        type: 'error',
        error: { message }
      };
      yield { type: 'done' };
    } finally {
      if (prev !== undefined) {
        process.env.GOOGLE_API_KEY = prev;
      } else {
        delete process.env.GOOGLE_API_KEY;
      }
      for (const [key, previousValue] of previousEnvEntries.entries()) {
        if (previousValue !== undefined) {
          process.env[key] = previousValue;
        } else {
          delete process.env[key];
        }
      }
      restoreMcpEnvironment();
    }
  }
}

export const createGoogleAdkRunner = (
  options?: GoogleAdkRunnerOptions
): Runner => new GoogleAdkRunner(options);

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
