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
import { createOpenApiDocument } from './openapi.js';
import {
  BoundedSessionStore,
  InMemorySessionStore,
  type BoundedSessionStoreOptions,
  type SessionErrorPayload,
  type SessionStore
} from './session-store.js';
import {
  createCorsGuard,
  createCorsPreflightHandler,
  createRateLimitGuard,
  createRateLimiter,
  createSecurityRuntime,
  isOriginAllowed,
  type AgentSecurityOptions
} from './security.js';

type FlowSummaryLoader = (basePath?: string) => Promise<FlowSummary>;

export interface AgentObservabilityOptions {
  basePath?: string;
  emitFlowSummaryEvents?: boolean;
  enableFlowSummaryEndpoint?: boolean;
  loadSummary?: FlowSummaryLoader;
  logOnError?: boolean;
}

export type SessionBackend = 'bounded' | 'memory';

export interface AgentSessionOptions {
  store?: SessionStore;
  bounded?: BoundedSessionStoreOptions;
  backend?: SessionBackend;
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

const formatSessionErrorPayload = (error: unknown): SessionErrorPayload => {
  if (error && typeof error === 'object' && 'message' in error) {
    const payload = error as { message?: unknown; code?: unknown; details?: unknown };
    return {
      message: typeof payload.message === 'string' ? payload.message : String(payload.message ?? 'Unknown error'),
      code: typeof payload.code === 'string' ? payload.code : undefined,
      details:
        payload.details && typeof payload.details === 'object'
          ? (payload.details as Record<string, unknown>)
          : undefined
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  return { message: 'Unknown error' };
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
  sessions?: AgentSessionOptions;
  security?: AgentSecurityOptions;
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

const normalizeSessionBackend = (value?: SessionBackend | string | null): SessionBackend => {
  if (!value) {
    return 'bounded';
  }
  const normalized = value.toString().trim().toLowerCase();
  return normalized === 'memory' ? 'memory' : 'bounded';
};

export const resolveSessionStore = (
  options?: AgentSessionOptions,
  env: NodeJS.ProcessEnv = process.env
): SessionStore => {
  if (options?.store) {
    return options.store;
  }
  const backend = normalizeSessionBackend(options?.backend ?? env.MAGSAG_SESSION_BACKEND);
  if (backend === 'memory') {
    return new InMemorySessionStore();
  }
  return new BoundedSessionStore(options?.bounded);
};

export const createAgentApp = ({
  registry,
  defaultRunner,
  observability,
  sessions,
  security
}: AgentServerOptions) => {
  const app = new Hono();
  const observabilityRuntime = toObservabilityRuntime(observability);
  const emitFlowSummary = createFlowSummaryEmitter(observabilityRuntime);
  const sessionStore = resolveSessionStore(sessions);
  const openApiDocument = createOpenApiDocument();
  const securityRuntime = createSecurityRuntime(security);
  const corsGuard = createCorsGuard(securityRuntime.cors);
  const corsPreflight = createCorsPreflightHandler(securityRuntime.cors);
  const rateLimitGuard = createRateLimitGuard(securityRuntime.rateLimit);

  app.use('*', corsGuard);
  app.options('*', corsPreflight);

  app.get('/openapi.json', (c) => c.json(openApiDocument));

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

  app.get('/api/v1/sessions', async (c) => {
    const collection = await sessionStore.list();
    return c.json(collection);
  });

  app.get('/api/v1/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const record = await sessionStore.get(id);
    if (!record) {
      throw new HTTPException(404, {
        message: `Session not found: ${id}`
      });
    }
    return c.json(record);
  });

  app.delete('/api/v1/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const removed = await sessionStore.delete(id);
    if (!removed) {
      throw new HTTPException(404, {
        message: `Session not found: ${id}`
      });
    }
    return c.json({ id, status: 'deleted' });
  });

  app.post('/api/v1/agent/run', async (c) => {
    const limited = rateLimitGuard?.(c);
    if (limited) {
      return limited;
    }
    const spec = runSpecSchema.parse(await c.req.json<unknown>());
    const runner = ensureRunner(registry, spec, defaultRunner);
    const session = await sessionStore.create(spec, { id: spec.resumeId });
    let sessionId = session.id;
    const recordEvent = async (event: RunnerEvent) => {
      sessionId = await sessionStore.append(sessionId, event);
    };

    return streamSSE(c, async (stream) => {
      try {
        for await (const event of runner.run(spec)) {
          await recordEvent(event);
          await stream.writeSSE(mapEventToSse(event));
        }
        await sessionStore.markCompleted(sessionId);
      } catch (error) {
        await sessionStore.markFailed(sessionId, formatSessionErrorPayload(error));
        throw error;
      } finally {
        try {
          await emitFlowSummary(async (event) => {
            await recordEvent(event);
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
  {
    registry,
    defaultRunner,
    observability,
    security,
    path = defaultWebSocketPath
  }: AgentWebSocketOptions
) => {
  const wss = new WebSocketServer({ noServer: true });
  const observabilityRuntime = toObservabilityRuntime(observability);
  const emitFlowSummary = createFlowSummaryEmitter(observabilityRuntime);
  const securityRuntime = createSecurityRuntime(security);
  const rateLimiter = createRateLimiter(securityRuntime.rateLimit);

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

    const originHeader = request.headers.origin ?? request.headers['sec-websocket-origin'];
    if (!isOriginAllowed(securityRuntime.cors, typeof originHeader === 'string' ? originHeader : undefined)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    if (rateLimiter) {
      let remote = request.socket.remoteAddress ?? request.socket.remoteFamily ?? undefined;
      if (securityRuntime.rateLimit.trustForwardedHeaders) {
        const forwardedFor = Array.isArray(request.headers['x-forwarded-for'])
          ? request.headers['x-forwarded-for'][0]
          : request.headers['x-forwarded-for'];
        remote =
          forwardedFor?.split(',')[0]?.trim() ??
          (Array.isArray(request.headers['cf-connecting-ip'])
            ? request.headers['cf-connecting-ip'][0]
            : request.headers['cf-connecting-ip']) ??
          (Array.isArray(request.headers['x-real-ip'])
            ? request.headers['x-real-ip'][0]
            : request.headers['x-real-ip']) ??
          remote;
      }
      const result = rateLimiter.consume(remote ?? 'anonymous');
      if (!result.allowed) {
        const retryHeader =
          result.retryAfterSeconds > 0 ? `Retry-After: ${Math.max(1, result.retryAfterSeconds)}\r\n` : '';
        socket.write(`HTTP/1.1 429 Too Many Requests\r\n${retryHeader}\r\n`);
        socket.destroy();
        return;
      }
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  return wss;
};

export { BoundedSessionStore, InMemorySessionStore } from './session-store.js';
export type {
  BoundedSessionStoreOptions,
  SessionStore,
  SessionRecord,
  SessionSummary,
  SessionStatus
} from './session-store.js';
export { createOpenApiDocument } from './openapi.js';
