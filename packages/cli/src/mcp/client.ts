import {
  McpClient,
  McpClientError,
  McpTimeoutError,
  McpTransportError
} from '@magsag/mcp-client';
import type { ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServerDefinition, McpTransportEntry } from './config.js';

export interface ToolListResult {
  readonly server: McpServerDefinition;
  readonly transport: McpTransportEntry;
  readonly tools: ListToolsResult;
}

export type ProbeStatus = 'reachable' | 'needs-auth' | 'auth-failed' | 'unreachable';

export interface ProbeResult {
  readonly server: McpServerDefinition;
  readonly transport: McpTransportEntry;
  readonly status: ProbeStatus;
  readonly error?: string;
}

const classifyError = (error: unknown): { status: ProbeStatus; message: string } => {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  const normalized = message.toLowerCase();

  if (normalized.includes('401') || normalized.includes('unauthorized') || normalized.includes('oauth')) {
    return { status: 'needs-auth', message };
  }
  if (normalized.includes('403') || normalized.includes('forbidden') || normalized.includes('license')) {
    return { status: 'auth-failed', message };
  }
  return { status: 'unreachable', message };
};

const closeQuietly = async (client: McpClient) => {
  try {
    await client.close();
  } catch {
    // ignore close errors
  }
};

export const listToolsWithFallback = async (
  server: McpServerDefinition
): Promise<ToolListResult> => {
  const errors: { transport: McpTransportEntry; error: string }[] = [];

  for (const transport of server.transports) {
    const client = new McpClient({
      serverId: server.id,
      transport: transport.config
    });
    try {
      const tools = await client.listTools({ refresh: true });
      await client.close();
      return { server, transport, tools };
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
      errors.push({ transport, error: detail });
      await closeQuietly(client);
    }
  }

  const messages = errors
    .map((entry) => `- ${entry.transport.label}: ${entry.error}`)
    .join('\n');
  throw new Error(`Failed to connect to MCP server '${server.id}' via all transports:\n${messages}`);
};

export const connectClientWithFallback = async (
  server: McpServerDefinition
): Promise<{ client: McpClient; transport: McpTransportEntry }> => {
  const errors: { transport: McpTransportEntry; error: string }[] = [];

  for (const transport of server.transports) {
    const client = new McpClient({
      serverId: server.id,
      transport: transport.config
    });

    try {
      await client.listTools();
      return { client, transport };
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
      errors.push({ transport, error: detail });
      await closeQuietly(client);
    }
  }

  const messages = errors
    .map((entry) => `- ${entry.transport.label}: ${entry.error}`)
    .join('\n');
  throw new Error(`Failed to connect to MCP server '${server.id}' via all transports:\n${messages}`);
};

export const probeServer = async (server: McpServerDefinition): Promise<ProbeResult[]> => {
  const results: ProbeResult[] = [];

  for (const transport of server.transports) {
    const client = new McpClient({
      serverId: server.id,
      transport: transport.config
    });

    try {
      await client.listTools({ refresh: true });
      await client.close();
      results.push({
        server,
        transport,
        status: 'reachable'
      });
      break;
    } catch (error) {
      await closeQuietly(client);
      if (
        error instanceof McpTimeoutError ||
        error instanceof McpTransportError ||
        error instanceof McpClientError
      ) {
        const classified = classifyError(error);
        results.push({
          server,
          transport,
          status: classified.status,
          error: classified.message
        });
        if (classified.status === 'needs-auth' || classified.status === 'auth-failed') {
          break;
        }
        continue;
      }

      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
      results.push({
        server,
        transport,
        status: 'unreachable',
        error: message
      });
    }
  }

  if (results.length === 0) {
    results.push({
      server,
      transport: server.transports[0],
      status: 'unreachable',
      error: 'No transports were evaluated.'
    });
  }

  return results;
};
