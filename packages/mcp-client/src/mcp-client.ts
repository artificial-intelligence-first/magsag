import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ClientOptions } from '@modelcontextprotocol/sdk/client/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolResultSchema,
  ErrorCode,
  McpError,
  type CallToolResult,
  type Implementation,
  type ListToolsResult
} from '@modelcontextprotocol/sdk/types.js';
import { CircuitBreaker } from './circuit-breaker.js';
import {
  McpCircuitOpenError,
  McpClientError,
  McpTimeoutError,
  McpTransportError
} from './errors.js';
import { createTransport } from './transports.js';
import {
  DEFAULT_RETRY_CONFIG,
  type InvokeOptions,
  type McpClientOptions,
  type RetryConfig,
  type TransportConfig
} from './types.js';

const DEFAULT_CLIENT_INFO: Implementation = {
  name: 'magsag-client',
  version: '2.0.0-alpha.0'
};

const DEFAULT_TIMEOUT_MS = 30_000;

interface McpClientDependencies {
  createClient?: (info: Implementation, options?: ClientOptions) => Client;
  createTransport?: (config: TransportConfig) => Transport;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  clientOptions?: ClientOptions;
}

const defaultDependencies: Required<Omit<McpClientDependencies, 'clientOptions'>> = {
  createClient: (info, options) => new Client(info, options),
  createTransport,
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    }),
  random: () => Math.random()
};

export class McpClient {
  private readonly options: McpClientOptions;
  private readonly retryConfig: RetryConfig;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly dependencies: Required<Omit<McpClientDependencies, 'clientOptions'>>;
  private readonly clientOptions?: ClientOptions;
  private readonly requestTimeoutMs: number;

  private client: Client | null = null;
  private toolsResult: ListToolsResult | null = null;
  private initializing: Promise<void> | null = null;
  private closed = false;

  constructor(options: McpClientOptions, dependencies: McpClientDependencies = {}) {
    this.options = options;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options.retry };
    this.circuitBreaker = new CircuitBreaker(options.circuitBreaker);
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;

    this.clientOptions = dependencies.clientOptions;
    this.dependencies = {
      createClient: dependencies.createClient ?? defaultDependencies.createClient,
      createTransport: dependencies.createTransport ?? defaultDependencies.createTransport,
      now: dependencies.now ?? defaultDependencies.now,
      sleep: dependencies.sleep ?? defaultDependencies.sleep,
      random: dependencies.random ?? defaultDependencies.random
    };
  }

  async initialize(): Promise<void> {
    if (this.closed) {
      throw new McpClientError('MCP client has been closed');
    }
    if (this.client) {
      return;
    }
    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = this.start();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  async close(): Promise<void> {
    this.closed = true;

    if (this.initializing) {
      try {
        await this.initializing;
      } catch {
        // Ignore initialization errors during shutdown.
      } finally {
        this.initializing = null;
      }
    }

    if (this.client) {
      try {
        await this.client.close();
      } finally {
        this.client = null;
        this.toolsResult = null;
      }
    }
  }

  getCircuitState(): ReturnType<CircuitBreaker['getState']> {
    return this.circuitBreaker.getState();
  }

  resetCircuit(): void {
    this.circuitBreaker.reset();
  }

  async listTools(options: { refresh?: boolean } = {}): Promise<ListToolsResult> {
    await this.initialize();
    if (!this.client) {
      throw new McpClientError('MCP client is not initialized');
    }

    if (options.refresh) {
      const result = await this.client.listTools({});
      this.toolsResult = result;
    }

    if (!this.toolsResult) {
      const result = await this.client.listTools({});
      this.toolsResult = result;
    }

    return {
      ...this.toolsResult,
      tools: [...this.toolsResult.tools]
    };
  }

  async invokeTool(
    tool: string,
    args: Record<string, unknown>,
    options: InvokeOptions = {}
  ): Promise<CallToolResult> {
    const now = this.dependencies.now();
    if (!this.circuitBreaker.canAttempt(now)) {
      throw new McpCircuitOpenError(
        `Circuit breaker open for MCP server '${this.options.serverId}'`
      );
    }

    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    let attempt = 0;

    while (attempt < this.retryConfig.maxAttempts) {
      attempt += 1;
      try {
        const client = await this.ensureConnected();
        const result = (await client.callTool(
          { name: tool, arguments: args },
          CallToolResultSchema,
          {
            signal: options.signal,
            timeout: timeoutMs
          }
        )) as CallToolResult;
        this.circuitBreaker.recordSuccess();
        return result;
      } catch (error) {
        const failureTime = this.dependencies.now();
        this.circuitBreaker.recordFailure(failureTime);

        if (isTimeoutError(error)) {
          if (attempt >= this.retryConfig.maxAttempts) {
            throw new McpTimeoutError(
              `Timeout invoking MCP tool ${tool} after ${attempt} attempts`
            );
          }
        } else {
          if (error instanceof McpError) {
            const mcpError = error as McpError & { code: ErrorCode };
            if (mcpError.code === ErrorCode.ConnectionClosed) {
              await this.resetConnection();
            }
          }

          if (attempt >= this.retryConfig.maxAttempts) {
            throw new McpClientError(
              `Failed to invoke MCP tool ${tool}: ${error instanceof Error ? error.message : String(
                error
              )}`,
              error instanceof Error ? { cause: error } : undefined
            );
          }
        }

        const delay = this.calculateBackoffDelay(attempt);
        await this.dependencies.sleep(delay);
      }
    }

    throw new McpClientError(`Failed to invoke MCP tool ${tool} after retries`);
  }

  private async start(): Promise<void> {
    const clientInfo = this.options.clientInfo ?? DEFAULT_CLIENT_INFO;
    const client = this.dependencies.createClient(clientInfo, this.clientOptions);
    const transport = this.dependencies.createTransport(this.options.transport);

    try {
      await client.connect(transport);
      const result = await client.listTools({});
      this.client = client;
      this.toolsResult = result;
      this.closed = false;
    } catch (error) {
      await safeClose(client);
      throw error instanceof McpClientError
        ? error
        : new McpTransportError(
            `Failed to initialize MCP client for '${this.options.serverId}'`,
            error instanceof Error ? { cause: error } : undefined
          );
    }
  }

  private async ensureConnected(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    await this.initialize();

    const client: Client | null = this.client;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- reconnect may fail leaving client null
    if (client) {
      return client;
    }
    throw new McpClientError('Failed to establish MCP connection');
  }

  private async resetConnection(): Promise<void> {
    if (!this.client) {
      return;
    }
    await safeClose(this.client);
    this.client = null;
    this.toolsResult = null;
    this.initializing = null;
  }

  private calculateBackoffDelay(attempt: number): number {
    let delay =
      this.retryConfig.baseDelayMs *
      this.retryConfig.exponentialBase ** Math.max(0, attempt - 1);

    delay = Math.min(delay, this.retryConfig.maxDelayMs);

    if (this.retryConfig.jitter) {
      const jitterRange = delay * 0.25;
      const randomFactor = this.dependencies.random() * 2 - 1;
      delay += randomFactor * jitterRange;
    }

    return Math.max(0, delay);
  }
}

const isTimeoutError = (error: unknown): boolean => {
  if (error instanceof McpError) {
    const mcpError = error as McpError & { code: ErrorCode };
    return mcpError.code === ErrorCode.RequestTimeout;
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return true;
  }

  return false;
};

const safeClose = async (client: Client): Promise<void> => {
  try {
    await client.close();
  } catch {
    // Ignore close failures.
  }
};
