import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  StdioClientTransport,
  type StdioServerParameters
} from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { McpTransportError } from './errors.js';
import type {
  HttpTransportConfig,
  SseTransportConfig,
  StdioTransportConfig,
  TransportConfig,
  WebSocketTransportConfig
} from './types.js';

const createStdioTransport = (config: StdioTransportConfig): Transport => {
  if (!config.command) {
    throw new McpTransportError('STDIO transport requires a command');
  }

  const params: StdioServerParameters = {
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: config.cwd,
    stderr: config.stderr
  };

  return new StdioClientTransport(params);
};

const createHttpTransport = (config: HttpTransportConfig): Transport => {
  if (!config.url) {
    throw new McpTransportError('HTTP transport requires a URL');
  }

  const url = safeUrl(config.url);
  const headers = config.headers ? new Headers(config.headers) : undefined;

  return new StreamableHTTPClientTransport(url, {
    requestInit: headers ? { headers } : undefined
  });
};

const createSseTransport = (config: SseTransportConfig): Transport => {
  if (!config.url) {
    throw new McpTransportError('SSE transport requires a URL');
  }

  const url = safeUrl(config.url);
  const headers = config.headers ? new Headers(config.headers) : undefined;

  return new SSEClientTransport(url, {
    requestInit: headers ? { headers } : undefined
  });
};

const createWebSocketTransport = (config: WebSocketTransportConfig): Transport => {
  if (!config.url) {
    throw new McpTransportError('WebSocket transport requires a URL');
  }

  const url = safeUrl(config.url);
  return new WebSocketClientTransport(url);
};

const safeUrl = (value: string): URL => {
  try {
    return new URL(value);
  } catch (error) {
    throw new McpTransportError(`Invalid URL for transport: ${value}`, {
      cause: error instanceof Error ? error : undefined
    });
  }
};

export const createTransport = (config: TransportConfig): Transport => {
  switch (config.type) {
    case 'stdio':
      return createStdioTransport(config);
    case 'http':
      return createHttpTransport(config);
    case 'sse':
      return createSseTransport(config);
    case 'websocket':
      return createWebSocketTransport(config);
    default:
      return assertNever(config);
  }
};

const assertNever = (value: never): never => {
  throw new McpTransportError(`Unsupported transport config: ${JSON.stringify(value)}`);
};
