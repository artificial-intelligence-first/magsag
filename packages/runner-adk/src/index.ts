import type { Runner, RunnerEvent, RunSpec } from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

export interface GoogleAdkRunnerOptions {
  apiKey?: string;
  model?: string;
  appName?: string;
  userId?: string;
}

const loadAdk = async () =>
  (await import('@google/adk')) as typeof import('@google/adk');

const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_APP_NAME = 'magsag-adk';
const DEFAULT_USER_ID = 'default-user';

const textFromEvent = async (adk: typeof import('@google/adk'), event: unknown) => {
  try {
    if (!event || typeof event !== 'object') {
      return undefined;
    }
    return adk.stringifyContent(event as Parameters<typeof adk.stringifyContent>[0]);
  } catch {
    return undefined;
  }
};

const functionCallsFromEvent = (adk: typeof import('@google/adk'), event: unknown) => {
  try {
    if (!event || typeof event !== 'object') {
      return [];
    }
    return adk.getFunctionCalls(event as Parameters<typeof adk.getFunctionCalls>[0]) ?? [];
  } catch {
    return [];
  }
};

const isFinalResponse = (adk: typeof import('@google/adk'), event: unknown) => {
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

const toolCallEvents = (calls: Array<{ name?: unknown; args?: unknown }>): RunnerEvent[] => {
  const events: RunnerEvent[] = [];
  for (const call of calls) {
    if (typeof call !== 'object' || call === null) {
      continue;
    }
    const name = typeof call.name === 'string' ? call.name : 'anonymous_tool';
    const args =
      typeof call.args === 'object' && call.args !== null ? call.args : {};
    events.push({
      type: 'tool-call',
      call: {
        name,
        arguments: args as Record<string, unknown>
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

      const newMessage = {
        role: 'user',
        parts: [
          {
            text: validated.prompt
          }
        ]
      } as Parameters<typeof runner.runAsync>[0]['newMessage'];

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

        const text = await textFromEvent(adk, event);
        if (text && text.trim().length > 0) {
          yield {
            type: 'message',
            role: 'assistant',
            content: text
          };
        }

        const calls = toolCallEvents(functionCallsFromEvent(adk, event) as Array<{
          name?: unknown;
          args?: unknown;
        }>);
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
    }
  }
}

export const createGoogleAdkRunner = (
  options?: GoogleAdkRunnerOptions
): Runner => new GoogleAdkRunner(options);
