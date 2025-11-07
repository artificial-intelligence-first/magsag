import { cpus } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  AgentContext,
  Plan,
  PlanStep,
  SubtaskSpec,
  TaskSpec
} from '@magsag/core';

const execFileAsync = promisify(execFile);

export interface Planner {
  createPlan(task: TaskSpec, context: AgentContext): Promise<Plan>;
}

export interface PlannerConfig {
  cpuMultiplier?: number;
  maxParallel?: number | 'auto';
  preferLeaf?: boolean;
  fileLocking?: boolean;
}

const DEFAULT_CONFIG: Required<PlannerConfig> = {
  cpuMultiplier: 0.75,
  maxParallel: 'auto',
  preferLeaf: true,
  fileLocking: true
};

const MAX_PARALLEL_CAP = 10;

interface PackageInfo {
  name: string;
  path: string;
  dependencies: string[];
  errorCount?: number;
  changedFiles?: number;
  estimatedTimeMs?: number;
  files?: string[];
}

// Provider interfaces
export interface WorkspaceGraphProvider {
  getPackageGraph(): Promise<Map<string, string[]>>;
}

export interface TsDiagProvider {
  collectErrors(packages: string[]): Promise<Map<string, { errorCount: number; files: string[] }>>;
}

export interface MetricsStore {
  getAverageExecutionTime(packageName: string): Promise<number>;
  recordExecution(packageName: string, durationMs: number, success: boolean): Promise<void>;
}

export interface RepoInfoProvider {
  getChangedFiles(packageName: string): Promise<string[]>;
  getChangedLines(packageName: string): Promise<number>;
}

export class HeuristicPlanner implements Planner {
  private readonly config: Required<PlannerConfig>;
  private providers?: {
    graph?: WorkspaceGraphProvider;
    diag?: TsDiagProvider;
    metrics?: MetricsStore;
    repo?: RepoInfoProvider;
  };

  constructor(
    config: PlannerConfig = {},
    providers?: {
      graph?: WorkspaceGraphProvider;
      diag?: TsDiagProvider;
      metrics?: MetricsStore;
      repo?: RepoInfoProvider;
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.providers = providers;
  }

  async createPlan(task: TaskSpec, context: AgentContext): Promise<Plan> {
    // Use providers if available, otherwise fall back to basic analysis
    let packages: PackageInfo[];

    if (this.providers?.graph) {
      packages = await this.analyzeWithProviders(context.repoDir);
    } else {
      packages = await this.analyzeWorkspace(context.repoDir);
    }

    const layers = this.topologicalSort(packages);
    const steps = await this.generateSteps(task, layers);
    const concurrencyInsight = this.calculateMaxParallel(packages);
    const maxParallel =
      this.config.maxParallel === 'auto'
        ? Math.min(MAX_PARALLEL_CAP, concurrencyInsight.parallel)
        : Math.min(this.config.maxParallel, concurrencyInsight.parallel);

    return {
      id: `${task.id}-plan`,
      task,
      steps,
      // Add hints for the execution engine
      metadata: {
        maxParallel,
        strategy: 'heuristic-v1',
        adaptiveConcurrency: concurrencyInsight
      }
    } as Plan;
  }

  private async analyzeWithProviders(repoDir: string): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];

    // Get package graph from provider
    const graph = await this.providers!.graph!.getPackageGraph();

    // Get diagnostics if available
    const diag = this.providers?.diag
      ? await this.providers.diag.collectErrors(Array.from(graph.keys()))
      : new Map();

    for (const [name, deps] of graph.entries()) {
      const diagInfo = diag.get(name);
      const metrics = this.providers?.metrics
        ? await this.providers.metrics.getAverageExecutionTime(name)
        : 5000;

      const changedFiles = this.providers?.repo
        ? (await this.providers.repo.getChangedFiles(name)).length
        : 0;

      packages.push({
        name,
        path: join(repoDir, 'packages', name.replace('@magsag/', '')),
        dependencies: deps,
        errorCount: diagInfo?.errorCount ?? 0,
        changedFiles,
        estimatedTimeMs: metrics,
        files: diagInfo?.files ?? []
      });
    }

