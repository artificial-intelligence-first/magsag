import { once } from 'node:events';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable, Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import {
  InMemoryRunnerRegistry,
  type Runner,
  type RunnerEvent,
  type RunSpec,
  type RunnerMcpMetadata
} from '@magsag/core';
import { runnerEventSchema, runSpecSchema } from '@magsag/schema';
import { createAgentApp, attachAgentWebSocketServer } from '@magsag/server';
import { agentRunHandler, parseAgentRun } from '../../../packages/cli/src/commands/agent-run.ts';
import * as registryModule from '../../../packages/cli/src/registry.ts';

const TEST_ENGINE = 'codex-cli';

const collectStream = () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      callback();
    }
  });
  return { stream, chunks };
};

const createRunnerEvents = (): RunnerEvent[] => [
  { type: 'log', data: 'server: run accepted' },
  { type: 'message', role: 'assistant', content: 'server response ready' },
  {
    type: 'tool-call',
    call: {
      name: 'catalog.tool',
      arguments: { status: 'ok' }
    }
  },
  { type: 'done', sessionId: 'server-session', stats: { tokens: 42 } }
];

class TestEngineRunner implements Runner {
  constructor(
    private readonly onSpec: (spec: RunSpec) => void,
    private readonly eventsFactory: () => RunnerEvent[]
  ) {}

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const validated = runSpecSchema.parse(spec);
    this.onSpec(validated);
    for (const event of this.eventsFactory()) {
      yield event;
    }
  }
}

class SseParser {
  private buffer = '';

  feed(chunk: Buffer | string): RunnerEvent[] {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const events: RunnerEvent[] = [];
    while (true) {
      const boundary = this.buffer.indexOf('\n\n');
      if (boundary === -1) {
        break;
      }
      const raw = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const lines = raw.split(/\r?\n/).filter(Boolean);
      const dataLines = lines
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart());
      if (dataLines.length === 0) {
        continue;
      }
      const payloadText = dataLines.join('\n');
      const parsed = JSON.parse(payloadText) as unknown;
      const event = runnerEventSchema.parse(parsed);
      events.push(event);
    }
    return events;
  }
}

