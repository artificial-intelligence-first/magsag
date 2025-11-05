import { Flags, Parser } from '@oclif/core';
import { WorktreeManager } from '@magsag/worktree';
import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedWorktreesGc {
  kind: 'worktrees:gc';
  force: boolean;
}

const gcFlags = {
  force: Flags.boolean({
    summary: 'Force cleanup ignoring TTL',
    default: false
  })
} as const;

export const parseWorktreesGc = async (argv: string[]): Promise<ParsedWorktreesGc> => {
  const parsed = await Parser.parse(argv, {
    flags: gcFlags,
    strict: true
  });

  return {
    kind: 'worktrees:gc',
    force: parsed.flags.force
  };
};

export const worktreesGcHandler = async (
  parsed: ParsedWorktreesGc,
  streams: CliStreams
): Promise<number> => {
  const repoPath = process.cwd();
  const manager = new WorktreeManager({ repoPath });

  writeLine(streams.stderr, 'Running worktree garbage collection...');

  const before = await manager.list();
  let removed = 0;

  if (parsed.force) {
    for (const worktree of before) {
      if (worktree.lock.locked) {
        continue;
      }
      await manager.remove(worktree.id, { force: true });
      removed += 1;
    }
  } else {
    await manager.prune();
  }

  const after = await manager.list();
  if (!parsed.force) {
    removed = before.length - after.length;
  }

  writeLine(streams.stderr, `Removed ${removed} worktree(s)`);
  writeLine(streams.stderr, `Remaining: ${after.length} worktree(s)`);

  return 0;
};
