# @magsag/core

Core engine contracts, runner interfaces, and selection helpers for the MAGSAG framework.

## Overview

`@magsag/core` provides the foundational types, interfaces, and utilities that power the MAGSAG agent execution system. It defines contracts for engine runners, workspace management, and resource monitoring.

## Key Components

### Runner Interfaces

- **EngineRunner** - Base interface for all agent execution engines (MAG/SAG)
- **RunnerEvent** - Event types emitted during agent execution
- **RunSpec** - Specification for agent execution runs

### Engine Selection

- **selectEngine()** - Resolves MAG/SAG runners based on environment variables
- **listEngines()** - Enumerates available execution engines

Environment variables:
- `ENGINE_MODE` - Controls subscription vs API engines (`auto|subscription|api|oss`)
- `ENGINE_MAG` - Selects MAG runner (`codex-cli|openai-agents|adk`)
- `ENGINE_SAG` - Selects SAG runner (`claude-cli|claude-agent|adk`)

### Workspace Management

- **ExecutionWorkspace** - Manages isolated execution environments for agents
- **WorkspaceLogger** - Provides logging within workspace contexts
- **WorkspaceGraph** - Represents dependency graphs for workspaces

### Resource Monitoring

- **ResourceMonitor** - Tracks CPU, memory, and system resource usage
- Uses `pidusage` for cross-platform process monitoring

## Usage

```typescript
import { selectEngine, ExecutionWorkspace, ResourceMonitor } from '@magsag/core';

// Select engines based on environment
const { magRunner, sagRunner } = selectEngine();

// Create an execution workspace
const workspace = await ExecutionWorkspace.create({
  root: '/path/to/repo',
  logger: console.log,
});

// Monitor resource usage
const monitor = new ResourceMonitor();
const usage = await monitor.getUsage(process.pid);
console.log(`CPU: ${usage.cpu}%, Memory: ${usage.memory} MB`);
```

## Types

### RunSpec
```typescript
interface RunSpec {
  id: string;
  taskId: string;
  instruction: string;
  engine: 'mag' | 'sag';
  worktreePath?: string;
  // ... additional fields
}
```

### RunnerEvent
```typescript
interface RunnerEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  timestamp: string;
  data: unknown;
}
```

## Dependencies

- `@magsag/shared-logging` - Logging utilities
- `pidusage` - Process resource usage monitoring

## Development

```bash
# Type checking
pnpm --filter @magsag/core typecheck

# Linting
pnpm --filter @magsag/core lint

# Build
pnpm --filter @magsag/core build
```

## Architecture

This package follows a provider pattern, allowing different implementations of engine runners to be swapped in based on configuration. The workspace abstraction provides isolation and resource management for concurrent agent execution.

## License

Apache-2.0
