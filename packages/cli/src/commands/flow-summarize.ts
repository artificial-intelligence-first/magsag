import { Flags, Parser } from '@oclif/core';
import { writeFile } from 'node:fs/promises';

import { summarizeFlowRuns } from '@magsag/observability';

import { type CliStreams, writeLine } from '../utils/streams.js';

export interface ParsedFlowSummarize {
  kind: 'flow:summarize';
  base: string;
  output?: string;
}

const summarizeFlags = {
  base: Flags.string({
    summary: 'Directory containing Flow Runner artifacts.',
    default: '.runs'
  }),
  output: Flags.string({
    summary: 'Optional file path to write the JSON summary.'
  })
} as const;

export const parseFlowSummarize = async (argv: string[]): Promise<ParsedFlowSummarize> => {
  const parsed = (await Parser.parse(argv, {
    flags: summarizeFlags,
    strict: true
  })) as {
    flags: { base?: string; output?: string };
  };

  return {
    kind: 'flow:summarize',
    base: parsed.flags.base ?? '.runs',
    output: parsed.flags.output
  };
};

export const flowSummarizeHandler = async (
  parsed: ParsedFlowSummarize,
  streams: CliStreams
): Promise<number> => {
  try {
    const summary = await summarizeFlowRuns(parsed.base);
    const payload = `${JSON.stringify(summary, null, 2)}\n`;

    if (parsed.output) {
      await writeFile(parsed.output, payload, 'utf8');
    }

    streams.stdout.write(payload);
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    writeLine(streams.stderr, message);
    return 1;
  }
};
