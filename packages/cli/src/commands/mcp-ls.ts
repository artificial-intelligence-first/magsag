import { Args, Flags, Parser } from '@oclif/core';
import { loadMcpServerDefinitions } from '../mcp/config.js';
import { listToolsWithFallback } from '../mcp/client.js';
import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedMcpLs {
  kind: 'mcp:ls';
  serverId?: string;
  json: boolean;
}

const lsFlags = {
  json: Flags.boolean({
    summary: 'Output JSON instead of human-readable text.',
    default: false
  })
} as const;

const lsArgs = {
  server: Args.string({
    name: 'server',
    description: 'ID of the MCP server preset to inspect.',
    required: false
  })
} as const;

export const parseMcpLs = async (argv: string[]): Promise<ParsedMcpLs> => {
  const parsed = (await Parser.parse(argv, {
    flags: lsFlags,
    args: lsArgs,
    strict: true
  })) as {
    args: { server?: string };
    flags: { json?: boolean };
  };

  return {
    kind: 'mcp:ls',
    serverId: parsed.args.server?.trim() || undefined,
    json: Boolean(parsed.flags.json)
  };
};

const renderServerList = (
  streams: CliStreams,
  options: { json: boolean },
  serverIds: { id: string; description?: string }[]
) => {
  if (options.json) {
    streams.stdout.write(`${JSON.stringify(serverIds, null, 2)}\n`);
    return;
  }

  if (serverIds.length === 0) {
    writeLine(streams.stdout, 'No MCP server presets found under tools/adk/servers.');
    return;
  }

  writeLine(streams.stdout, 'Available MCP servers:');
  for (const server of serverIds) {
    const suffix = server.description ? ` — ${server.description}` : '';
    writeLine(streams.stdout, `  • ${server.id}${suffix}`);
  }
  writeLine(
    streams.stdout,
    'Pass a server ID to list registered tools, e.g. `magsag mcp ls notion`.'
  );
};

const renderToolList = (
  streams: CliStreams,
  options: { json: boolean },
  payload: {
    serverId: string;
    transportLabel: string;
    tools: { name: string; description?: string | null }[];
  }
) => {
  if (options.json) {
    streams.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  writeLine(
    streams.stdout,
    `Tools exposed by '${payload.serverId}' via ${payload.transportLabel}:`
  );
  if (payload.tools.length === 0) {
    writeLine(streams.stdout, '  (no tools registered)');
    return;
  }

  for (const tool of payload.tools) {
    const suffix = tool.description ? ` — ${tool.description}` : '';
    writeLine(streams.stdout, `  • ${tool.name}${suffix}`);
  }
};

export const mcpLsHandler = async (
  parsed: ParsedMcpLs,
  streams: CliStreams
): Promise<number> => {
  const servers = await loadMcpServerDefinitions();

  if (!parsed.serverId) {
    renderServerList(
      streams,
      { json: parsed.json },
      servers.map((server) => ({
        id: server.id,
        description: server.description
      }))
    );
    return 0;
  }

  const server = servers.find((definition) => definition.id === parsed.serverId);
  if (!server) {
    writeLine(
      streams.stderr,
      `Unknown MCP server '${parsed.serverId}'. Run 'magsag mcp ls' to list presets.`
    );
    return 1;
  }

  try {
    const result = await listToolsWithFallback(server);
    renderToolList(
      streams,
      { json: parsed.json },
      {
        serverId: server.id,
        transportLabel: result.transport.label,
        tools: result.tools.tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? undefined
        }))
      }
    );
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    writeLine(streams.stderr, message);
    return 1;
  }
};
