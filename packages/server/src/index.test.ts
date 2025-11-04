import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryRunnerRegistry,
  type Runner,
  type RunnerFactory,
  type RunnerRegistry,
  type RunSpec
} from '@magsag/core';
import type { RunnerEvent } from '@magsag/core';
import type { FlowSummary } from '@magsag/schema';
import { WebSocket } from 'ws';
import { HTTPException } from 'hono/http-exception';

import {
  attachAgentWebSocketServer,
  createAgentApp,
  ensureRunner,
  type AgentWebSocketOptions
} from './index.js';

const summaryFixture = (): FlowSummary => ({
  runs: 2,
  successes: 1,
  success_rate: 0.5,
  avg_latency_ms: 1200,
  errors: { total: 1, by_type: { timeout: 1 } },
  mcp: {
    calls: 2,
    errors: 1,
    tokens: { input: 10, output: 20, total: 30 },
    cost_usd: 0.25
  },
  steps: [
    {
      name: 'hello',
      runs: 2,
      successes: 1,
      errors: 1,
      success_rate: 0.5,
      avg_latency_ms: 900,
      mcp: { calls: 2, errors: 1 },
      models: ['gpt-4.1'],
      error_types: { timeout: 1 }
    }
  ],
  models: [
    {
      name: 'gpt-4.1',
      calls: 2,
      errors: 1,
      tokens: { input: 10, output: 20, total: 30 },
      cost_usd: 0.25
    }
  ]
});

const createStubRunnerFactory = (events: RunnerEvent[]): RunnerFactory => ({
  id: 'codex-cli',
  create: (): Runner => ({
    async *run() {
      for (const event of events) {
        yield event;
      }
    }
  })
});

const parseSseEvents = (payload: string): RunnerEvent[] =>
  payload
    .trim()
    .split('\n\n')
    .map((block) => {
      const dataLine = block
        .split('\n')
        .find((line) => line.startsWith('data:'));
      if (!dataLine) {
        return undefined;
      }
      const raw = dataLine.slice('data:'.length).trim();
      try {
        return JSON.parse(raw) as RunnerEvent;
      } catch {
        return undefined;
      }
    })
    .filter((event): event is RunnerEvent => Boolean(event));

class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  readonly sent: RunnerEvent[] = [];

  override on(event: string, listener: (...args: unknown[]) => void) {
    return super.on(event, listener);
  }

  send(payload: string) {
    this.sent.push(JSON.parse(payload) as RunnerEvent);
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }
}

describe('createAgentApp', () => {
  it('streams flow-summary after runner completion', async () => {
    const registry = new InMemoryRunnerRegistry();
    registry.register(
      createStubRunnerFactory([
        { type: 'log', data: 'start' },
        { type: 'done' }
      ])
    );
    const summary = summaryFixture();
    const loadSummary = vi.fn(async () => summary);

    const app = createAgentApp({
      registry,
      observability: {
        loadSummary
      }
    });

    const response = await app.request('/api/v1/agent/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engine: 'codex-cli',
        repo: '/tmp/repo',
        prompt: 'sse test'
      } satisfies RunSpec)
    });

    expect(response.status).toBe(200);
    const text = await response.text();
    const events = parseSseEvents(text);
    expect(events).not.toHaveLength(0);
    expect(loadSummary).toHaveBeenCalledTimes(1);
    const lastEvent = events.at(-1);
    expect(lastEvent?.type).toBe('flow-summary');
    if (!lastEvent || lastEvent.type !== 'flow-summary') {
      throw new Error('Expected flow-summary event');
    }
    expect(lastEvent.summary).toEqual(summary);
  });

  it('exposes flow summary via JSON endpoint', async () => {
    const registry = new InMemoryRunnerRegistry();
    registry.register(createStubRunnerFactory([]));
    const summary = summaryFixture();
    const app = createAgentApp({
      registry,
      observability: {
        loadSummary: async () => summary
      }
    });

    const response = await app.request('/api/v1/observability/flow-summary');
    expect(response.status).toBe(200);
    const json = (await response.json()) as FlowSummary;
    expect(json).toEqual(summary);
  });
});

describe('attachAgentWebSocketServer', () => {
  const createOptions = (override?: Partial<AgentWebSocketOptions>): AgentWebSocketOptions => {
    const registry = new InMemoryRunnerRegistry();
    registry.register(
      createStubRunnerFactory([
        { type: 'log', data: 'start' },
        { type: 'done' }
      ])
    );
    return {
      registry,
      observability: {
        loadSummary: async () => summaryFixture()
      },
      ...override
    };
  };

  it('sends flow-summary events over WebSocket', async () => {
    const fakeServer = new EventEmitter();
    const options = createOptions();
    const wss = attachAgentWebSocketServer(
      fakeServer as unknown as Parameters<typeof attachAgentWebSocketServer>[0],
      options
    );

    const socket = new FakeSocket();
    wss.emit('connection', socket as unknown as WebSocket);

    const handlers = socket.listeners('message');
    expect(handlers).toHaveLength(1);
    const handler = handlers[0] as (data: unknown) => void;
    handler(
      Buffer.from(
        JSON.stringify({
          engine: 'codex-cli',
          repo: '/tmp/repo',
          prompt: 'ws test'
        } satisfies RunSpec)
      )
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    const summaryEvent = socket.sent.find(
      (event): event is Extract<RunnerEvent, { type: 'flow-summary' }> => event.type === 'flow-summary'
    );
    expect(summaryEvent?.summary).toEqual(summaryFixture());
    wss.close();
  });
});

describe('ensureRunner', () => {
  const spec: RunSpec = {
    engine: 'codex-cli',
    repo: '/tmp/repo',
    prompt: 'fallback test'
  };

  it('uses fallback runner when registry is missing an engine', () => {
    const runner: Runner = {
      async *run() {
        yield { type: 'done' };
      }
    };
    const registry: RunnerRegistry = {
      register: vi.fn(),
      get: vi.fn(() => undefined),
      list: vi.fn(() => [])
    };

    const resolved = ensureRunner(registry, spec, runner);
    expect(resolved).toBe(runner);
  });

  it('throws HTTPException when runner is missing and no fallback provided', () => {
    const registry: RunnerRegistry = {
      register: vi.fn(),
      get: vi.fn(() => undefined),
      list: vi.fn(() => [])
    };

    expect(() => ensureRunner(registry, spec)).toThrow(HTTPException);
  });
});
