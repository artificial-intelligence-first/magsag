import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type WorktreeState = 'allocating' | 'active' | 'failed' | 'merged' | 'expired';

export interface WorktreeRecord {
  id: string;
  branch: string;
  path: string;
  planId: string;
  stepId: string;
  package?: string;
  state: WorktreeState;
  createdAt: number;
  lastActiveAt?: number;
  ttlMs: number;
  pinned?: boolean;
}

export interface WorktreeManagerConfig {
  root?: string;
  baseRef?: string;
  maxAlive?: number;
  ttlOkMs?: number;
  ttlFailedMs?: number;
  keepOnFailure?: boolean;
  gcOnStart?: boolean;
  gcOnExit?: boolean;
}

const DEFAULT_CONFIG: Required<WorktreeManagerConfig> = {
  root: '.magsag/wt',
  baseRef: 'main',
  maxAlive: 6,
  ttlOkMs: 24 * 60 * 60 * 1000,     // 24 hours for successful worktrees
  ttlFailedMs: 72 * 60 * 60 * 1000, // 72 hours for failed worktrees
  keepOnFailure: true,
  gcOnStart: true,
  gcOnExit: true
};

export interface WorktreeStore {
  get(id: string): Promise<WorktreeRecord | undefined>;
  put(record: WorktreeRecord): Promise<void>;
  delete(id: string): Promise<void>;
  all(): Promise<WorktreeRecord[]>;
}

export class JsonWorktreeStore implements WorktreeStore {
  private cache?: Record<string, WorktreeRecord>;
  private writePromise?: Promise<void>;
  private pendingFlush = false;

  constructor(private readonly indexPath: string) {}

  private async ensureDir(): Promise<void> {
    await fs.mkdir(dirname(this.indexPath), { recursive: true });
  }

  private async load(): Promise<Record<string, WorktreeRecord>> {
    if (this.cache) {
      return this.cache;
    }
    try {
      const data = await fs.readFile(this.indexPath, 'utf-8');
      this.cache = JSON.parse(data) as Record<string, WorktreeRecord>;
      return this.cache;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        this.cache = {};
        return this.cache;
      }
      throw error;
    }
  }

  private async persist(): Promise<void> {
    if (!this.cache) {
      return;
    }

    if (!this.writePromise) {
      this.writePromise = (async () => {
        try {
          await this.ensureDir();
          await fs.writeFile(this.indexPath, JSON.stringify(this.cache, null, 2));
        } finally {
          this.writePromise = undefined;
        }
      })();
      await this.writePromise;
      if (this.pendingFlush) {
        this.pendingFlush = false;
        return this.persist();
      }
      return;
    }

    this.pendingFlush = true;
    await this.writePromise;
    return this.persist();
  }

  async get(id: string): Promise<WorktreeRecord | undefined> {
    const records = await this.load();
    return records[id];
  }

  async put(record: WorktreeRecord): Promise<void> {
    const records = await this.load();
    records[record.id] = record;
    await this.persist();
  }

  async delete(id: string): Promise<void> {
    const records = await this.load();
    if (!(id in records)) {
      return;
    }
    delete records[id];
    await this.persist();
  }

  async all(): Promise<WorktreeRecord[]> {
    const records = await this.load();
    return Object.values(records);
  }
}

export class WorktreeManager {
  private readonly config: Required<WorktreeManagerConfig>;

