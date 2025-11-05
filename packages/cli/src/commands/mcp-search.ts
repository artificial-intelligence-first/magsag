import { Args, Flags, Parser } from '@oclif/core';
import { loadMcpServerDefinitions } from '../mcp/config.js';
import { listToolsWithFallback } from '../mcp/client.js';
import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedMcpSearch {
  kind: 'mcp:search';
  query: string;
  serverId?: string;
  json: boolean;
}

const searchFlags = {
  server: Flags.string({
    summary: 'Restrict results to a single MCP server preset.'
  }),
  json: Flags.boolean({
    summary: 'Output JSON instead of human-readable text.',
    default: false
  })
} as const;

const searchArgs = {
  query: Args.string({
    name: 'query',
    description: 'Keyword used to match tool names or descriptions.',
    required: true
  })
} as const;

export const parseMcpSearch = async (argv: string[]): Promise<ParsedMcpSearch> => {
  const parsed = await Parser.parse(argv, {
    flags: searchFlags,
    args: searchArgs,
    strict: true
  });

  return {
    kind: 'mcp:search',
    query: parsed.args.query.trim(),
    serverId: parsed.flags.server?.trim() || undefined,
    json: Boolean(parsed.flags.json)
  } as ParsedMcpSearch;
};

const matchesQuery = (query: string, value?: string | null): boolean => {
  if (!value) {
    return false;
  }
  return value.toLowerCase().includes(query);
};

export const mcpSearchHandler = async (
  parsed: ParsedMcpSearch,
  streams: CliStreams
): Promise<number> => {
  const servers = await loadMcpServerDefinitions();
  const query = parsed.query.toLowerCase();
  const targets = parsed.serverId
    ? servers.filter((server) => server.id === parsed.serverId)
    : servers;

  if (parsed.serverId && targets.length === 0) {
    writeLine(
      streams.stderr,
      `Unknown MCP server '${parsed.serverId}'. Run 'magsag mcp ls' to list presets.`
    );
    return 1;
  }

  const results: Array<{
    serverId: string;
    transport: string;
    tool: { name: string; description?: string };
  }> = [];

  for (const server of targets) {
    try {
      const listing = await listToolsWithFallback(server);
      for (const tool of listing.tools.tools) {
        if (matchesQuery(query, tool.name) || matchesQuery(query, tool.description ?? undefined)) {
          results.push({
            serverId: server.id,
            transport: listing.transport.label,
            tool: {
              name: tool.name,
              description: tool.description ?? undefined
            }
          });
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
      writeLine(streams.stderr, message);
      return 1;
    }
  }

  if (parsed.json) {
    streams.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
    return 0;
  }

  if (results.length === 0) {
    writeLine(streams.stdout, `No MCP tools matched '${parsed.query}'.`);
    return 0;
  }

  writeLine(streams.stdout, `Matching MCP tools for '${parsed.query}':`);
  for (const match of results) {
    const suffix = match.tool.description ? ` — ${match.tool.description}` : '';
    writeLine(streams.stdout, `  • [${match.serverId}] ${match.tool.name}${suffix}`);
  }
  return 0;
};
