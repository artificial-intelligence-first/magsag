# @magsag/manager

Enhanced parallel execution planner with auto-tune and provider interfaces.

## Overview

`@magsag/manager` provides intelligent task planning and parallel execution capabilities for agent workflows. It features dependency analysis, file-level locking, dynamic concurrency adjustment, and pluggable provider interfaces.

## Key Components

### HeuristicPlanner

Intelligent task planning with:
- Dependency analysis and topological sorting
- File-level locking via `exclusiveKeys` for conflict prevention
- Cost estimation and optimization
- Task batching and parallelization

```typescript
import { HeuristicPlanner } from '@magsag/manager';

const planner = new HeuristicPlanner();
const plan = planner.createPlan({
  tasks: [
    { id: 'task1', instruction: 'Fix bug', exclusiveKeys: ['src/file.ts'] },
    { id: 'task2', instruction: 'Add test', exclusiveKeys: ['src/file.test.ts'] },
  ],
  concurrency: 4,
});
```

### AutoTune

Dynamic adjustment of parallel execution based on system metrics:
- Failure rate monitoring
- Automatic concurrency scaling
- Resource-aware scheduling
- Performance optimization

```typescript
import { AutoTune } from '@magsag/manager';

const autoTune = new AutoTune({
  initialConcurrency: 4,
  maxConcurrency: 8,
  minConcurrency: 1,
  targetFailureRate: 0.1,
});

// Adjust based on execution results
const newConcurrency = autoTune.adjust({
  failures: 2,
  successes: 8,
  avgDuration: 5000,
});
```

### Provider Interfaces

Pluggable providers for external integrations:

#### WorkspaceGraphProvider
```typescript
interface WorkspaceGraphProvider {
  getGraph(root: string): Promise<WorkspaceGraph>;
}
```

#### TypeScriptDiagnosticsProvider
```typescript
interface TypeScriptDiagnosticsProvider {
  getDiagnostics(pkgPath: string): Promise<Diagnostic[]>;
}
```

#### MetricsProvider
```typescript
interface MetricsProvider {
  recordMetric(name: string, value: number): void;
}
```

#### RepositoryInfoProvider
```typescript
interface RepositoryInfoProvider {
  getRepoInfo(root: string): Promise<RepositoryInfo>;
}
```

## Usage

### Complete Execution Example

```typescript
import { ParallelExecutor, HeuristicPlanner, AutoTune } from '@magsag/manager';

const executor = new ParallelExecutor({
  planner: new HeuristicPlanner(),
  autoTune: new AutoTune(),
  concurrency: 4,
  providers: {
    workspace: new PnpmWorkspaceProvider(),
    diagnostics: new TscDiagnosticsProvider(),
    metrics: new PrometheusMetricsProvider(),
  },
});

await executor.execute(tasks);
```

## Features

### Dependency-Aware Scheduling

The planner automatically detects task dependencies and schedules tasks in the correct order:

```typescript
const tasks = [
  { id: 'build', deps: [] },
  { id: 'test', deps: ['build'] },
  { id: 'deploy', deps: ['test'] },
];

// Execution order: build → test → deploy
```

### File-Level Locking

Prevent concurrent modifications to the same files:

```typescript
const tasks = [
  { id: 't1', exclusiveKeys: ['src/app.ts'] },
  { id: 't2', exclusiveKeys: ['src/app.ts'] }, // Will wait for t1
  { id: 't3', exclusiveKeys: ['src/utils.ts'] }, // Can run in parallel
];
```

### Dynamic Concurrency

AutoTune adjusts concurrency based on failure rates:

```typescript
// High failure rate → reduce concurrency
// Low failure rate + available resources → increase concurrency
```

## Integration with CLI

The manager is integrated into the CLI execution flow:

```bash
pnpm --filter @magsag/cli exec magsag agent exec \
  --plan plan.json \
  --concurrency 4 \
  --provider-map "claude-cli:2,codex-cli"
```

## Development

```bash
# Run tests
pnpm --filter @magsag/manager test

# Type checking
pnpm --filter @magsag/manager typecheck

# Linting
pnpm --filter @magsag/manager lint

# Build
pnpm --filter @magsag/manager build
```

## Exports

- `src/index.ts` - Main executor and orchestration
- `src/planner.ts` - HeuristicPlanner
- `src/auto-tune.ts` - AutoTune engine
- `src/providers.ts` - Provider interfaces

## Performance

Typical performance characteristics:
- Planning: <100ms for 100 tasks
- Overhead: <5% per task
- Memory: ~1MB per 1000 tasks

## License

Apache-2.0