class ServerStreamingRunner implements Runner {
  constructor(
    private readonly baseUrl: string,
    private readonly mcp: RunnerMcpMetadata
  ) {}

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const payload: RunSpec = {
      ...spec,
      extra: {
        ...(spec.extra ?? {}),
        mcp: this.mcp
      }
    };
    const controller = new AbortController();
    const response = await fetch(`${this.baseUrl}/api/v1/agent/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      controller.abort();
      throw new Error(`Failed to stream from server (status ${response.status})`);
    }

    const stream = Readable.fromWeb(response.body);
    const parser = new SseParser();

    try {
      for await (const chunk of stream) {
        const events = parser.feed(chunk);
        for (const event of events) {
          yield event;
          if (event.type === 'done') {
            return;
          }
        }
      }
    } finally {
      controller.abort();
    }
  }
}

describe('CLI ↔ Runner ↔ Server integration', () => {
  const registry = new InMemoryRunnerRegistry();
  const recordedSpecs: RunSpec[] = [];
  let serverUrl: string;
  let httpCleanup: (() => Promise<void>) | undefined;
  let wssCleanup: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    registry.register({
      id: TEST_ENGINE,
      create: () => new TestEngineRunner((spec) => recordedSpecs.push(spec), createRunnerEvents)
    });

    const app = createAgentApp({ registry });
    const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        if (!req.url || !req.method) {
          res.statusCode = 400;
          res.end('Missing request metadata');
          return;
        }
        const origin =
          req.headers.host ??
          (typeof httpServer.address() === 'object' && httpServer.address()
            ? `127.0.0.1:${httpServer.address()?.port ?? 0}`
            : '127.0.0.1');
        const isStreamBody = !(req.method === 'GET' || req.method === 'HEAD');
        const init: RequestInit & { duplex?: 'half' } = {
          method: req.method,
          headers: req.headers as HeadersInit,
          body: isStreamBody ? Readable.toWeb(req) : undefined
        };
        if (isStreamBody) {
          init.duplex = 'half';
        }
        const request = new Request(new URL(req.url, `http://${origin}`), init);

        const response = await app.fetch(request);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });

        if (!response.body) {
          res.end();
          return;
        }

        const bodyStream = Readable.fromWeb(response.body);
        bodyStream.on('error', () => {
          res.destroy();
        });
        bodyStream.pipe(res);
      })().catch((error) => {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.message : String(error));
      });
    });

    httpServer.listen(0);
    await once(httpServer, 'listening');

    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to determine HTTP server address');
    }

    serverUrl = `http://127.0.0.1:${address.port}`;

    const wsServer = attachAgentWebSocketServer(httpServer, {
      registry
    });
    httpCleanup = async () =>
      new Promise((resolve) => httpServer.close(() => resolve(undefined)));
    wssCleanup = async () => {
      wsServer.clients.forEach((client) => client.terminate());
      await new Promise((resolve) => wsServer.close(() => resolve(undefined)));
    };
  });

  afterAll(async () => {
    if (wssCleanup) {
      await wssCleanup();
    }
    if (httpCleanup) {
      await httpCleanup();
    }
  });

  it('streams SSE responses through the CLI runner with MCP metadata', async () => {
    const cliRegistry = new InMemoryRunnerRegistry();
    const mcpMetadata: RunnerMcpMetadata = {
      runtime: {
        url: `${serverUrl}/mcp`,
        host: '127.0.0.1',
        port: Number(new URL(serverUrl).port),
        path: '/mcp'
      },
      tools: ['catalog.tool']
    };

    cliRegistry.register({
      id: TEST_ENGINE,
      create: () => new ServerStreamingRunner(serverUrl, mcpMetadata)
    });

    const registrySpy = vi
      .spyOn(registryModule, 'getDefaultRunnerRegistry')
      .mockReturnValue(cliRegistry);

    const stdout = collectStream();
    const stderr = collectStream();

    const parsed = await parseAgentRun(['--engine', TEST_ENGINE, 'Integration prompt']);
    const exitCode = await agentRunHandler(parsed, {
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    const stdoutText = stdout.chunks.join('');
    const stderrText = stderr.chunks.join('');
    expect(exitCode).toBe(0);
    expect(stdoutText).toContain('server response ready');
    expect(stderrText).toContain('server: run accepted');
    expect(stderrText).toContain('Run completed (session=server-session');

    const lastSpec = recordedSpecs.at(-1);
    expect(lastSpec?.extra?.mcp?.runtime.url).toBe(mcpMetadata.runtime.url);
    expect(lastSpec?.extra?.mcp?.tools).toStrictEqual(mcpMetadata.tools);

    registrySpy.mockRestore();
  });

  it('streams events over WebSocket clients', async () => {
    const ws = new WebSocket(`${serverUrl.replace('http', 'ws')}/api/v1/agent/run/ws`);
    await once(ws, 'open');

    const received: RunnerEvent[] = [];
    const streamComplete = new Promise<void>((resolve, reject) => {
      ws.on('message', (data) => {
        try {
          const text = typeof data === 'string' ? data : data.toString();
          const event = runnerEventSchema.parse(JSON.parse(text) as unknown);
          received.push(event);
          if (event.type === 'done') {
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      });
      ws.on('error', reject);
    });

    ws.send(
      JSON.stringify({
        engine: TEST_ENGINE,
        repo: process.cwd(),
        prompt: 'WebSocket prompt'
      })
    );

    await streamComplete;
    ws.close();

    expect(received.map((event) => event.type)).toStrictEqual([
      'log',
      'message',
      'tool-call',
      'done'
    ]);
    const wsSpec = recordedSpecs.at(-1);
    expect(wsSpec?.prompt).toBe('WebSocket prompt');
  });
});
