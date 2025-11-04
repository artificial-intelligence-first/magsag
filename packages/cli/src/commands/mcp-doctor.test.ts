import { describe, expect, test, vi } from 'vitest';
import { parseMcpDoctor, mcpDoctorHandler } from './mcp-doctor.js';

vi.mock('../mcp/config.js', () => ({
  loadMcpServerDefinitions: vi.fn(async () => [
    {
      id: 'demo',
      filePath: 'ops/adk/servers/demo.yaml',
      transports: [
        {
          type: 'http',
          label: 'HTTP http://primary',
          config: { type: 'http', url: 'http://primary' }
        },
        {
          type: 'stdio',
          label: 'STDIO demo',
          config: { type: 'stdio', command: 'demo' }
        }
      ]
    }
  ])
}));

vi.mock('../mcp/client.js', () => ({
  probeServer: vi.fn(async (server: unknown) => {
    const typedServer = server as {
      transports: Array<{ label: string; type: string }>;
    };
    return [
      {
        server: { id: 'demo' },
        transport: typedServer.transports[0],
        status: 'unreachable' as const,
        error: 'dial tcp ECONNREFUSED'
      },
      {
        server: { id: 'demo' },
        transport: typedServer.transports[1],
        status: 'reachable' as const
      }
    ];
  })
}));

describe('parseMcpDoctor', () => {
  test('parses defaults', async () => {
    const parsed = await parseMcpDoctor([]);
    expect(parsed).toEqual({ kind: 'mcp:doctor', serverId: undefined, json: false });
  });

  test('parses arguments', async () => {
    const parsed = await parseMcpDoctor(['notion', '--json']);
    expect(parsed.serverId).toBe('notion');
    expect(parsed.json).toBe(true);
  });

  test('summarizes fallback success as reachable', async () => {
    let stdout = '';
    const streams = {
      stdout: {
        write: (chunk: string) => {
          stdout += chunk;
        }
      } as unknown as NodeJS.WritableStream,
      stderr: {
        write: vi.fn()
      } as unknown as NodeJS.WritableStream
    };

    const exitCode = await mcpDoctorHandler(
      { kind: 'mcp:doctor', serverId: 'demo', json: false },
      streams
    );

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Server 'demo': REACHABLE via STDIO demo");
    expect(stdout).toContain('HTTP http://primary: unreachable');
  });
});
