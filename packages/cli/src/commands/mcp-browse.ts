import { Flags, Parser } from '@oclif/core';
import { createClientExecutionContext } from '@magsag/mcp-client';
import type { McpClient } from '@magsag/mcp-client';
import { listEntries } from '@magsag/servers/filesystem';
import { loadMcpServerDefinitions } from '../mcp/config.js';
import { connectClientWithFallback } from '../mcp/client.js';
import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedMcpBrowse {
  kind: 'mcp:browse';
  serverId: string;
  path?: string;
  json: boolean;
}

const browseFlags = {
  server: Flags.string({
    summary: 'MCP server preset used for browsing.',
    default: 'filesystem'
  }),
  path: Flags.string({
    summary: 'Directory path relative to the MCP workspace.'
  }),
  json: Flags.boolean({
    summary: 'Output JSON instead of human-readable text.',
    default: false
  })
} as const;

export const parseMcpBrowse = async (argv: string[]): Promise<ParsedMcpBrowse> => {
  const parsed = await Parser.parse(argv, {
    flags: browseFlags,
    strict: true
  });

  return {
    kind: 'mcp:browse',
    serverId: parsed.flags.server ?? 'filesystem',
    path: parsed.flags.path?.trim() || undefined,
    json: Boolean(parsed.flags.json)
  } as ParsedMcpBrowse;
};

export const mcpBrowseHandler = async (
  parsed: ParsedMcpBrowse,
  streams: CliStreams
): Promise<number> => {
  const servers = await loadMcpServerDefinitions();
  const server = servers.find((definition) => definition.id === parsed.serverId);

  if (!server) {
    writeLine(
      streams.stderr,
      `Unknown MCP server '${parsed.serverId}'. Run 'magsag mcp ls' to list presets.`
    );
    return 1;
  }

  let client: McpClient | null = null;
  try {
    const connected = await connectClientWithFallback(server);
    client = connected.client;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    writeLine(streams.stderr, message);
    return 1;
  }

  const context = createClientExecutionContext(client);
  const relativePath = parsed.path ?? '.';

  try {
    const result = await listEntries(context, { path: relativePath });
    const entries = Array.isArray(result.entries) ? result.entries : [];

    if (parsed.json) {
      streams.stdout.write(
        `${JSON.stringify({ server: parsed.serverId, path: relativePath, entries }, null, 2)}\n`
      );
      return 0;
    }

    writeLine(streams.stdout, `Entries under '${relativePath}' (${parsed.serverId}):`);
    if (entries.length === 0) {
      writeLine(streams.stdout, '  (empty directory)');
      return 0;
    }

    for (const entry of entries) {
      const name = typeof entry?.name === 'string' ? entry.name : JSON.stringify(entry);
      const type = typeof entry?.type === 'string' ? entry.type : undefined;
      const suffix = type ? ` [${type}]` : '';
      writeLine(streams.stdout, `  • ${name}${suffix}`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    writeLine(streams.stderr, message);
    return 1;
  } finally {
    await client?.close();
  }
};
