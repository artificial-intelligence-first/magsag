import { Args, Flags, Parser } from '@oclif/core';

import { FlowRunner } from '../flow/runner.js';
import { type CliStreams, writeLine } from '../utils/streams.js';

export interface ParsedFlowValidate {
  kind: 'flow:validate';
  flowPath: string;
  schema?: string;
}

const validateFlags = {
  schema: Flags.string({
    summary: 'Path to a JSON schema file to validate against.',
    description: 'If omitted, flowctl will perform a dry-run validation.'
  })
} as const;

const validateArgs = {
  path: Args.string({
    name: 'path',
    description: 'Flow definition file to validate.',
    required: true
  })
} as const;

export const parseFlowValidate = async (argv: string[]): Promise<ParsedFlowValidate> => {
  const parsed = (await Parser.parse(argv, {
    flags: validateFlags,
    args: validateArgs,
    strict: true
  })) as {
    args: { path?: string };
    flags: { schema?: string };
  };

  const flowPath = parsed.args.path;
  if (!flowPath) {
    throw new Error('Flow definition path is required.');
  }

  return {
    kind: 'flow:validate',
    flowPath,
    schema: parsed.flags.schema
  };
};

export const flowValidateHandler = async (
  parsed: ParsedFlowValidate,
  streams: CliStreams
): Promise<number> => {
  try {
    const runner = new FlowRunner();
    const result = await runner.validate(parsed.flowPath, { schema: parsed.schema });

    if (result.stdout.trim().length > 0) {
      writeLine(streams.stdout, result.stdout.trim());
    } else if (result.ok) {
      writeLine(streams.stdout, 'OK');
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
