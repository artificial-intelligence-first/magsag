import { Flags, Parser } from '@oclif/core';
import { WorktreeManager } from '@magsag/worktree';
import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedWorktreesLs {
  kind: 'worktrees:ls';
  json: boolean;
}

const lsFlags = {
  json: Flags.boolean({
    summary: 'Output as JSON',
    default: false
  })
} as const;

export const parseWorktreesLs = async (argv: string[]): Promise<ParsedWorktreesLs> => {
  const parsed = await Parser.parse(argv, {
    flags: lsFlags,
    strict: true
  });

  return {
    kind: 'worktrees:ls',
    json: parsed.flags.json
  };
};

export const worktreesLsHandler = async (
  parsed: ParsedWorktreesLs,
  streams: CliStreams
): Promise<number> => {
  const repoPath = process.cwd();
  const manager = new WorktreeManager({ repoPath });

  const worktrees = await manager.list();

  if (parsed.json) {
    writeLine(streams.stdout, JSON.stringify(worktrees, null, 2));
  } else {
    if (worktrees.length === 0) {
      writeLine(streams.stdout, 'No worktrees found');
      return 0;
    }

    writeLine(streams.stdout, 'Worktrees:');
    writeLine(streams.stdout, '');

    for (const worktree of worktrees) {
      const createdAt = Date.parse(worktree.createdAt);
      const ageHours =
        Number.isFinite(createdAt) && !Number.isNaN(createdAt)
          ? Math.max(0, Math.floor((Date.now() - createdAt) / (60 * 60 * 1000)))
          : undefined;
      const lockLabel = worktree.lock.locked
        ? `locked${worktree.lock.reason ? ` (${worktree.lock.reason})` : ''}`
        : 'unlocked';

      writeLine(streams.stdout, `ID:       ${worktree.id}`);
      writeLine(streams.stdout, `Task:     ${worktree.task ?? '-'}`);
      writeLine(streams.stdout, `Branch:   ${worktree.branch ?? '(detached)'}`);
      writeLine(streams.stdout, `Base:     ${worktree.base ?? '-'}`);
      writeLine(streams.stdout, `Path:     ${worktree.path}`);
      writeLine(streams.stdout, `Head:     ${worktree.head ?? '-'}`);
      writeLine(streams.stdout, `Created:  ${worktree.createdAt}`);
      writeLine(streams.stdout, `Updated:  ${worktree.updatedAt}`);
      writeLine(streams.stdout, `Lock:     ${lockLabel}`);
      writeLine(streams.stdout, `Prunable: ${worktree.prunable ? 'yes' : 'no'}`);
      if (ageHours !== undefined) {
        writeLine(streams.stdout, `Age:      ${ageHours}h`);
      }
      writeLine(streams.stdout, '');
    }

    writeLine(streams.stdout, `Total: ${worktrees.length} worktree(s)`);
  }

  return 0;
};
