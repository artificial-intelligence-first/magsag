import { afterEach, describe, expect, test, vi } from 'vitest';
import type { RunnerEvent } from '@magsag/core';
import { OpenAiAgentsRunner } from '@magsag/runner-openai-agents';

const runSpy = vi.fn<
  [
    unknown,
    string,
    {
      context?: {
        environment?: Record<string, string>;
      };
    } | undefined
  ],
  Promise<unknown>
>();

const agentConfigs: Array<{ name: string; instructions?: string; model?: string }> = [];
const providerConfigs: Array<Record<string, unknown>> = [];
const runnerConfigs: Array<Record<string, unknown>> = [];

const createModuleLoader = () => async () => {
  class Agent {
    constructor(options: { name: string; instructions?: string; model?: string }) {
      agentConfigs.push(options);
    }
  }

  class Runner {
    constructor(options: Record<string, unknown> = {}) {
      runnerConfigs.push(options);
    }

    async run(
      agent: unknown,
      input: string,
      options?: {
        context?: { environment?: Record<string, string> };
      }
    ): Promise<unknown> {
      return runSpy(agent, input, options);
    }
  }

  class OpenAIProvider {
    constructor(options: Record<string, unknown>) {
      providerConfigs.push(options);
    }
  }

  return { Agent, Runner, OpenAIProvider };
};

const collectEvents = async (iterable: AsyncIterable<RunnerEvent>): Promise<RunnerEvent[]> => {
  const events: RunnerEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
};

afterEach(() => {
  runSpy.mockReset();
  agentConfigs.length = 0;
  providerConfigs.length = 0;
  runnerConfigs.length = 0;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_API_BASE;
  delete process.env.OPENAI_ORGANIZATION;
  delete process.env.OPENAI_PROJECT;
});

describe('OpenAiAgentsRunner', () => {
  test('emits error when no API key is provided', async () => {
    const runner = new OpenAiAgentsRunner();
    const events = await collectEvents(
      runner.run({
        engine: 'openai-agents',
        repo: '/tmp/repo',
        prompt: 'Hello'
      })
    );

    expect(events).toEqual([
      {
        type: 'error',
        error: { message: 'OPENAI_API_KEY is required for openai-agents runner' }
      },
      { type: 'done' }
    ]);
    expect(runSpy).not.toHaveBeenCalled();
  });

  test('invokes OpenAI Agents SDK with resolved credentials and emits output', async () => {
    runSpy.mockImplementation(async () => ({
      finalOutput: 'Completed',
      stats: { tokens: 512 }
    }));

    const runner = new OpenAiAgentsRunner({
      instructions: 'Follow spec exactly.',
      model: 'gpt-4.1',
      moduleLoader: createModuleLoader()
    });

    const events = await collectEvents(
      runner.run({
        engine: 'openai-agents',
        repo: '/tmp/repo',
        prompt: 'Execute plan',
        extra: {
          env: {
            OPENAI_API_KEY: 'from-extra',
            OPENAI_BASE_URL: 'https://example.test/v1',
            OPENAI_ORGANIZATION: 'org',
            OPENAI_PROJECT: 'proj',
            IGNORED: 'value'
          }
        }
      })
    );

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'message',
          role: 'assistant',
          content: 'Completed'
        })
      ])
    );
    const doneEvent = events.find((event) => event.type === 'done');
    expect(doneEvent).toBeDefined();

    expect(runSpy).toHaveBeenCalledWith(
      expect.anything(),
      'Execute plan',
      expect.objectContaining({
        context: {
          environment: expect.objectContaining({
            OPENAI_API_KEY: 'from-extra',
            OPENAI_BASE_URL: 'https://example.test/v1',
            OPENAI_ORGANIZATION: 'org',
            OPENAI_PROJECT: 'proj'
          })
        }
      })
    );

    expect(runSpy).toHaveBeenCalled();
    expect(providerConfigs.at(-1)).toEqual(
      expect.objectContaining({
        apiKey: 'from-extra',
        baseURL: 'https://example.test/v1',
        organization: 'org',
        project: 'proj'
      })
    );

    expect(agentConfigs.at(-1)).toEqual(
      expect.objectContaining({
        name: 'MAGSAG Runner',
        instructions: 'Follow spec exactly.',
        model: 'gpt-4.1'
      })
    );
    expect(runnerConfigs.at(-1)).toEqual(
      expect.objectContaining({
        model: 'gpt-4.1',
        modelProvider: expect.any(Object)
      })
    );
  });
});
