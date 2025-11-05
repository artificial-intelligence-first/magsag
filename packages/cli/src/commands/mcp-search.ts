import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedMcpSearch {
  kind: 'mcp:search';
}

export const parseMcpSearch = async (_argv: string[]): Promise<ParsedMcpSearch> => {
  return { kind: 'mcp:search' };
};

export const mcpSearchHandler = async (
  _parsed: ParsedMcpSearch,
  streams: CliStreams
): Promise<number> => {
  writeLine(
    streams.stderr,
    "The 'mcp search' command is temporarily unavailable. Use 'magsag mcp ls' instead."
  );
  return 1;
};
