import { join, resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { Args, Flags, Parser } from '@oclif/core';
import { loadRunLog } from '@magsag/observability';
import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedRunsDescribe {
  repo: string;
  directory?: string;
  query: string;
}

const describeFlags = {
  repo: Flags.string({
    char: 'r',
    summary: 'Repository root used to resolve the default runs directory',
    description: 'Defaults to the current working directory when omitted.'
  }),
  directory: Flags.string({
    char: 'd',
    summary: 'Directory containing run log files',
    description: 'Overrides the default <repo>/.magsag/runs directory.'
  })
} as const;

const describeArgs = {
  id: Args.string({
    name: 'id',
    required: true,
    description: 'Run identifier or path to a run log file.'
  })
} as const;

export const parseRunsDescribe = async (argv: string[]): Promise<ParsedRunsDescribe> => {
  const parsed = await Parser.parse(argv, {
    flags: describeFlags,
    args: describeArgs,
    strict: true
  });

  const repo = parsed.flags.repo ? resolve(parsed.flags.repo) : process.cwd();
  const directory = parsed.flags.directory?.trim().length
    ? resolve(parsed.flags.directory)
    : undefined;

  return {
    repo,
    directory,
    query: parsed.args.id
  };
};

const defaultRunsDir = (repo: string): string => join(repo, '.magsag', 'runs');

const resolveRunLogPath = async (parsed: ParsedRunsDescribe): Promise<string> => {
  const candidate = parsed.query;
  const looksLikePath = candidate.includes('/') || candidate.includes('\\');
  if (looksLikePath) {
    const resolved = resolve(candidate);
    await fs.access(resolved);
    return resolved;
  }

  const runsDir = parsed.directory ?? defaultRunsDir(parsed.repo);
  const filePath = join(runsDir, candidate.endsWith('.jsonl') ? candidate : `${candidate}.jsonl`);
  await fs.access(filePath);
  return filePath;
};

const formatSummaryLine = (key: string, value: string): string => `${key.padEnd(12)} ${value}`;

export const runsDescribeHandler = async (
  parsed: ParsedRunsDescribe,
  streams: CliStreams
): Promise<number> => {
  const logPath = await resolveRunLogPath(parsed);
  const { summary } = await loadRunLog(logPath);

  writeLine(streams.stdout, `Run: ${summary.runId}`);
  writeLine(streams.stdout, formatSummaryLine('started', summary.startedAt));
  if (summary.finishedAt) {
    writeLine(streams.stdout, formatSummaryLine('finished', summary.finishedAt));
  }
  if (summary.durationMs !== undefined) {
    writeLine(streams.stdout, formatSummaryLine('duration', `${summary.durationMs}ms`));
  }

  writeLine(
    streams.stdout,
    formatSummaryLine(
      'totals',
      `completed=${summary.totals.completed} failed=${summary.totals.failed} skipped=${summary.totals.skipped}`
    )
  );

  if (summary.results.length > 0) {
    writeLine(streams.stdout, 'Results:');
    for (const result of summary.results) {
      const detail = result.detail ? ` (${result.detail})` : '';
      writeLine(streams.stdout, `  - ${result.subtaskId}: ${result.status}${detail}`);
    }
  }

  if (summary.usage && Object.keys(summary.usage).length > 0) {
    writeLine(streams.stdout, 'Usage:');
    for (const [subtaskId, usage] of Object.entries(summary.usage)) {
      writeLine(streams.stdout, `  - ${subtaskId}: ${JSON.stringify(usage)}`);
    }
  }

  writeLine(streams.stdout, formatSummaryLine('log', logPath));

  return 0;
};
