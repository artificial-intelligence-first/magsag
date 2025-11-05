import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import pidusage from 'pidusage';
import { maskSensitiveText } from '@magsag/shared-logging';

export type WorkspaceLogChannel = 'workspace' | 'stdout' | 'stderr';

export interface WorkspaceLimits {
  cpuMs?: number;
  memoryMb?: number;
  wallClockMs?: number;
}

export interface WorkspaceConfig {
  baseDir?: string;
  keep?: boolean;
  name?: string;
  limits?: WorkspaceLimits;
  logChannels?: WorkspaceLogChannel[];
}

export interface WorkspaceLoggerEntry {
  channel: WorkspaceLogChannel;
  message: string;
}

export type WorkspaceLogger = (entry: WorkspaceLoggerEntry) => void;

const ensureDirectory = async (target: string): Promise<void> => {
  await mkdir(target, { recursive: true });
};

const sanitizeName = (value?: string): string => {
  if (value && value.trim().length > 0) {
    return value.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  }
  return `workspace-${Date.now()}-${randomUUID().slice(0, 6)}`;
};

const DEFAULT_LOG_CHANNELS: WorkspaceLogChannel[] = ['workspace'];

const MB = 1024 * 1024;

interface ExecutionWorkspaceState {
  baseDir: string;
  path: string;
  keep: boolean;
  limits?: WorkspaceLimits;
  logger: WorkspaceLogger;
  channels: Set<WorkspaceLogChannel>;
}

export class ExecutionWorkspace {
  static async create(
    config: WorkspaceConfig = {},
    logger: WorkspaceLogger = () => undefined
  ): Promise<ExecutionWorkspace> {
    const baseDir = config.baseDir ?? path.join(os.tmpdir(), 'magsag-workspaces');
    await ensureDirectory(baseDir);
    const name = sanitizeName(config.name);
    const workspacePath = path.join(baseDir, name);
    await ensureDirectory(workspacePath);

    const state: ExecutionWorkspaceState = {
      baseDir,
      path: workspacePath,
      keep: config.keep ?? false,
      limits: config.limits,
      logger,
      channels: new Set(config.logChannels ?? DEFAULT_LOG_CHANNELS)
    };

    return new ExecutionWorkspace(state);
  }

  readonly path: string;

  private readonly keep: boolean;
  private readonly limits?: WorkspaceLimits;
  private readonly logger: WorkspaceLogger;
  private readonly channels: Set<WorkspaceLogChannel>;
  private monitorInterval?: NodeJS.Timeout;
  private wallClockTimer?: NodeJS.Timeout;
  private terminatedReason?: string;
  private cpuBudgetMs?: number;
  private cpuConsumedMs = 0;
  private attachedPid?: number;
  private readonly auditLogPath: string;

  private constructor(private readonly state: ExecutionWorkspaceState) {
    this.path = state.path;
    this.keep = state.keep;
    this.limits = state.limits;
    this.logger = state.logger;
    this.channels = state.channels;
    this.auditLogPath = path.join(this.path, 'audit.log');
    this.log('workspace', `Workspace initialized at ${this.path}`);
  }

  environment(): Record<string, string> {
    return {
      MAGSAG_WORKSPACE_DIR: this.path
    };
  }

  attach(child: ChildProcess): void {
    const limits = this.limits;
    if ((!limits || (!limits.cpuMs && !limits.memoryMb && !limits.wallClockMs)) && !this.channels.has('workspace')) {
      return;
    }

    const startMonitoring = async (pid: number) => {
      this.attachedPid = pid;
      if (limits?.wallClockMs) {
        this.wallClockTimer = setTimeout(() => {
          this.terminate(child, `wall clock limit of ${limits.wallClockMs}ms exceeded`);
        }, limits.wallClockMs);
      }

      if (limits?.cpuMs) {
        this.cpuBudgetMs = limits.cpuMs;
      }

      if (limits?.cpuMs || limits?.memoryMb) {
        const intervalMs = 500;
        this.monitorInterval = setInterval(() => {
          void this.sample(pid, intervalMs, limits, child);
        }, intervalMs);
      }
    };

    if (typeof child.pid === 'number' && child.pid > 0) {
      void startMonitoring(child.pid);
    } else {
      child.once('spawn', () => {
        if (typeof child.pid === 'number' && child.pid > 0) {
          void startMonitoring(child.pid);
        }
      });
    }

    const stop = () => {
      this.stopMonitoring();
    };

    child.once('exit', stop);
    child.once('error', stop);
  }

  private async sample(
    pid: number,
    intervalMs: number,
    limits: WorkspaceLimits,
    child: ChildProcess
  ): Promise<void> {
    try {
      const stats = await pidusage(pid);
      if (limits.memoryMb && stats.memory > limits.memoryMb * MB) {
        this.terminate(
          child,
          `memory limit exceeded (${Math.round(stats.memory / MB)}MB > ${limits.memoryMb}MB)`
        );
        return;
      }

      if (this.cpuBudgetMs !== undefined) {
        this.cpuConsumedMs += (stats.cpu / 100) * intervalMs;
        if (this.cpuConsumedMs > this.cpuBudgetMs) {
          this.terminate(
            child,
            `CPU budget exceeded (${Math.round(this.cpuConsumedMs)}ms > ${this.cpuBudgetMs}ms)`
          );
        }
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code === 'ENOENT') {
        this.stopMonitoring();
      }
    }
  }

  private terminate(child: ChildProcess, reason: string): void {
    if (this.terminatedReason) {
      return;
    }
    this.terminatedReason = reason;
    this.log('workspace', `Terminating workspace process: ${reason}`);
    this.stopMonitoring();
    try {
      child.kill('SIGKILL');
    } catch {
      // ignore kill errors
    }
  }

  private stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = undefined;
    }
    if (this.wallClockTimer) {
      clearTimeout(this.wallClockTimer);
      this.wallClockTimer = undefined;
    }
    if (this.attachedPid) {
      try {
        pidusage.clear();
      } catch {
        // ignore failures when clearing pidusage cache
      }
      this.attachedPid = undefined;
    }
  }

  private log(channel: WorkspaceLogChannel, message: string): void {
    if (!this.channels.has(channel)) {
      return;
    }
    const { masked } = maskSensitiveText(message);
    this.logger({ channel, message: masked });
    void this.writeAudit(masked);
  }

  private async writeAudit(message: string): Promise<void> {
    try {
      await appendFile(
        this.auditLogPath,
        `${new Date().toISOString()} ${message}\n`,
        { mode: 0o600 }
      );
    } catch {
      // Swallow audit logging errors; auditing is best-effort.
    }
  }

  async finalize(): Promise<void> {
    this.stopMonitoring();
    if (this.keep) {
      const artifacts = await this.collectArtifacts();
      this.log(
        'workspace',
        `Retaining workspace at ${this.path} (${artifacts.length} artifacts)`
      );
      return;
    }

    try {
      await rm(this.path, { recursive: true, force: true });
      this.log('workspace', 'Workspace cleaned up');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.log('workspace', `Failed to remove workspace: ${detail}`);
    }
  }

  private async collectArtifacts(): Promise<string[]> {
    const entries: string[] = [];
    try {
      const items = await readdir(this.path);
      for (const item of items) {
        try {
          const itemPath = path.join(this.path, item);
          const info = await stat(itemPath);
          if (info.isFile()) {
            entries.push(item);
          } else if (info.isDirectory()) {
            entries.push(`${item}/`);
          }
        } catch {
          // ignore stat errors for artifacts inventory
        }
      }
    } catch {
      // ignore readdir errors
    }
    return entries;
  }
}
