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
  resolveSessionStore,
  BoundedSessionStore,
  InMemorySessionStore,
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

  it('records sessions and exposes REST endpoints', async () => {
    const registry = new InMemoryRunnerRegistry();
    registry.register(
      createStubRunnerFactory([
        { type: 'log', data: 'start' },
        { type: 'done', sessionId: 'session-123' }
      ])
    );
    const store = new InMemorySessionStore();
    const summary = summaryFixture();
    const app = createAgentApp({
      registry,
      sessions: { store },
      observability: {
        loadSummary: async () => summary
      }
    });

    const response = await app.request('/api/v1/agent/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engine: 'codex-cli',
        repo: '/tmp/repo',
        prompt: 'session test'
      } satisfies RunSpec)
    });
    expect(response.status).toBe(200);
    await response.text();

    const sessionsResponse = await app.request('/api/v1/sessions');
    expect(sessionsResponse.status).toBe(200);
    const sessionsJson = (await sessionsResponse.json()) as Array<Record<string, unknown>>;
    expect(sessionsJson).toHaveLength(1);
    const sessionId = String(sessionsJson[0]?.id ?? '');
    expect(sessionId).toBe('session-123');
    expect(sessionsJson[0]?.status).toBe('completed');
    expect(sessionsJson[0]?.lastEventType).toBe('flow-summary');

    const detailResponse = await app.request(`/api/v1/sessions/${sessionId}`);
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as { events: RunnerEvent[] };
    expect(Array.isArray(detail.events)).toBe(true);
    expect(detail.events.at(-1)?.type).toBe('flow-summary');

    const deleteResponse = await app.request(`/api/v1/sessions/${sessionId}`, {
      method: 'DELETE'
    });
    expect(deleteResponse.status).toBe(200);
    const missingResponse = await app.request(`/api/v1/sessions/${sessionId}`);
    expect(missingResponse.status).toBe(404);
  });

  it('returns the OpenAPI document', async () => {
    const app = createAgentApp({
      registry: new InMemoryRunnerRegistry()
    });
    const response = await app.request('/openapi.json');
    expect(response.status).toBe(200);
    const document = (await response.json()) as { paths?: Record<string, unknown> };
    expect(document.paths).toBeDefined();
    expect(document.paths).toHaveProperty('/api/v1/sessions');
    expect(document.paths).toHaveProperty('/openapi.json');
  });

  it('enforces configured rate limits when exceeded', async () => {
    const registry = new InMemoryRunnerRegistry();
    registry.register(
      createStubRunnerFactory([
        { type: 'log', data: 'start' },
        { type: 'done' }
      ])
    );
    const app = createAgentApp({
      registry,
      security: {
        rateLimit: {
          enabled: true,
          requestsPerSecond: 1,
          burst: 1
        }
      }
    });

    const firstResponse = await app.request('/api/v1/agent/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engine: 'codex-cli',
        repo: '/tmp/repo',
        prompt: 'rate-limit-1'
      } satisfies RunSpec)
    });
    expect(firstResponse.status).toBe(200);
    await firstResponse.text();

    const secondResponse = await app.request('/api/v1/agent/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        engine: 'codex-cli',
        repo: '/tmp/repo',
        prompt: 'rate-limit-2'
      } satisfies RunSpec)
    });
    expect(secondResponse.status).toBe(429);
    const payload = (await secondResponse.json()) as { error?: { message?: string } };
    expect(payload?.error?.message).toContain('Rate limit exceeded');
  });

  it('applies CORS allowlists and blocks untrusted origins', async () => {
    const registry = new InMemoryRunnerRegistry();
    registry.register(createStubRunnerFactory([]));
    const trustedOrigin = 'https://trusted.example.com';
    const app = createAgentApp({
      registry,
      security: {
        cors: {
          allowedOrigins: [trustedOrigin]
        }
      }
    });

    const allowedResponse = await app.request('/openapi.json', {
      headers: { origin: trustedOrigin }
    });
    expect(allowedResponse.status).toBe(200);
    expect(allowedResponse.headers.get('access-control-allow-origin')).toBe(trustedOrigin);

    const blockedResponse = await app.request('/openapi.json', {
      headers: { origin: 'https://malicious.example.com' }
    });
    expect(blockedResponse.status).toBe(403);
  });

  it('responds to preflight requests with configured headers', async () => {
    const registry = new InMemoryRunnerRegistry();
    registry.register(createStubRunnerFactory([]));
    const origin = 'https://trusted.example.com';
    const app = createAgentApp({
      registry,
      security: {
        cors: {
          allowedOrigins: [origin],
          allowHeaders: ['content-type'],
          allowMethods: ['POST', 'OPTIONS']
        }
      }
    });

    const response = await app.request('/api/v1/agent/run', {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-headers': 'content-type',
        'access-control-request-method': 'POST'
      }
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });

  it('allows any origin when CORS guard is disabled', async () => {
    const registry = new InMemoryRunnerRegistry();
    registry.register(createStubRunnerFactory([]));
    const app = createAgentApp({
      registry,
      security: {
        cors: {
          enabled: false
        }
      }
    });

    const response = await app.request('/openapi.json', {
      headers: { origin: 'https://any.example.com' }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('resolveSessionStore', () => {
  it('returns provided store when supplied', () => {
    const customStore = new InMemorySessionStore();
    const resolved = resolveSessionStore({ store: customStore });
    expect(resolved).toBe(customStore);
  });

  it('falls back to bounded store by default', () => {
    const resolved = resolveSessionStore();
    expect(resolved).toBeInstanceOf(BoundedSessionStore);
  });

  it('honours MAGSAG_SESSION_BACKEND=memory', () => {
    const resolved = resolveSessionStore(undefined, {
      MAGSAG_SESSION_BACKEND: 'memory'
    } as NodeJS.ProcessEnv);
    expect(resolved).toBeInstanceOf(InMemorySessionStore);
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
