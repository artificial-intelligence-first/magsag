import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedMcpBrowse {
  kind: 'mcp:browse';
}

export const parseMcpBrowse = async (_argv: string[]): Promise<ParsedMcpBrowse> => {
  return { kind: 'mcp:browse' };
};

export const mcpBrowseHandler = async (
  _parsed: ParsedMcpBrowse,
  streams: CliStreams
): Promise<number> => {
  writeLine(
    streams.stderr,
    "The 'mcp browse' command is temporarily unavailable. Use 'magsag mcp ls <server>' instead."
  );
  return 1;
};