    return packages;
  }

  private async analyzeWorkspace(repoDir: string): Promise<PackageInfo[]> {
    const packages: PackageInfo[] = [];

    try {
      // Get package list from pnpm
      const { stdout } = await execFileAsync(
        'pnpm',
        ['list', '--json', '--depth=0'],
        { cwd: repoDir }
      );

      const data = JSON.parse(stdout);

      // Extract package information
      for (const item of data) {
        if (item.name && item.path) {
          packages.push({
            name: item.name,
            path: item.path,
            dependencies: item.dependencies ? Object.keys(item.dependencies) : [],
            errorCount: 0, // Would analyze TypeScript errors here
            changedFiles: 0, // Would count git changes here
            estimatedTimeMs: 5000 // Default estimate
          });
        }
      }
    } catch (error) {
      // Fallback to simple analysis
      packages.push({
        name: 'root',
        path: repoDir,
        dependencies: [],
        errorCount: 0,
        changedFiles: 0,
        estimatedTimeMs: 10000
      });
    }

    return packages;
  }

  private topologicalSort(packages: PackageInfo[]): PackageInfo[][] {
    const layers: PackageInfo[][] = [];
    const visited = new Set<string>();
    const inDegree = new Map<string, number>();
    const packageMap = new Map<string, PackageInfo>();
    const dependents = new Map<string, PackageInfo[]>();

    // Initialize lookup tables
    for (const pkg of packages) {
      inDegree.set(pkg.name, 0);
      packageMap.set(pkg.name, pkg);
      dependents.set(pkg.name, []);
    }

    // Calculate in-degrees (number of internal dependencies) and dependents
    for (const pkg of packages) {
      for (const dep of pkg.dependencies) {
        if (!packageMap.has(dep)) {
          continue;
        }

        const current = inDegree.get(pkg.name) ?? 0;
        inDegree.set(pkg.name, current + 1);

        const dependentsList = dependents.get(dep);
        if (dependentsList) {
          dependentsList.push(pkg);
        }
      }
    }

    // Process in layers
    while (visited.size < packages.length) {
      const layer: PackageInfo[] = [];

      for (const pkg of packages) {
        if (!visited.has(pkg.name) && (inDegree.get(pkg.name) ?? 0) === 0) {
          layer.push(pkg);
          visited.add(pkg.name);
        }
      }

      if (layer.length === 0 && visited.size < packages.length) {
        // Circular dependency detected, add remaining as single layer
        for (const pkg of packages) {
          if (!visited.has(pkg.name)) {
            layer.push(pkg);
            visited.add(pkg.name);
          }
        }
      }

      if (layer.length > 0) {
        // Sort within layer by priority (smaller/faster first - WSPT)
        layer.sort((a, b) => {
          const scoreA = this.calculateScore(a);
          const scoreB = this.calculateScore(b);
          return scoreA - scoreB;
        });

        layers.push(layer);

        // Update in-degrees for next layer
        for (const pkg of layer) {
          const dependentsList = dependents.get(pkg.name) ?? [];
          for (const dependent of dependentsList) {
            const current = inDegree.get(dependent.name) ?? 0;
            if (current > 0) {
              inDegree.set(dependent.name, current - 1);
            }
          }
        }
      }
    }

    return layers;
  }

  private async generateSteps(task: TaskSpec, layers: PackageInfo[][]): Promise<PlanStep[]> {
    const planId = `${task.id}-plan`;
    const orderedLayers = this.config.preferLeaf ? [...layers].reverse() : layers;
    const orderedPackages = orderedLayers.flat();
    const packageOrder = new Map<string, number>();

    orderedPackages.forEach((pkg, index) => {
      packageOrder.set(pkg.name, index + 1);
    });

    const steps: PlanStep[] = [];

    for (const pkg of orderedPackages) {
      const stepNumber = packageOrder.get(pkg.name);
      if (!stepNumber) {
        continue;
      }

      const stepId = `${planId}-step-${stepNumber}`;

      const subtask: SubtaskSpec = {
        id: `${task.id}-subtask-${stepNumber}`,
        taskId: task.id,
        title: `Process ${pkg.name}`,
        description: `Fix TypeScript errors and improve ${pkg.name}`,
        metadata: {
          package: pkg.name,
          path: pkg.path
        }
      };

      const dependsOn: string[] = [];
      for (const dep of pkg.dependencies) {
        const depNumber = packageOrder.get(dep);
        if (depNumber) {
          dependsOn.push(`${planId}-step-${depNumber}`);
        }
      }

      const step: PlanStep & { exclusiveKeys?: string[] } = {
        id: stepId,
        subtask,
        dependsOn: dependsOn.length > 0 ? dependsOn : undefined
      };

      if (this.config.fileLocking) {
        const packageFiles = await this.getPackageFiles(pkg);
        const exclusiveKeys = this.buildExclusiveKeys(pkg, packageFiles);
        if (exclusiveKeys.length > 0) {
          step.exclusiveKeys = exclusiveKeys;
        }
      }

      steps.push(step);
    }

    return steps;
  }

  private async getPackageFiles(pkg: PackageInfo): Promise<string[]> {
    // If we have files from diagnostics provider, use those
    if (pkg.files && pkg.files.length > 0) {
      return pkg.files;
    }

    // Otherwise, try to get source files
    const files: string[] = [];
    try {
      const srcPath = join(pkg.path, 'src');
      const srcFiles = await this.listFiles(srcPath);
      files.push(...srcFiles.map(f => join(srcPath, f)));
    } catch {
      // No src directory or error reading it
    }

    return files;
  }

  private async listFiles(dir: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
          files.push(entry.name);
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  private buildExclusiveKeys(pkg: PackageInfo, files: string[]): string[] {
    const keys = new Set<string>();
    const normalizedPath = pkg.path.replace(/\\/g, '/');
    keys.add(`pkg:${pkg.name}`);
    keys.add(`dir:${normalizedPath}`);

    const addFileKey = (path: string) => {
      const formatted = path.replace(/\\/g, '/');
      keys.add(`file:${formatted}`);
      const parent = dirname(formatted);
      if (parent && parent !== '.' && parent !== formatted) {
        keys.add(`dir:${parent}`);
      }
    };

    for (const file of files) {
      addFileKey(file);
    }

    addFileKey(join(pkg.path, 'package.json'));
    addFileKey(join(pkg.path, 'tsconfig.json'));
    addFileKey(join(pkg.path, '.eslintrc.json'));

    return Array.from(keys);
  }

  private calculateMaxParallel(packages: PackageInfo[]): {
    parallel: number;
    baseParallel: number;
    cpuCount: number;
    workloadScore: number;
    adjustments: Record<string, number>;
  } {
    const cpuCount = Math.max(1, cpus().length);
    const baseParallel = Math.max(1, Math.floor(cpuCount * this.config.cpuMultiplier));
    const packageCount = Math.max(1, packages.length);
    const totalErrors = packages.reduce((sum, pkg) => sum + (pkg.errorCount ?? 0), 0);
    const totalChanges = packages.reduce((sum, pkg) => sum + (pkg.changedFiles ?? 0), 0);
    const longRunning = packages.filter((pkg) => (pkg.estimatedTimeMs ?? 0) > 15000).length;

    let adjusted = baseParallel;
    const adjustments: Record<string, number> = {};

    const workloadScore = Math.min(
      1,
      (totalErrors / 400) * 0.5 + (totalChanges / 200) * 0.3 + (longRunning / packageCount) * 0.2
    );

    if (longRunning > 0) {
      const penalty = Math.max(0.4, 1 - longRunning / packageCount);
      adjusted = Math.max(1, Math.floor(adjusted * penalty));
      adjustments.longRunningPenalty = penalty;
    }

    if (totalErrors > 200) {
      adjusted = Math.max(1, Math.floor(adjusted * 0.6));
      adjustments.errorPenalty = 0.6;
    } else if (totalErrors > 100) {
      adjusted = Math.max(1, Math.floor(adjusted * 0.8));
      adjustments.errorPenalty = 0.8;
    }

    if (totalChanges > 150) {
      adjusted = Math.max(1, Math.floor(adjusted * 0.75));
      adjustments.changePenalty = 0.75;
    }

    if (adjusted > packageCount) {
      adjustments.packageLimit = packageCount / adjusted;
      adjusted = packageCount;
    }

    if (this.config.maxParallel !== 'auto' && adjusted > this.config.maxParallel) {
      adjustments.configCap = this.config.maxParallel / adjusted;
      adjusted = this.config.maxParallel;
    }

    return {
      parallel: Math.max(1, adjusted),
      baseParallel,
      cpuCount,
      workloadScore,
      adjustments
    };
  }

  private calculateScore(pkg: PackageInfo): number {
    // Weighted Shortest Processing Time (WSPT) scoring
    const errorWeight = 0.5;
    const timeWeight = 0.3;
    const changesWeight = 0.2;

    const errorScore = (pkg.errorCount ?? 0) / 100; // Normalize
    const timeScore = (pkg.estimatedTimeMs ?? 5000) / 10000; // Normalize
    const changesScore = (pkg.changedFiles ?? 0) / 50; // Normalize

    return (
      errorWeight * errorScore +
      timeWeight * timeScore +
      changesWeight * changesScore
    );
  }
}

// Simple planner for backward compatibility
export class SimplePlanner implements Planner {
  async createPlan(task: TaskSpec, _context: AgentContext): Promise<Plan> {
    const planId = `${task.id}-plan`;
    void _context;
    return {
      id: planId,
      task,
      steps: [
        {
          id: `${planId}-step-1`,
          subtask: {
            id: `${task.id}-subtask-1`,
            taskId: task.id,
            title: task.goal,
            description: task.goal,
            acceptance: task.acceptance,
            metadata: task.metadata
          }
        }
      ]
    };
  }
}
