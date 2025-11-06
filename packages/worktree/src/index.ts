import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import {
  worktreeEventSchema,
  worktreeMetadataSchema,
  worktreeStateSchema,
  type WorktreeEventPayload,
  type WorktreeMetadata,
  type WorktreeState
} from '@magsag/schema';

const execFileAsync = promisify(execFile);

const METADATA_FILENAME = '.magsag-worktree.json';
const DEFAULT_BASE_REF = 'main';
const DEFAULT_EXPIRE = '14d';

const sanitizeSegment = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'run';
};

const parsePositiveInt = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const isMissingFile = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'ENOENT'
  );

interface GitWorktreeInfo {
  path: string;
  head?: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  prunable: boolean;
  locked: boolean;
  lockReason?: string;
}

const parseWorktreeList = (stdout: string): GitWorktreeInfo[] => {
  const entries: GitWorktreeInfo[] = [];
  let current: Partial<GitWorktreeInfo> | undefined;

  const flush = () => {
    if (current && current.path) {
      entries.push({
        path: current.path,
        head: current.head,
        branch: current.branch,
        detached: current.detached ?? false,
        bare: current.bare ?? false,
        prunable: current.prunable ?? false,
        locked: current.locked ?? false,
        lockReason: current.lockReason
      });
    }
    current = undefined;
  };

  const lines = stdout.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      flush();
      continue;
    }

    const spaceIndex = line.indexOf(' ');
    const key = spaceIndex === -1 ? line : line.slice(0, spaceIndex);
    const value = spaceIndex === -1 ? '' : line.slice(spaceIndex + 1);

    if (key === 'worktree') {
      flush();
      current = { path: value };
      continue;
    }

    if (!current) {
      continue;
    }

    switch (key) {
      case 'HEAD':
        current.head = value;
        break;
      case 'branch':
        current.branch = value.startsWith('refs/heads/')
          ? value.slice('refs/heads/'.length)
          : value;
        break;
      case 'detached':
        current.detached = true;
        break;
      case 'bare':
        current.bare = true;
        break;
      case 'prunable':
        current.prunable = true;
        break;
      case 'locked':
        current.locked = true;
        current.lockReason = value.length > 0 ? value : current.lockReason;
        break;
      default:
        break;
    }
  }

  flush();
  return entries;
};

