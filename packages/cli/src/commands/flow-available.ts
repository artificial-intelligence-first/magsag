import { FlowRunner } from '../flow/runner.js';
import { type CliStreams, writeLine } from '../utils/streams.js';

export interface ParsedFlowAvailable {
  kind: 'flow:available';
}

export const parseFlowAvailable = async (argv: string[]): Promise<ParsedFlowAvailable> => {
  if (argv.length > 0) {
    throw new Error(`Unexpected arguments: ${argv.join(' ')}`);
  }
  return { kind: 'flow:available' };
};

export const flowAvailableHandler = async (
  _parsed: ParsedFlowAvailable,
  streams: CliStreams
): Promise<number> => {
  try {
    const runner = new FlowRunner();
    const info = await runner.info();
    if (!info) {
      writeLine(streams.stdout, 'no');
      return 0;
    }

    const extras: string[] = [];
    if (info.version) {
      extras.push(`version: ${info.version}`);
    }
    extras.push(`binary: ${info.binary}`);
    if (info.capabilities.length > 0) {
      extras.push(`capabilities: ${info.capabilities.join(', ')}`);
    }

    writeLine(streams.stdout, `yes (${extras.join('; ')})`);
    return 0;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    writeLine(streams.stderr, message);
    return 1;
  }
};
