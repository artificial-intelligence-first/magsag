import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type {
  WorkspaceGraphProvider,
  TsDiagProvider,
  MetricsStore,
  RepoInfoProvider
} from './planner.js';

const execFileAsync = promisify(execFile);

/**
 * Parse the output of `git diff --shortstat` and return the total changed lines.
 */
export function parseGitShortstat(summary: string): number {
  const normalized = summary ?? '';
  const insertionMatch = normalized.match(/(\d+)\s+insertions?\b/i);
  const deletionMatch = normalized.match(/(\d+)\s+deletions?\b/i);

  const insertions = insertionMatch ? Number.parseInt(insertionMatch[1], 10) : 0;
  const deletions = deletionMatch ? Number.parseInt(deletionMatch[1], 10) : 0;

  return (Number.isNaN(insertions) ? 0 : insertions) + (Number.isNaN(deletions) ? 0 : deletions);
}

/**
 * Default implementation using pnpm workspace
 */
export class PnpmWorkspaceGraphProvider implements WorkspaceGraphProvider {
  constructor(private repoDir: string) {}

  async getPackageGraph(): Promise<Map<string, string[]>> {
    const graph = new Map<string, string[]>();

    try {
      // Use pnpm list to get dependencies
      const { stdout } = await execFileAsync(
        'pnpm',
        ['list', '--json', '--depth=0'],
        { cwd: this.repoDir }
      );

      const data = JSON.parse(stdout);

      // Parse workspace packages
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.name) {
            const deps = item.dependencies ? Object.keys(item.dependencies) : [];
            // Filter to only workspace dependencies
            const workspaceDeps = deps.filter(d => d.startsWith('@magsag/'));
            graph.set(item.name, workspaceDeps);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get pnpm workspace graph:', error);
      // Return empty graph as fallback
    }

    return graph;
  }
}

/**
 * TypeScript diagnostics provider using tsc
 */
export class TscDiagProvider implements TsDiagProvider {
  constructor(private repoDir: string) {}

  async collectErrors(packages: string[]): Promise<Map<string, { errorCount: number; files: string[] }>> {
    const results = new Map<string, { errorCount: number; files: string[] }>();

    for (const pkg of packages) {
      const pkgPath = this.getPackagePath(pkg);
      const diagnostics = await this.runTscForPackage(pkgPath);
      results.set(pkg, diagnostics);
    }

    return results;
  }

  private getPackagePath(packageName: string): string {
    const cleanName = packageName.replace('@magsag/', '');
    return join(this.repoDir, 'packages', cleanName);
  }

  private async runTscForPackage(pkgPath: string): Promise<{ errorCount: number; files: string[] }> {
    try {
      const { stdout, stderr } = await execFileAsync(
        'npx',
        ['tsc', '--noEmit', '--listFiles'],
        { cwd: pkgPath }
      );

      // Parse error count from stderr
      const errorMatch = stderr.match(/Found (\d+) error/);
      const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;

      // Parse files from stdout
      const files = stdout
        .split('\n')
        .filter(line => line.trim().length > 0)
        .filter(file => file.includes('/src/'));

      return { errorCount, files };
    } catch (error: any) {
      // tsc exits with non-zero when there are errors, but we still get output
      if (error.stdout || error.stderr) {
        const errorMatch = (error.stderr || '').match(/Found (\d+) error/);
        const errorCount = errorMatch ? parseInt(errorMatch[1], 10) : 0;

        const files = (error.stdout || '')
          .split('\n')
          .filter((line: string) => line.trim().length > 0)
          .filter((file: string) => file.includes('/src/'));

        return { errorCount, files };
      }

      // Real error occurred
      console.warn(`Failed to run tsc for ${pkgPath}:`, error.message);
      return { errorCount: 0, files: [] };
    }
  }
}

/**
 * Simple in-memory metrics store
 */
export class InMemoryMetricsStore implements MetricsStore {
  private metrics = new Map<string, { totalMs: number; count: number; failures: number }>();

  async getAverageExecutionTime(packageName: string): Promise<number> {
    const data = this.metrics.get(packageName);
    if (!data || data.count === 0) {
      return 5000; // Default 5 seconds
    }
    return data.totalMs / data.count;
  }

  async recordExecution(packageName: string, durationMs: number, success: boolean): Promise<void> {
    const existing = this.metrics.get(packageName) || { totalMs: 0, count: 0, failures: 0 };

    existing.totalMs += durationMs;
    existing.count += 1;
    if (!success) {
      existing.failures += 1;
    }

    this.metrics.set(packageName, existing);
  }

  getFailureRate(packageName: string): number {
    const data = this.metrics.get(packageName);
    if (!data || data.count === 0) {
      return 0;
    }
    return data.failures / data.count;
  }

  getAllMetrics(): Map<string, { avgMs: number; count: number; failureRate: number }> {
    const result = new Map();

    for (const [name, data] of this.metrics.entries()) {
      if (data.count > 0) {
        result.set(name, {
          avgMs: data.totalMs / data.count,
          count: data.count,
          failureRate: data.failures / data.count
        });
      }
    }

    return result;
  }

  reset(): void {
    this.metrics.clear();
  }
}

/**
 * Git-based repository info provider
 */
export class GitRepoInfoProvider implements RepoInfoProvider {
  constructor(private repoDir: string) {}

  async getChangedFiles(packageName: string): Promise<string[]> {
    const pkgPath = this.getPackagePath(packageName);

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', '--name-only', 'HEAD', '--', pkgPath],
        { cwd: this.repoDir }
      );

      return stdout
        .split('\n')
        .filter(line => line.trim().length > 0);
    } catch (error) {
      console.warn(`Failed to get changed files for ${packageName}:`, error);
      return [];
    }
  }

  async getChangedLines(packageName: string): Promise<number> {
    const pkgPath = this.getPackagePath(packageName);

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['diff', '--shortstat', 'HEAD', '--', pkgPath],
        { cwd: this.repoDir }
      );

      // Parse output like: "3 files changed, 42 insertions(+), 13 deletions(-)"
      return parseGitShortstat(stdout);
    } catch (error) {
      console.warn(`Failed to get changed lines for ${packageName}:`, error);
      return 0;
    }
  }

  private getPackagePath(packageName: string): string {
    const cleanName = packageName.replace('@magsag/', '');
    return join(this.repoDir, 'packages', cleanName);
  }
}

/**
 * Factory to create default providers
 */
export function createDefaultProviders(repoDir: string) {
  return {
    graph: new PnpmWorkspaceGraphProvider(repoDir),
    diag: new TscDiagProvider(repoDir),
    metrics: new InMemoryMetricsStore(),
    repo: new GitRepoInfoProvider(repoDir)
  };
}