const isWithinRoot = (root: string, candidate: string): boolean => {
  const relativePath = relative(root, candidate);
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith('..') &&
    !relativePath.includes(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
};

class Semaphore {
  private readonly max: number;
  private current = 0;
  private readonly queue: Array<() => void> = [];

  constructor(max: number) {
    this.max = Math.max(1, max);
  }

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current += 1;
      return () => this.release();
    }

    return new Promise((resolve) => {
      this.queue.push(() => {
        this.current += 1;
        resolve(() => this.release());
      });
    });
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  private release() {
    if (this.current > 0) {
      this.current -= 1;
    }
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

export type WorktreeEventListener = (event: WorktreeEventPayload) => void | Promise<void>;

export class WorktreeEventBus {
  private readonly listeners = new Set<WorktreeEventListener>();

  register(listener: WorktreeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async publish(event: WorktreeEventPayload): Promise<void> {
    const payload = worktreeEventSchema.parse(event);
    const errors: unknown[] = [];
    for (const listener of [...this.listeners]) {
      try {
        await listener(payload);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new AggregateError(errors, 'One or more worktree event listeners failed');
    }
  }
}

export interface WorktreeManagerOptions {
  repoPath: string;
  worktreesRoot?: string;
  gitBinary?: string;
  maxConcurrency?: number;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export interface CreateWorktreeOptions {
  id: string;
  task: string;
  base?: string;
  detach?: boolean;
  noCheckout?: boolean;
  lock?: boolean;
  lockReason?: string;
}

export interface RemoveWorktreeOptions {
  force?: boolean;
}

export interface LockWorktreeOptions {
  reason?: string;
}

export interface PruneWorktreesOptions {
  expire?: string;
}

export class WorktreeManager {
  private readonly repoPath: string;
  private readonly root: string;
  private rootRealPath?: string;
  private readonly gitBinary: string;
  private readonly env?: NodeJS.ProcessEnv;
  private readonly semaphore: Semaphore;
  private readonly bus = new WorktreeEventBus();
  private readonly nowFn: () => Date;

  constructor(options: WorktreeManagerOptions) {
    if (!options.repoPath) {
      throw new Error('repoPath is required to manage worktrees');
    }
    this.repoPath = resolve(options.repoPath);
    const rootCandidate =
      options.worktreesRoot ??
      process.env.MAGSAG_WORKTREES_ROOT ??
      join(this.repoPath, '..', '.worktrees');
    this.root = resolve(rootCandidate);
    this.gitBinary = options.gitBinary ?? 'git';
    this.env = options.env;
    const concurrency =
      options.maxConcurrency ?? parsePositiveInt(process.env.MAGSAG_WT_MAX_CONCURRENCY) ?? 4;
    this.semaphore = new Semaphore(concurrency);
    this.nowFn = options.now ?? (() => new Date());
  }

  getRoot(): string {
    return this.root;
  }

  getEventBus(): WorktreeEventBus {
    return this.bus;
  }

  async list(): Promise<WorktreeState[]> {
    const infos = await this.managedGitWorktrees();
    const states = await Promise.all(infos.map((info) => this.toWorktreeState(info)));
    return states.sort((a: WorktreeState, b: WorktreeState) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(identifier: string): Promise<WorktreeState | undefined> {
    return this.resolveWorktree(identifier);
  }

  async create(options: CreateWorktreeOptions): Promise<WorktreeState> {
    return this.semaphore.use(async () => {
      await this.ensureRoot();

      const existing = await this.resolveWorktree(options.id);
      if (existing) {
        throw new Error(`Worktree '${options.id}' already exists at ${existing.path}`);
      }

      const baseRef = options.base && options.base.trim().length > 0 ? options.base.trim() : DEFAULT_BASE_REF;
      await this.git(['rev-parse', '--verify', baseRef]);
      const shortBase = (await this.git(['rev-parse', '--short', baseRef])).replace(/\s+/g, '');

      const idSlug = sanitizeSegment(options.id);
      const taskSlug = sanitizeSegment(options.task);
      const directoryName = `wt-${idSlug}-${taskSlug}-${shortBase}`;
      const worktreePath = resolve(this.root, directoryName);
      const branchName = options.detach ? undefined : `wt/${idSlug}/${taskSlug}`;

      const args = ['worktree', 'add'];
      if (options.detach) {
        args.push('--detach');
      }
      if (options.noCheckout) {
        args.push('--no-checkout');
      }
      if (!options.detach && branchName) {
        args.push('-b', branchName);
      }
      args.push(worktreePath);
      args.push(baseRef);
      await this.git(args);

      if (options.lock) {
        const lockArgs = ['worktree', 'lock'];
        if (options.lockReason && options.lockReason.trim().length > 0) {
          lockArgs.push('--reason', options.lockReason);
        }
        lockArgs.push(worktreePath);
        await this.git(lockArgs);
      }

      const now = this.nowIso();
      await this.writeMetadata(worktreePath, {
        id: options.id,
        runId: options.id,
        task: options.task,
        base: baseRef,
        branch: branchName,
        detach: options.detach ?? false,
        noCheckout: options.noCheckout ?? false,
        createdAt: now,
        updatedAt: now,
        locked: options.lock ?? false,
        lockReason: options.lock ? options.lockReason : undefined,
        lockTimestamp: options.lock ? now : undefined,
        version: 1
      });

      const state = await this.describeByPath(worktreePath);
      await this.bus.publish({ type: 'worktree.create', worktree: state });
      return state;
    });
  }

  async remove(identifier: string, options?: RemoveWorktreeOptions): Promise<WorktreeState | undefined> {
    const state = await this.resolveWorktree(identifier);
    if (!state) {
      return undefined;
    }

    const args = ['worktree', 'remove'];
    if (options?.force) {
      args.push('--force');
    }
    args.push(state.path);
    await this.git(args);
    await this.bus.publish({ type: 'worktree.remove', worktree: state });
    return state;
  }

  async lock(identifier: string, options?: LockWorktreeOptions): Promise<WorktreeState> {
    const state = await this.requireWorktree(identifier);
    const args = ['worktree', 'lock'];
    if (options?.reason && options.reason.trim().length > 0) {
      args.push('--reason', options.reason);
    }
    args.push(state.path);
    await this.git(args);

    const now = this.nowIso();
    await this.updateMetadata(state.path, (current) => {
      const base = current ?? this.buildMetadataFromState(state);
      return {
        ...base,
        locked: true,
        lockReason: options?.reason ?? base.lockReason,
        lockTimestamp: now,
        updatedAt: now
      };
    });

    const updated = await this.describeByPath(state.path);
    await this.bus.publish({ type: 'worktree.lock', worktree: updated });
    return updated;
  }

  async unlock(identifier: string): Promise<WorktreeState> {
    const state = await this.requireWorktree(identifier);
    await this.git(['worktree', 'unlock', state.path]);

    const now = this.nowIso();
    await this.updateMetadata(state.path, (current) => {
      const base = current ?? this.buildMetadataFromState(state);
      return {
        ...base,
        locked: false,
        lockReason: undefined,
        lockTimestamp: undefined,
        updatedAt: now
      };
    });

    const updated = await this.describeByPath(state.path);
    await this.bus.publish({ type: 'worktree.unlock', worktree: updated });
    return updated;
  }

  async prune(options?: PruneWorktreesOptions): Promise<void> {
    const expire = options?.expire ?? process.env.MAGSAG_WT_TTL ?? DEFAULT_EXPIRE;
    const args = ['worktree', 'prune'];
    if (expire) {
      args.push('--expire', expire);
    }
    await this.git(args);
    await this.bus.publish({ type: 'worktree.prune', expire });
  }

  async repair(): Promise<void> {
    await this.git(['worktree', 'repair']);
    await this.bus.publish({ type: 'worktree.repair' });
  }

  private nowIso(): string {
    return this.nowFn().toISOString();
  }

  private metadataPathFor(worktreePath: string): string {
    return join(worktreePath, METADATA_FILENAME);
  }

  private async ensureRoot(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    this.rootRealPath = await this.safeRealpath(this.root);
  }

  private async runGit(args: string[]): Promise<{ stdout: string; stderr: string }> {
    try {
      const { stdout, stderr } = await execFileAsync(this.gitBinary, args, {
        cwd: this.repoPath,
        env: this.env ? { ...process.env, ...this.env } : undefined,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
      return {
        stdout: typeof stdout === 'string' ? stdout : String(stdout),
        stderr: typeof stderr === 'string' ? stderr : String(stderr)
      };
    } catch (error) {
      throw this.formatGitError(args, error);
    }
  }

  private async git(args: string[]): Promise<string> {
    const { stdout } = await this.runGit(args);
    return stdout.trim();
  }

  private formatGitError(args: string[], error: unknown): Error {
    if (error instanceof Error) {
      let stderr: string | undefined;
      if (
        typeof error === 'object' &&
        error !== null &&
        'stderr' in error &&
        typeof (error as { stderr?: unknown }).stderr === 'string'
      ) {
        stderr = (error as { stderr: string }).stderr.trim();
      }
      const message = [error.message, stderr].filter((value) => value && value.length > 0).join(': ');
      return new Error(`git ${args.join(' ')} failed: ${message}`, { cause: error });
    }
    return new Error(`git ${args.join(' ')} failed`);
  }

  private async loadGitWorktrees(): Promise<GitWorktreeInfo[]> {
    const stdout = await this.git(['worktree', 'list', '--porcelain']);
    return parseWorktreeList(stdout);
  }

  private async managedGitWorktrees(): Promise<GitWorktreeInfo[]> {
    const entries = await this.loadGitWorktrees();
    const rootPath = await this.getRootRealPath();
    const managed: GitWorktreeInfo[] = [];
    for (const entry of entries) {
      const resolvedPath = await this.safeRealpath(entry.path);
      if (isWithinRoot(rootPath, resolvedPath)) {
        managed.push({ ...entry, path: resolvedPath });
      }
    }
    return managed;
  }

  private async toWorktreeState(info: GitWorktreeInfo): Promise<WorktreeState> {
    const metadata = await this.readMetadata(info.path);
    const stats = await fs.stat(info.path).catch(() => undefined);
    const now = this.nowIso();
    const createdAt = metadata?.createdAt ?? stats?.birthtime?.toISOString() ?? now;
    const updatedAt = metadata?.updatedAt ?? stats?.mtime?.toISOString() ?? createdAt;
    const lockReason = metadata?.lockReason ?? info.lockReason;
    const locked = metadata?.locked ?? info.locked;
    const lockTimestamp = metadata?.lockTimestamp ?? (locked ? updatedAt : undefined);
    const name = basename(info.path);
    const id = metadata?.id ?? metadata?.runId ?? name;
    const runId = metadata?.runId ?? metadata?.id ?? id;

    const state = worktreeStateSchema.parse({
      id,
      runId,
      task: metadata?.task,
      name,
      path: info.path,
      branch: metadata?.branch ?? info.branch,
      base: metadata?.base,
      head: info.head,
      detached: info.detached || metadata?.detach === true,
      noCheckout: metadata?.noCheckout ?? false,
      createdAt,
      updatedAt,
      prunable: info.prunable,
      lock: {
        locked: Boolean(locked),
        reason: lockReason,
        timestamp: lockTimestamp
      },
      metadataPath: metadata ? this.metadataPathFor(info.path) : undefined,
      metadata
    });

    return state;
  }

  private buildMetadataFromState(state: WorktreeState): WorktreeMetadata {
    return worktreeMetadataSchema.parse({
      id: state.id,
      runId: state.runId,
      task: state.task,
      base: state.base ?? 'HEAD',
      branch: state.branch,
      detach: state.detached,
      noCheckout: state.noCheckout,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      locked: state.lock.locked,
      lockReason: state.lock.reason,
      lockTimestamp: state.lock.timestamp,
      version: 1
    });
  }

  private async readMetadata(worktreePath: string): Promise<WorktreeMetadata | undefined> {
    try {
      const raw = await fs.readFile(this.metadataPathFor(worktreePath), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      return worktreeMetadataSchema.parse(parsed);
    } catch (error) {
      if (isMissingFile(error)) {
        return undefined;
      }
      if (error instanceof Error) {
        throw new Error(
          `Failed to read worktree metadata at ${this.metadataPathFor(worktreePath)}: ${error.message}`,
          { cause: error }
        );
      }
      throw error;
    }
  }

  private async writeMetadata(
    worktreePath: string,
    metadata: WorktreeMetadata
  ): Promise<WorktreeMetadata> {
    const payload = worktreeMetadataSchema.parse(metadata);
    await fs.writeFile(this.metadataPathFor(worktreePath), JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  }

  private async updateMetadata(
    worktreePath: string,
    updater: (metadata: WorktreeMetadata | undefined) => WorktreeMetadata
  ): Promise<WorktreeMetadata> {
    const existing = await this.readMetadata(worktreePath);
    return this.writeMetadata(worktreePath, updater(existing));
  }

  private async resolveWorktree(identifier: string): Promise<WorktreeState | undefined> {
    const candidates = await this.list();
    const pathLike =
      identifier.includes('/') || identifier.includes('\\') || identifier.startsWith('.');
    const resolved = pathLike ? resolve(identifier) : undefined;

    return (
      candidates.find((state) => state.id === identifier) ??
      candidates.find((state) => state.runId === identifier) ??
      candidates.find((state) => state.name === identifier) ??
      candidates.find((state) => state.path === identifier) ??
      (resolved
        ? candidates.find((state) => resolve(state.path) === resolved)
        : undefined)
    );
  }

  private async requireWorktree(identifier: string): Promise<WorktreeState> {
    const state = await this.resolveWorktree(identifier);
    if (!state) {
      throw new Error(`Worktree '${identifier}' not found`);
    }
    return state;
  }

  private async describeByPath(worktreePath: string): Promise<WorktreeState> {
    const infos = await this.managedGitWorktrees();
    const normalized = await this.safeRealpath(worktreePath);
    const info = infos.find((entry) => entry.path === normalized);
    if (!info) {
      throw new Error(`Worktree '${worktreePath}' is not managed under ${this.root}`);
    }
    return this.toWorktreeState(info);
  }

  private async safeRealpath(path: string): Promise<string> {
    try {
      return await fs.realpath(path);
    } catch {
      return resolve(path);
    }
  }

  private async getRootRealPath(): Promise<string> {
    if (this.rootRealPath) {
      return this.rootRealPath;
    }
    try {
      this.rootRealPath = await fs.realpath(this.root);
    } catch {
      this.rootRealPath = resolve(this.root);
    }
    return this.rootRealPath;
  }
}

// Export enhanced manager
export { 
  WorktreeManager as EnhancedWorktreeManager, 
  JsonWorktreeStore, 
  type WorktreeRecord, 
  type WorktreeState as WorktreeRecordState, 
  type WorktreeManagerConfig, 
  type WorktreeStore 
} from "./manager.js";
