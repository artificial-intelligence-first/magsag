import { Args, Flags, Parser } from '@oclif/core';

import { evaluateFlowSummary } from '@magsag/governance';

import { type CliStreams, writeLine } from '../utils/streams.js';

export interface ParsedFlowGate {
  kind: 'flow:gate';
  summaryPath: string;
  policyPath?: string;
}

const gateFlags = {
  policy: Flags.string({
    summary: 'Custom policy file to evaluate against (defaults to bundled policy).'
  })
} as const;

const gateArgs = {
  summary: Args.string({
    name: 'summary',
    description: 'Path to the flow summary JSON file.',
    required: true
  })
} as const;

export const parseFlowGate = async (argv: string[]): Promise<ParsedFlowGate> => {
  const parsed = (await Parser.parse(argv, {
    args: gateArgs,
    flags: gateFlags,
    strict: true
  })) as {
    args: { summary?: string };
    flags: { policy?: string };
  };

  const summaryPath = parsed.args.summary;
  if (!summaryPath) {
    throw new Error('Summary path is required.');
  }

  return {
    kind: 'flow:gate',
    summaryPath,
    policyPath: parsed.flags.policy
  };
};

export const flowGateHandler = async (
  parsed: ParsedFlowGate,
  streams: CliStreams
): Promise<number> => {
  try {
    const issues = await evaluateFlowSummary(parsed.summaryPath, parsed.policyPath);
    if (issues.length > 0) {
      writeLine(streams.stdout, 'GOVERNANCE GATE FAILED');
      for (const issue of issues) {
        writeLine(streams.stdout, `- ${issue}`);
      }
      return 2;
    }

    writeLine(streams.stdout, 'GOVERNANCE GATE PASSED');
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    writeLine(streams.stderr, message);
    return 1;
  }
};
