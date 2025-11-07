import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionWorkspace } from '@magsag/core';
import type { RunSpec, RunnerEvent } from '@magsag/core';
import { createOpenAiAgentsRunner } from '../../src/index';

const agentConfigs: unknown[] = [];
const runnerConfigs: unknown[] = [];
const providerConfigs: Record<string, unknown>[] = [];
const runnerRunMock = vi.fn<
  Promise<{ finalOutput?: string; rawResponses?: unknown[] }>,
  [unknown, unknown, { context?: unknown }]
>();

vi.mock('@openai/agents', () => ({
  Agent: class {
    constructor(options: unknown) {
      agentConfigs.push(options);
    }
  },
  Runner: class {
    constructor(config: unknown) {
      runnerConfigs.push(config);
      this.run = runnerRunMock;
    }
  },
  OpenAIProvider: class {
    constructor(options: Record<string, unknown>) {
      providerConfigs.push(options);
    }
  }
}));

const workspaceFinalizeMock = vi.fn().mockResolvedValue(undefined);
const workspaceCreateSpy = vi.spyOn(ExecutionWorkspace, 'create');

const collect = async (iterator: AsyncIterable<RunnerEvent>): Promise<RunnerEvent[]> => {
  const events: RunnerEvent[] = [];
  for await (const event of iterator) {
    events.push(event);
  }
  return events;
};

beforeEach(() => {
  agentConfigs.length = 0;
  runnerConfigs.length = 0;
  providerConfigs.length = 0;
  runnerRunMock.mockReset();
  workspaceFinalizeMock.mockClear();
  workspaceFinalizeMock.mockResolvedValue(undefined);
  workspaceCreateSpy.mockImplementation(
    async (
      _config: unknown,
      logger?: (entry: { channel?: string; message: string }) => void
    ) => {
      logger?.({ channel: 'workspace', message: 'workspace ready' });
      return {
        environment: () => ({ MAGSAG_WORKSPACE_DIR: '/tmp/mock-workspace' }),
        finalize: workspaceFinalizeMock,
        path: '/tmp/mock-workspace'
      };
    }
  );
});

afterAll(() => {
  workspaceCreateSpy.mockRestore();
});

describe('OpenAiAgentsRunner', () => {
  it('injects per-run credentials without mutating process env', async () => {
    runnerRunMock.mockResolvedValue({ finalOutput: 'done' });
    process.env.OPENAI_API_KEY = 'global-key';

    const runner = createOpenAiAgentsRunner();
    const spec: RunSpec = {
      engine: 'openai-agents',
      repo: 'demo',
      prompt: 'Hello agents',
      extra: {
        env: {
          OPENAI_API_KEY: 'spec-key',
          OPENAI_BASE_URL: 'https://api.example.com'
        }
      }
    };

    const events = await collect(runner.run(spec));

    expect(providerConfigs).toEqual([
      expect.objectContaining({ apiKey: 'spec-key', baseURL: 'https://api.example.com' })
    ]);
    expect(runnerConfigs[0]).toMatchObject({
      modelProvider: expect.anything()
    });
    expect(runnerRunMock).toHaveBeenCalledWith(
      expect.anything(),
      spec.prompt,
      expect.objectContaining({
        context: expect.objectContaining({
          environment: expect.objectContaining({
            OPENAI_API_KEY: 'spec-key',
            OPENAI_BASE_URL: 'https://api.example.com'
          })
        })
      })
    );
    expect(process.env.OPENAI_API_KEY).toBe('global-key');
    expect(events.some((event) => event.type === 'message')).toBe(true);

    delete process.env.OPENAI_API_KEY;
  });

  it('prefers runner options over environment overrides', async () => {
    runnerRunMock.mockResolvedValue({ finalOutput: 'done' });
    const runner = createOpenAiAgentsRunner({
      apiKey: 'options-key',
      baseUrl: 'https://options.example.com',
      organization: 'org',
      project: 'proj',
      model: 'gpt-4.1-mini',
      instructions: 'from options'
    });

    const spec: RunSpec = {
      engine: 'openai-agents',
      repo: 'demo',
      prompt: 'Hello'
    };

    await collect(runner.run(spec));

    expect(providerConfigs).toEqual([
      {
        apiKey: 'options-key',
        baseURL: 'https://options.example.com',
        organization: 'org',
        project: 'proj'
      }
    ]);
    expect(agentConfigs[0]).toMatchObject({
      instructions: 'from options',
      model: 'gpt-4.1-mini'
    });
    expect(runnerConfigs[0]).toMatchObject({
      modelProvider: expect.anything(),
      model: 'gpt-4.1-mini'
    });
  });

  it('reports error when no API key is available', async () => {
    runnerRunMock.mockResolvedValue({ finalOutput: 'done' });
    delete process.env.OPENAI_API_KEY;
    const runner = createOpenAiAgentsRunner();

    const spec: RunSpec = {
      engine: 'openai-agents',
      repo: 'demo',
      prompt: 'Hello'
    };

    const events = await collect(runner.run(spec));

    expect(events[0]).toMatchObject({
      type: 'error',
      error: { message: expect.stringContaining('OPENAI_API_KEY') }
    });
    expect(providerConfigs).toHaveLength(0);
    expect(runnerRunMock).not.toHaveBeenCalled();
    expect(workspaceCreateSpy).not.toHaveBeenCalled();
  });
});