  constructor(
    config: WorktreeManagerConfig = {},
    private readonly store: WorktreeStore
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async allocate(planId: string, stepId: string, pkg?: string): Promise<WorktreeRecord> {
    if (this.config.gcOnStart) {
      await this.gc();
    }

    await this.enforceMaxAlive();

    const shortId = randomUUID().slice(0, 8);
    const branch = pkg
      ? `magsag/${planId}/${pkg}/${shortId}`
      : `magsag/${planId}/${shortId}`;
    const path = join(
      this.config.root,
      pkg ? `${planId}-${pkg}-${shortId}` : `${planId}-${shortId}`
    );

    // Create worktree with branch option before path to satisfy git parsing order
    const worktreeArgs = [
      'worktree',
      'add',
      '-b',
      branch,
      path,
      this.config.baseRef
    ];
    await execFileAsync('git', worktreeArgs);

    const record: WorktreeRecord = {
      id: shortId,
      branch,
      path,
      planId,
      stepId,
      package: pkg,
      state: 'active',
      createdAt: Date.now(),
      ttlMs: this.config.ttlOkMs
    };

    await this.store.put(record);
    return record;
  }

  async finalize(record: WorktreeRecord, result: { ok: boolean }): Promise<void> {
    record.lastActiveAt = Date.now();

    if (result.ok) {
      record.state = 'merged';
      record.ttlMs = this.config.ttlOkMs;
    } else {
      record.state = 'failed';
      record.ttlMs = this.config.ttlFailedMs;
      if (this.config.keepOnFailure) {
        await this.store.put(record);
        return;
      }
    }

    await this.store.put(record);
    await this.tryCleanup(record);
  }

  private async tryCleanup(record: WorktreeRecord, options: { force?: boolean } = {}): Promise<void> {
    const force = options.force ?? false;
    const lastActiveAt = record.lastActiveAt ?? record.createdAt;
    const expired = Date.now() - lastActiveAt >= record.ttlMs;

    // Only enforce merge-base validation for recently merged worktrees
    if (!force && !expired && record.state === 'merged') {
      try {
        await execFileAsync('git', [
          'merge-base', '--is-ancestor', record.branch, this.config.baseRef
        ]);
      } catch (error: any) {
        const rawCode = error?.code;
        const exitCode =
          typeof rawCode === 'number'
            ? rawCode
            : typeof rawCode === 'string'
              ? Number.parseInt(rawCode, 10)
              : undefined;

        if (exitCode === 1 || exitCode === undefined) {
          // Branch is still active (exit 1) or error is ambiguous; skip until force/merge.
          return;
        }
        // Missing branches (exit 128) fall through so cleanup can proceed.
      }
    }

    const runGit = async (args: string[]) => {
      try {
        await execFileAsync('git', args);
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, error };
      }
    };

    const worktreeResult = await runGit(['worktree', 'remove', '--force', record.path]);
    if (!worktreeResult.ok) {
      return;
    }

    const branchResult = await runGit(['branch', '-D', record.branch]);
    if (!branchResult.ok) {
      const stderr = (branchResult.error as any)?.stderr;
      if (typeof stderr !== 'string' || !stderr.includes("not found")) {
        return;
      }
    }

    await this.store.delete(record.id);
  }

  async gc(): Promise<void> {
    // Run git worktree prune
    try {
      await execFileAsync('git', ['worktree', 'prune']);
    } catch {
      // Ignore errors
    }

    const records = await this.store.all();
    const now = Date.now();

    for (const record of records) {
      if (record.pinned) {
        continue;
      }

      const age = now - (record.lastActiveAt ?? record.createdAt);
      const expired = age > record.ttlMs;

      if (expired || record.state === 'expired') {
        await this.tryCleanup(record);
      }
    }
  }

  private async enforceMaxAlive(): Promise<void> {
    const records = await this.store.all();
    const active = records.filter(r => r.state === 'active' && !r.pinned);

    if (active.length < this.config.maxAlive) {
      return;
    }

    // Sort by last active time (oldest first)
    active.sort((a, b) => {
      const aTime = a.lastActiveAt ?? a.createdAt;
      const bTime = b.lastActiveAt ?? b.createdAt;
      return aTime - bTime;
    });

    // Remove oldest to make room
    const toRemove = active.length - this.config.maxAlive + 1;
    for (let i = 0; i < toRemove; i++) {
      const victim = active[i];
      victim.state = 'expired';
      await this.store.put(victim);
      await this.tryCleanup(victim);
    }
  }

  async list(): Promise<WorktreeRecord[]> {
    return this.store.all();
  }

  async prune(): Promise<void> {
    // Force cleanup of all expired worktrees
    const records = await this.store.all();
    for (const record of records) {
      if (record.pinned) {
        continue;
      }

      if (record.state === 'expired' || record.state === 'failed') {
        await this.tryCleanup(record);
      }
    }
  }

  async forceCleanup(): Promise<void> {
    const records = await this.store.all();
    for (const record of records) {
      if (record.pinned) {
        continue;
      }

      await this.tryCleanup(record, { force: true });
    }
  }
}
