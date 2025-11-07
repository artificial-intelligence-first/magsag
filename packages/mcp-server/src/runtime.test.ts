import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { McpClient } from '@magsag/mcp-client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { McpServerRuntime } from './runtime.js';
import type { ToolDefinition } from './types.js';

const implementation = {
  name: 'magsag-mcp-server',
  version: '1.0.0'
} as const;

const createRuntime = (port = 0): McpServerRuntime =>
  new McpServerRuntime({
    implementation,
    http: {
      host: '127.0.0.1',
      port
    }
  });

const createEchoTool = (): ToolDefinition => ({
  name: 'echo',
  description: 'Echo back the provided text',
  inputSchema: {
    text: z.string()
  },
  handler: async (args): Promise<CallToolResult> => {
    const text = typeof args.text === 'string' ? args.text : String(args.text ?? '');
    return {
      content: [
        {
          type: 'text',
          text
        }
      ],
      isError: false
    };
  }
});

describe('McpServerRuntime', () => {
  // TODO: Fix mcp-server tests - currently broken due to Zod v3/v4 compatibility issues with MCP SDK
  test.skip('exposes registered tools over HTTP', async () => {
    const runtime = createRuntime();
    runtime.registerTool(createEchoTool());

    await runtime.start();

    const address = runtime.getHttpAddress();
    expect(address).toBeDefined();
    if (!address) {
      throw new Error('HTTP address missing');
    }

    const client = new McpClient({
      serverId: 'local-mcp',
      transport: {
        type: 'http',
        url: address.url.toString()
      }
    });

    try {
      const tools = await client.listTools({ refresh: true });
      const toolNames = tools.tools.map((tool) => tool.name);
      expect(toolNames).toContain('echo');

      const result = await client.invokeTool('echo', { text: 'hello' });
      expect(result.isError).toBe(false);
      const textContent = result.content.find(
        (entry): entry is { type: 'text'; text: string } =>
          entry.type === 'text' && 'text' in entry
      );
      expect(textContent?.text).toBe('hello');
    } finally {
      await client.close();
      await runtime.stop();
    }
  });

  test.skip('applies new tools to existing sessions', async () => {
    const runtime = createRuntime();
    runtime.registerTool(createEchoTool());

    await runtime.start();

    const address = runtime.getHttpAddress();
    expect(address).toBeDefined();
    if (!address) {
      throw new Error('HTTP address missing');
    }

    const client = new McpClient({
      serverId: 'local-mcp',
      transport: {
        type: 'http',
        url: address.url.toString()
      }
    });

    try {
      await client.listTools({ refresh: true });

      const uppercaseTool: ToolDefinition = {
        name: 'upper',
        description: 'Uppercase text',
        inputSchema: {
          text: z.string()
        },
        handler: async (args): Promise<CallToolResult> => {
          const text = typeof args.text === 'string' ? args.text : String(args.text ?? '');
          return {
            content: [
              {
                type: 'text',
                text: text.toUpperCase()
              }
            ],
            isError: false
          };
        }
      };

      runtime.registerTool(uppercaseTool);

      const refreshed = await client.listTools({ refresh: true });
      const names = refreshed.tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining(['echo', 'upper']));

      const result = await client.invokeTool('upper', { text: 'abc' });
      const textContent = result.content.find(
        (entry): entry is { type: 'text'; text: string } =>
          entry.type === 'text' && 'text' in entry
      );
      expect(textContent?.text).toBe('ABC');
    } finally {
      await client.close();
      await runtime.stop();
    }
  });
});
