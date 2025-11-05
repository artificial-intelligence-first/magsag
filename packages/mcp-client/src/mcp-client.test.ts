import { describe, expect, test, vi } from 'vitest';
import type { MockedFunction } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  CallToolResultSchema,
  McpError,
  ErrorCode,
  type ListToolsResult
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { McpClient } from './mcp-client.js';
import {
  McpCircuitOpenError,
  McpClientError,
  McpTimeoutError
} from './errors.js';

const TOOL_FIXTURE: ListToolsResult['tools'][number] = {
  name: 'echo',
  description: 'Echo back the input',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string'
      }
    },
    required: ['text']
  }
};

const noopTransport = {} as Transport;

describe('McpClient', () => {
  test('initializes and invokes tools successfully', async () => {
    const connect: MockedFunction<Client['connect']> = vi.fn().mockResolvedValue(undefined);
    const listTools: MockedFunction<Client['listTools']> = vi
      .fn()
      .mockResolvedValue({ tools: [TOOL_FIXTURE] });
    const callTool: MockedFunction<Client['callTool']> = vi.fn();
    callTool.mockResolvedValue({
      content: [],
      isError: false
    } satisfies Awaited<ReturnType<Client['callTool']>>);
    const close: MockedFunction<Client['close']> = vi.fn().mockResolvedValue(undefined);

    const client = new McpClient(
      {
        serverId: 'demo-server',
        transport: { type: 'http', url: 'https://example.com' }
      },
      {
        createClient: () =>
          ({
            connect,
            listTools,
            callTool,
            close
          }) as unknown as Client,
        createTransport: () => noopTransport,
        random: () => 0.5
      }
    );

    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(listTools).toHaveBeenCalledTimes(1);

    const result = await client.invokeTool('echo', { text: 'hello' });
    expect(result.isError).toBe(false);
    expect(callTool).toHaveBeenCalledWith(
      { name: 'echo', arguments: { text: 'hello' } },
      CallToolResultSchema,
      expect.anything()
    );

    await client.close();
    expect(close).toHaveBeenCalled();
  });

  test('retries failed invocations and honours timeout errors', async () => {
    const connect: MockedFunction<Client['connect']> = vi.fn().mockResolvedValue(undefined);
    const listTools: MockedFunction<Client['listTools']> = vi
      .fn()
      .mockResolvedValue({ tools: [TOOL_FIXTURE] });
    const timeoutError = new McpError(ErrorCode.RequestTimeout, 'timeout');
    const callTool: MockedFunction<Client['callTool']> = vi.fn();
    callTool
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce({
        content: [],
        isError: false
      } satisfies Awaited<ReturnType<Client['callTool']>>);
    const close: MockedFunction<Client['close']> = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const client = new McpClient(
      {
        serverId: 'demo-server',
        transport: { type: 'http', url: 'https://example.com' },
        retry: { maxAttempts: 2 }
      },
      {
        createClient: () =>
          ({
            connect,
            listTools,
            callTool,
            close
          }) as unknown as Client,
        createTransport: () => noopTransport,
        sleep,
        random: () => 0.5
      }
    );

    const result = await client.invokeTool('echo', { text: 'hello' });
    expect(result.isError).toBe(false);
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  test('throws McpTimeoutError after exhausting retries', async () => {
    const connect: MockedFunction<Client['connect']> = vi.fn().mockResolvedValue(undefined);
    const listTools: MockedFunction<Client['listTools']> = vi
      .fn()
      .mockResolvedValue({ tools: [TOOL_FIXTURE] });
    const timeoutError = new McpError(ErrorCode.RequestTimeout, 'timeout');
    const callTool: MockedFunction<Client['callTool']> = vi.fn().mockRejectedValue(timeoutError);
    const close: MockedFunction<Client['close']> = vi.fn().mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    const client = new McpClient(
      {
        serverId: 'demo-server',
        transport: { type: 'http', url: 'https://example.com' },
        retry: { maxAttempts: 2 }
      },
      {
        createClient: () =>
          ({
            connect,
            listTools,
            callTool,
            close
          }) as unknown as Client,
        createTransport: () => noopTransport,
        sleep,
        random: () => 0.5
      }
    );

    await expect(client.invokeTool('echo', { text: 'hello' })).rejects.toBeInstanceOf(
      McpTimeoutError
    );
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  test('opens circuit after repeated failures', async () => {
    const connect: MockedFunction<Client['connect']> = vi.fn().mockResolvedValue(undefined);
    const listTools: MockedFunction<Client['listTools']> = vi
      .fn()
      .mockResolvedValue({ tools: [TOOL_FIXTURE] });
    const failure = new Error('boom');
    const callTool: MockedFunction<Client['callTool']> = vi.fn().mockRejectedValue(failure);
    const close: MockedFunction<Client['close']> = vi.fn().mockResolvedValue(undefined);
    const now = vi.fn().mockReturnValue(1000);

    const client = new McpClient(
      {
        serverId: 'demo-server',
        transport: { type: 'http', url: 'https://example.com' },
        retry: { maxAttempts: 1 },
        circuitBreaker: {
          failureThreshold: 1,
          successThreshold: 1,
          timeoutSeconds: 60,
          halfOpenMaxCalls: 1
        }
      },
      {
        createClient: () =>
          ({
            connect,
            listTools,
            callTool,
            close
          }) as unknown as Client,
        createTransport: () => noopTransport,
        now,
        random: () => 0.5
      }
    );

    await expect(client.invokeTool('echo', { text: 'hello' })).rejects.toBeInstanceOf(
      McpClientError
    );

    await expect(client.invokeTool('echo', { text: 'hello' })).rejects.toBeInstanceOf(
      McpCircuitOpenError
    );
  });

  test('reuses cached responses when a cache key is provided', async () => {
    const connect: MockedFunction<Client['connect']> = vi.fn().mockResolvedValue(undefined);
    const listTools: MockedFunction<Client['listTools']> = vi
      .fn()
      .mockResolvedValue({ tools: [TOOL_FIXTURE] });
    const callTool: MockedFunction<Client['callTool']> = vi
      .fn()
      .mockResolvedValue({ content: [], isError: false } satisfies Awaited<ReturnType<Client['callTool']>>);
    const close: MockedFunction<Client['close']> = vi.fn().mockResolvedValue(undefined);
    const now = vi.fn(() => Date.now());

    const client = new McpClient(
      {
        serverId: 'demo-server',
        transport: { type: 'http', url: 'https://example.com' }
      },
      {
        createClient: () =>
          ({
            connect,
            listTools,
            callTool,
            close
          }) as unknown as Client,
        createTransport: () => noopTransport,
        now
      }
    );

    await client.invokeTool('echo', { text: 'cached' }, { cacheKey: 'cache::echo' });
    await client.invokeTool('echo', { text: 'cached' }, { cacheKey: 'cache::echo' });
    expect(callTool).toHaveBeenCalledTimes(1);

    client.clearCache('cache::echo');
    await client.invokeTool('echo', { text: 'cached' }, { cacheKey: 'cache::echo' });
    expect(callTool).toHaveBeenCalledTimes(2);
  });
});
