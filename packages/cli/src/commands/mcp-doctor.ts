import { Args, Flags, Parser } from '@oclif/core';
import { loadMcpServerDefinitions } from '../mcp/config.js';
import { probeServer } from '../mcp/client.js';
import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedMcpDoctor {
  kind: 'mcp:doctor';
  serverId?: string;
  json: boolean;
}

const doctorFlags = {
  json: Flags.boolean({
    summary: 'Output JSON instead of human-readable text.',
    default: false
  })
} as const;

const doctorArgs = {
  server: Args.string({
    name: 'server',
    description: 'ID of the MCP server preset to diagnose.',
    required: false
  })
} as const;

export const parseMcpDoctor = async (argv: string[]): Promise<ParsedMcpDoctor> => {
  const parsed = (await Parser.parse(argv, {
    flags: doctorFlags,
    args: doctorArgs,
    strict: true
  })) as {
    args: { server?: string };
    flags: { json?: boolean };
  };

  return {
    kind: 'mcp:doctor',
    serverId: parsed.args.server?.trim() || undefined,
    json: Boolean(parsed.flags.json)
  };
};

const summarizeProbe = (
  streams: CliStreams,
  options: { json: boolean },
  summary: Awaited<ReturnType<typeof probeServer>>
) => {
  if (options.json) {
    const normalized = summary.map((entry) => ({
      serverId: entry.server.id,
      transport: entry.transport.label,
      status: entry.status,
      error: entry.error
    }));
    streams.stdout.write(`${JSON.stringify(normalized, null, 2)}\n`);
    return;
  }

  if (summary.length === 0) {
    writeLine(streams.stdout, 'No transport attempts were recorded.');
    return;
  }

  let headlineIndex = summary.length - 1;
  for (let index = summary.length - 1; index >= 0; index -= 1) {
    if (summary[index]?.status === 'reachable') {
      headlineIndex = index;
      break;
    }
  }

  const headline = summary[headlineIndex];
  writeLine(
    streams.stdout,
    `Server '${headline.server.id}': ${headline.status.toUpperCase()} via ${headline.transport.label}`
  );

  const details = summary
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry, index }) => index !== headlineIndex && entry.status !== 'reachable');

  details.forEach(({ entry }, detailIndex) => {
    const prefix = detailIndex === details.length - 1 ? '  └─' : '  ├─';
    const reason = entry.error ? ` (${entry.error})` : '';
    writeLine(streams.stdout, `${prefix} ${entry.transport.label}: ${entry.status}${reason}`);
  });
};

export const mcpDoctorHandler = async (
  parsed: ParsedMcpDoctor,
  streams: CliStreams
): Promise<number> => {
  const servers = await loadMcpServerDefinitions();
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

  if (targets.length === 0) {
    writeLine(streams.stdout, 'No MCP server presets found under tools/adk/servers.');
    return 0;
  }

  if (parsed.json) {
    const aggregated: Array<{
      serverId: string;
      transport: string;
      status: string;
      error?: string;
    }> = [];
    for (const server of targets) {
      try {
        const summary = await probeServer(server);
        for (const item of summary) {
          aggregated.push({
            serverId: item.server.id,
            transport: item.transport.label,
            status: item.status,
            error: item.error
          });
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
        writeLine(streams.stderr, message);
        return 1;
      }
    }
    streams.stdout.write(`${JSON.stringify(aggregated, null, 2)}\n`);
    return 0;
  }

  for (const server of targets) {
    try {
      const summary = await probeServer(server);
      summarizeProbe(streams, { json: false }, summary);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
      writeLine(streams.stderr, message);
      return 1;
    }
  }

  return 0;
};
