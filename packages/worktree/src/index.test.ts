import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { WorktreeManager } from './index.js';

const exec = promisify(execFile);

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test Bot',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test Bot',
  GIT_COMMITTER_EMAIL: 'test@example.com'
};

const initRepository = async (): Promise<string> => {
  const repoDir = await mkdtemp(join(tmpdir(), 'magsag-worktree-repo-'));
  await exec('git', ['init', '-b', 'main'], { cwd: repoDir, env: gitEnv });
  await writeFile(join(repoDir, 'README.md'), '# repo\n', 'utf8');
  await exec('git', ['add', 'README.md'], { cwd: repoDir, env: gitEnv });
  await exec('git', ['commit', '-m', 'Initial commit'], { cwd: repoDir, env: gitEnv });
  return repoDir;
};

describe('WorktreeManager', () => {
  it('manages git worktrees and emits events', async () => {
    const repoDir = await initRepository();
    const root = join(repoDir, '.worktrees');
    const events: string[] = [];
    const manager = new WorktreeManager({
      repoPath: repoDir,
      worktreesRoot: root,
      now: () => new Date('2025-01-01T00:00:00Z')
    });

    const unsubscribe = manager.getEventBus().register((event) => {
      events.push(event.type);
    });

    try {
      const created = await manager.create({
        id: 'run-001',
        task: 'migration',
        base: 'main',
        lock: true,
        lockReason: 'initial setup'
      });

      expect(created.id).toBe('run-001');
      expect(created.lock.locked).toBe(true);
      expect(created.lock.reason).toBe('initial setup');
      expect(created.metadata?.branch).toBeDefined();

      const listed = await manager.list();
      expect(listed).toHaveLength(1);
      expect(listed[0].metadata?.lockReason).toBe('initial setup');

      const unlocked = await manager.unlock('run-001');
      expect(unlocked.lock.locked).toBe(false);

      const relocked = await manager.lock('run-001', { reason: 'maintenance' });
      expect(relocked.lock.locked).toBe(true);
      expect(relocked.lock.reason).toBe('maintenance');

      await manager.prune({ expire: '1d' });
      await manager.repair();

      await manager.unlock('run-001');
      const removed = await manager.remove('run-001', { force: true });
      expect(removed?.id).toBe('run-001');
      expect(await manager.list()).toHaveLength(0);

      expect(events).toEqual(
        expect.arrayContaining([
          'worktree.create',
          'worktree.unlock',
          'worktree.lock',
          'worktree.unlock',
          'worktree.prune',
          'worktree.repair',
          'worktree.remove'
        ])
      );
    } finally {
      unsubscribe();
      await rm(repoDir, { recursive: true, force: true });
    }
  });
});
