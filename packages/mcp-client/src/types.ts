import type { Implementation } from '@modelcontextprotocol/sdk/types.js';

export type TransportType = 'stdio' | 'http' | 'sse' | 'websocket';

export interface StdioTransportConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  stderr?: 'inherit' | 'pipe' | 'ignore';
}

export interface HttpTransportConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
  timeoutSeconds?: number;
}

export interface SseTransportConfig {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface WebSocketTransportConfig {
  type: 'websocket';
  url: string;
  headers?: Record<string, string>;
}

export type TransportConfig =
  | StdioTransportConfig
  | HttpTransportConfig
  | SseTransportConfig
  | WebSocketTransportConfig;

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  jitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 10_000,
  exponentialBase: 2,
  jitter: true
};

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutSeconds: number;
  halfOpenMaxCalls: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutSeconds: 60,
  halfOpenMaxCalls: 1
};

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface McpClientOptions {
  serverId: string;
  transport: TransportConfig;
  retry?: Partial<RetryConfig>;
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  clientInfo?: Implementation;
  requestTimeoutMs?: number;
}

export interface InvokeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}
