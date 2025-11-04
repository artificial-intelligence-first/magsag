import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createLogger, type Logger } from '@magsag/shared-logging';
import { ToolRegistry } from './tool-registry.js';
import type {
  HttpServerAddress,
  McpHttpServerConfig,
  McpServerRuntimeOptions,
  ToolDefinition
} from './types.js';

const DEFAULT_HTTP_PATH = '/mcp';
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;
const MIN_CLEANUP_INTERVAL_MS = 5_000;
const DEFAULT_CLEANUP_INTERVAL_MS = 60_000;

interface Session {
  id?: string;
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  createdAt: number;
  lastAccessedAt: number;
  closed: boolean;
}

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const formatHostname = (host: string): string =>
  host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

export class McpServerRuntime {
  private readonly options: McpServerRuntimeOptions;
  private readonly toolRegistry = new ToolRegistry();
  private readonly logger: Logger;

  private started = false;
  private httpServer?: http.Server;
  private httpAddress?: HttpServerAddress;
  private readonly httpConfig?: McpHttpServerConfig;

  private readonly sessions = new Map<string, Session>();
  private readonly pendingSessions = new Set<Session>();
  private readonly sessionIdleTimeoutMs: number;
  private readonly cleanupIntervalMs: number;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: McpServerRuntimeOptions) {
    this.options = options;
    this.logger = options.logger ?? createLogger({ name: 'mcp-server', level: 'info' });
    this.httpConfig = options.http;

    const idleTimeout = options.session?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.sessionIdleTimeoutMs = idleTimeout > 0 ? idleTimeout : 0;

    const cleanupSource = options.session?.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;
    this.cleanupIntervalMs =
      this.sessionIdleTimeoutMs === 0
        ? 0
        : Math.max(MIN_CLEANUP_INTERVAL_MS, Math.min(cleanupSource, this.sessionIdleTimeoutMs));
  }

  registerTool(tool: ToolDefinition): void {
    this.toolRegistry.register(tool);

    for (const session of this.sessions.values()) {
      if (session.closed) {
        continue;
      }
      try {
        this.toolRegistry.applyTool(session.server, tool);
        session.server.sendToolListChanged();
      } catch (error) {
        this.logger.error('Failed to register tool on existing session', {
          tool: tool.name,
          error: formatError(error)
        });
      }
    }
  }

  listTools(): ToolDefinition[] {
    return this.toolRegistry.list();
  }

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('MCP server runtime already started');
    }

    if (!this.options.http) {
      throw new Error('HTTP transport is required for MCP server runtime');
    }

    await this.startHttpServer(this.options.http);

    if (this.cleanupIntervalMs > 0) {
      this.startCleanupTimer();
    }

    this.started = true;
    this.logger.info('MCP server runtime started', {
      address: this.httpAddress?.url.toString()
    });
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    const activeSessions = Array.from(this.sessions.keys());
    await Promise.allSettled(activeSessions.map((sessionId) => this.closeSession(sessionId)));

    for (const session of this.pendingSessions) {
      await this.shutdownSession(session);
    }
    this.pendingSessions.clear();

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer?.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }).catch((error) => {
        this.logger.error('Failed to close HTTP server', { error: formatError(error) });
      });
      this.httpServer = undefined;
      this.httpAddress = undefined;
    }

    this.logger.info('MCP server runtime stopped');
  }

  getHttpAddress(): HttpServerAddress | undefined {
    return this.httpAddress;
  }

  private startCleanupTimer(): void {
    if (this.cleanupIntervalMs === 0) {
      return;
    }
    this.cleanupTimer = setInterval(() => {
      this.evictIdleSessions().catch((error) => {
        this.logger.error('Failed to evict idle sessions', { error: formatError(error) });
      });
    }, this.cleanupIntervalMs);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  private async evictIdleSessions(): Promise<void> {
    if (this.sessionIdleTimeoutMs === 0) {
      return;
    }
    const cutoff = Date.now() - this.sessionIdleTimeoutMs;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastAccessedAt < cutoff) {
        this.logger.info('Closing idle MCP session', { sessionId });
        await this.closeSession(sessionId);
        await sleep(10); // yield back to event loop
      }
    }
  }

  private async startHttpServer(config: McpHttpServerConfig): Promise<void> {
    const host = config.host ?? '127.0.0.1';
    const path = config.path ?? DEFAULT_HTTP_PATH;

    this.httpServer = http.createServer(async (req, res) => {
      try {
        await this.handleHttpRequest(req, res, path);
      } catch (error) {
        this.logger.error('Unhandled MCP HTTP request error', { error: formatError(error) });
        this.writeJsonError(res, 500, 'Internal server error');
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer?.once('error', reject);
      this.httpServer?.listen(config.port, host, resolve);
    }).catch((error) => {
      this.logger.error('Failed to start HTTP server', { error: formatError(error) });
      throw error;
    });

    const addressInfo = this.httpServer.address();
    if (!addressInfo || typeof addressInfo === 'string') {
      throw new Error('Failed to resolve MCP HTTP server address');
    }

    const resolvedHost = config.host ?? addressInfo.address;
    const formattedHost = formatHostname(resolvedHost);
    const url = new URL(`http://${formattedHost}:${addressInfo.port}${path}`);
    this.httpAddress = {
      url,
      host: resolvedHost,
      port: addressInfo.port,
      path
    };
  }

  private async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    expectedPath: string
  ): Promise<void> {
    const path = this.extractPath(req);
    if (path !== expectedPath) {
      this.writeJsonError(res, 404, 'Not found');
      return;
    }

    const sessionIdHeader = this.getSessionId(req);
    if (req.method === 'POST') {
      const parsedBody = await this.readJsonBody(req, res);
      if (res.writableEnded) {
        return;
      }

      if (sessionIdHeader) {
        const session = this.sessions.get(sessionIdHeader);
        if (!session || session.closed) {
          this.writeJsonError(res, 404, 'Session not found', -32004);
          return;
        }
        session.lastAccessedAt = Date.now();
        await session.transport.handleRequest(req, res, parsedBody);
        return;
      }

      if (parsedBody === undefined || !isInitializeRequest(parsedBody)) {
        this.writeJsonError(res, 400, 'Initialization required', -32600);
        return;
      }

      const session = await this.createSession();
      await session.transport.handleRequest(req, res, parsedBody);
      return;
    }

    if (req.method === 'GET' || req.method === 'DELETE') {
      if (!sessionIdHeader) {
        this.writeJsonError(res, 400, 'Session ID missing', -32600);
        return;
      }
      const session = this.sessions.get(sessionIdHeader);
      if (!session || session.closed) {
        this.writeJsonError(res, 404, 'Session not found', -32004);
        return;
      }
      session.lastAccessedAt = Date.now();
      await session.transport.handleRequest(req, res);
      return;
    }

    this.writeJsonError(res, 405, 'Method not allowed', -32601);
  }

  private extractPath(req: IncomingMessage): string {
    try {
      const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
      return url.pathname;
    } catch {
      return '';
    }
  }

  private getSessionId(req: IncomingMessage): string | undefined {
    const header = req.headers['mcp-session-id'];
    if (typeof header === 'string') {
      return header;
    }
    if (Array.isArray(header)) {
      return header[0];
    }
    return undefined;
  }

  private async readJsonBody(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<unknown | undefined> {
    const chunks: Buffer[] = [];

    const body = await new Promise<Buffer>((resolve, reject) => {
      req.on('data', (chunk) => {
        if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk));
        } else if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        } else {
          chunks.push(Buffer.from(chunk));
        }
      });
      req.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      req.on('error', reject);
      req.on('aborted', () => reject(new Error('Request aborted')));
    }).catch((error) => {
      this.logger.error('Failed to read MCP HTTP body', { error: formatError(error) });
      this.writeJsonError(res, 400, 'Invalid request body', -32600);
      return undefined;
    });

    if (body === undefined) {
      return undefined;
    }

    if (body.length === 0) {
      return undefined;
    }

    try {
      return JSON.parse(body.toString('utf8')) as unknown;
    } catch (error) {
      this.logger.error('Failed to parse MCP HTTP body', { error: formatError(error) });
      this.writeJsonError(res, 400, 'Request body must be JSON', -32700);
      return undefined;
    }
  }

  private writeJsonError(
    res: ServerResponse,
    statusCode: number,
    message: string,
    code = -32000
  ): void {
    if (res.writableEnded) {
      return;
    }
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code,
        message
      },
      id: null
    });
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(payload);
  }

  private async createSession(): Promise<Session> {
    const server = new McpServer(this.options.implementation);
    this.toolRegistry.apply(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        session.id = sessionId;
        session.lastAccessedAt = Date.now();
        this.pendingSessions.delete(session);
        this.sessions.set(sessionId, session);
        this.logger.debug('Initialized MCP session', { sessionId });
      },
      onsessionclosed: async (sessionId) => {
        await this.closeSession(sessionId);
      },
      enableDnsRebindingProtection:
        this.httpConfig?.enableDnsRebindingProtection ?? false,
      allowedHosts: this.httpConfig?.allowedHosts,
      allowedOrigins: this.httpConfig?.allowedOrigins,
      enableJsonResponse: this.httpConfig?.enableJsonResponse ?? false
    });

    const session: Session = {
      server,
      transport,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      closed: false
    };

    this.pendingSessions.add(session);

    transport.onclose = () => {
      if (session.closed) {
        return;
      }
      session.closed = true;
      if (session.id) {
        this.sessions.delete(session.id);
      }
      this.pendingSessions.delete(session);
      session.server
        .close()
        .catch((error) =>
          this.logger.error('Failed to close MCP session server', {
            error: formatError(error),
            sessionId: session.id
          })
        );
    };

    transport.onerror = (error) => {
      this.logger.error('MCP transport error', {
        error: formatError(error),
        sessionId: session.id
      });
    };

    await server.connect(transport);
    return session;
  }

  private async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (session.closed) {
      this.sessions.delete(sessionId);
      return;
    }

    session.closed = true;
    this.sessions.delete(sessionId);
    await this.shutdownSession(session);
  }

  private async shutdownSession(session: Session): Promise<void> {
    this.pendingSessions.delete(session);

    try {
      await session.transport.close();
    } catch (error) {
      this.logger.error('Failed to close MCP transport', {
        error: formatError(error),
        sessionId: session.id
      });
    }

    try {
      await session.server.close();
    } catch (error) {
      this.logger.error('Failed to close MCP server connection', {
        error: formatError(error),
        sessionId: session.id
      });
    }
  }
}
