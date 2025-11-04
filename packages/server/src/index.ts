import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { Runner, RunnerEvent, RunnerRegistry, RunSpec } from '@magsag/core';
import { runSpecSchema, runnerEventSchema } from '@magsag/schema';
import { summarizeFlowRuns } from '@magsag/observability';
import type { FlowSummary } from '@magsag/schema';
import { HTTPException } from 'hono/http-exception';
import type { Server as HttpServer } from 'http';
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { WebSocketServer, type RawData, WebSocket } from 'ws';

type FlowSummaryLoader = (basePath?: string) => Promise<FlowSummary>;

export interface AgentObservabilityOptions {
  basePath?: string;
  emitFlowSummaryEvents?: boolean;
  enableFlowSummaryEndpoint?: boolean;
  loadSummary?: FlowSummaryLoader;
  logOnError?: boolean;
}

interface ObservabilityRuntime {
  basePath: string;
  emitFlowSummaryEvents: boolean;
  enableFlowSummaryEndpoint: boolean;
  loadSummary: FlowSummaryLoader;
  logOnError: boolean;
}

const formatSummaryError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
};

const toObservabilityRuntime = (options?: AgentObservabilityOptions): ObservabilityRuntime => ({
  basePath: options?.basePath ?? '.runs',
  emitFlowSummaryEvents: options?.emitFlowSummaryEvents ?? true,
  enableFlowSummaryEndpoint: options?.enableFlowSummaryEndpoint ?? true,
  loadSummary: options?.loadSummary ?? summarizeFlowRuns,
  logOnError: options?.logOnError ?? true
});

const createFlowSummaryEmitter =
  (runtime: ObservabilityRuntime) =>
  async (send: (event: RunnerEvent) => void | Promise<void>): Promise<void> => {
    if (!runtime.emitFlowSummaryEvents) {
      return;
    }
    try {
      const summary = await runtime.loadSummary(runtime.basePath);
      await Promise.resolve(send({ type: 'flow-summary', summary }));
    } catch (error) {
      if (!runtime.logOnError) {
        return;
      }
      const message = formatSummaryError(error);
      await Promise.resolve(send({ type: 'log', data: `Failed to load flow summary: ${message}` }));
    }
  };

export interface AgentServerOptions {
  registry: RunnerRegistry;
  defaultRunner?: Runner;
  observability?: AgentObservabilityOptions;
}

const serializeEvent = (event: RunnerEvent): string => JSON.stringify(event);

export const ensureRunner = (
  registry: RunnerRegistry,
  spec: RunSpec,
  fallback?: Runner
): Runner => {
  const factory = registry.get(spec.engine);
  if (factory) {
    return factory.create();
  }
  if (fallback) {
    return fallback;
  }
  throw new HTTPException(400, {
    message: `Runner not registered for engine: ${spec.engine}`
  });
};

const mapEventToSse = (event: RunnerEvent): { event: string; data: string } => ({
  event: event.type,
  data: serializeEvent(event)
});

export const createAgentApp = ({
  registry,
  defaultRunner,
  observability
}: AgentServerOptions) => {
  const app = new Hono();
  const observabilityRuntime = toObservabilityRuntime(observability);
  const emitFlowSummary = createFlowSummaryEmitter(observabilityRuntime);

  if (observabilityRuntime.enableFlowSummaryEndpoint) {
    app.get('/api/v1/observability/flow-summary', async (c) => {
      try {
        const summary = await observabilityRuntime.loadSummary(observabilityRuntime.basePath);
        return c.json(summary);
      } catch (error) {
        const message = formatSummaryError(error);
        throw new HTTPException(500, {
          message: `Failed to load flow summary: ${message}`
        });
      }
    });
  }

  app.post('/api/v1/agent/run', async (c) => {
    const spec = runSpecSchema.parse(await c.req.json<unknown>());
    const runner = ensureRunner(registry, spec, defaultRunner);

    return streamSSE(c, async (stream) => {
      try {
        for await (const event of runner.run(spec)) {
          await stream.writeSSE(mapEventToSse(event));
        }
      } finally {
        try {
          await emitFlowSummary(async (event) => {
            await stream.writeSSE(mapEventToSse(event));
          });
        } catch {
          // Connection closed before summary delivery; ignore.
        }
      }
    });
  });

  app.get('/api/v1/health', (c) => c.json({ status: 'ok' }));

  return app;
};

export type AgentApp = ReturnType<typeof createAgentApp>;

export const validateRunnerEvent = (event: RunnerEvent) => runnerEventSchema.parse(event);

const isWebSocketOpen = (socket: WebSocket): boolean => socket.readyState === WebSocket.OPEN;

const decodeRawData = (raw: RawData): string => {
  if (typeof raw === 'string') {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return Buffer.from(raw).toString('utf8');
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }
  return raw.toString('utf8');
};

const parseRunSpecMessage = (raw: RawData): RunSpec => {
  const text = decodeRawData(raw);
  const payload: unknown = JSON.parse(text) as unknown;
  return runSpecSchema.parse(payload);
};

const sendRunnerEvent = (socket: WebSocket, event: RunnerEvent) => {
  if (!isWebSocketOpen(socket)) {
    return;
  }
  socket.send(serializeEvent(event));
};

const sendErrorEvent = (socket: WebSocket, error: unknown) => {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  const details =
    error && typeof error === 'object' && !(error instanceof Error)
      ? (error as Record<string, unknown>)
      : undefined;
  sendRunnerEvent(socket, {
    type: 'error',
    error: {
      message,
      details
    }
  });
};

const defaultWebSocketPath = '/api/v1/agent/run/ws';

export interface AgentWebSocketOptions extends AgentServerOptions {
  path?: string;
}

export const attachAgentWebSocketServer = (
  httpServer: HttpServer,
  { registry, defaultRunner, observability, path = defaultWebSocketPath }: AgentWebSocketOptions
) => {
  const wss = new WebSocketServer({ noServer: true });
  const observabilityRuntime = toObservabilityRuntime(observability);
  const emitFlowSummary = createFlowSummaryEmitter(observabilityRuntime);

  const handleMessage = async (socket: WebSocket, data: RawData) => {
    let spec: RunSpec;
    try {
      spec = parseRunSpecMessage(data);
    } catch (error) {
      sendErrorEvent(socket, error);
      return;
    }

    let runner: Runner;
    try {
      runner = ensureRunner(registry, spec, defaultRunner);
    } catch (error) {
      sendErrorEvent(socket, error);
      return;
    }

    try {
      for await (const event of runner.run(spec)) {
        if (!isWebSocketOpen(socket)) {
          break;
        }
        sendRunnerEvent(socket, event);
      }
      try {
        await emitFlowSummary((event) => sendRunnerEvent(socket, event));
      } catch {
        // Ignore summary delivery errors for closed sockets
      }
    } catch (error) {
      sendErrorEvent(socket, error);
    }
  };

  wss.on('connection', (socket) => {
    socket.on('message', (data) => {
      // Fire and forget; streaming handled via async iterator
      void handleMessage(socket, data);
    });

    socket.on('error', (error) => {
      sendErrorEvent(socket, error);
    });
  });

  const isHandledPath = (request: IncomingMessage) => {
    if (!request.url) {
      return false;
    }
    try {
      const fullUrl = new URL(request.url, 'http://localhost');
      return fullUrl.pathname === path;
    } catch {
      return false;
    }
  };

  httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head) => {
    if (!isHandledPath(request)) {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  return wss;
};
