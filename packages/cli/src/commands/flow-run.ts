import { Args, Flags, Parser } from '@oclif/core';

import { FlowRunner } from '../flow/runner.js';
import { type CliStreams, writeLine } from '../utils/streams.js';

export interface ParsedFlowRun {
  kind: 'flow:run';
  flowPath: string;
  dryRun: boolean;
  only?: string;
  continueFrom?: string;
}

const runFlags = {
  'dry-run': Flags.boolean({
    summary: 'Preview execution without side effects.',
    default: false
  }),
  only: Flags.string({
    summary: 'Execute only the specified flow step.'
  }),
  'continue-from': Flags.string({
    summary: 'Resume execution starting from the given step.'
  })
} as const;

const runArgs = {
  path: Args.string({
    name: 'path',
    description: 'Flow definition file to execute.',
    required: true
  })
} as const;

export const parseFlowRun = async (argv: string[]): Promise<ParsedFlowRun> => {
  const parsed = (await Parser.parse(argv, {
    flags: runFlags,
    args: runArgs,
    strict: true
  })) as {
    args: { path?: string };
    flags: {
      'dry-run'?: boolean;
      only?: string;
      'continue-from'?: string;
    };
  };

  const flowPath = parsed.args.path;
  if (!flowPath) {
    throw new Error('Flow definition path is required.');
  }

  return {
    kind: 'flow:run',
    flowPath,
    dryRun: Boolean(parsed.flags['dry-run']),
    only: parsed.flags.only,
    continueFrom: parsed.flags['continue-from']
  };
};

export const flowRunHandler = async (
  parsed: ParsedFlowRun,
  streams: CliStreams
): Promise<number> => {
  try {
    const runner = new FlowRunner();
    const result = await runner.run(parsed.flowPath, {
      dryRun: parsed.dryRun,
      only: parsed.only,
      continueFrom: parsed.continueFrom
    });

    if (result.stdout.trim().length > 0) {
      writeLine(streams.stdout, result.stdout.trim());
    }

    if (!result.ok && result.stderr.trim().length > 0) {
      writeLine(streams.stderr, result.stderr.trim());
    }

    return result.ok ? 0 : 1;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    writeLine(streams.stderr, message);
    return 1;
  }
};
