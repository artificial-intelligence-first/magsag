# @magsag/worktree

Git worktree management with JSON-based state persistence and lifecycle tracking.

## Overview

`@magsag/worktree` provides programmatic management of Git worktrees for isolated agent execution environments. It handles creation, tracking, cleanup, and garbage collection of worktrees with persistent state management.

## Key Components

### WorktreeManager

Main interface for worktree lifecycle management:

```typescript
import { WorktreeManager } from '@magsag/worktree';

const manager = new WorktreeManager({
  repoRoot: '/path/to/repo',
  worktreeRoot: '/path/to/worktrees',
  stateFile: '.magsag/worktrees.json',
});

// Create a new worktree
const worktree = await manager.create({
  branch: 'feature-123',
  baseBranch: 'main',
});

// List active worktrees
const worktrees = await manager.list();

// Clean up a worktree
await manager.remove(worktree.id);

// Garbage collect expired worktrees
await manager.gc({ ttl: 3600 }); // 1 hour TTL
```

## Features

### State Persistence

Worktree metadata is persisted to JSON:

```json
{
  "worktrees": [
    {
      "id": "wt-abc123",
      "path": "/tmp/worktrees/feature-123",
      "branch": "feature-123",
      "baseBranch": "main",
      "createdAt": "2025-11-06T08:00:00Z",
      "lastAccessedAt": "2025-11-06T08:30:00Z",
      "status": "active"
    }
  ]
}
```

### Lifecycle Management

- **create()** - Create new worktree with branch
- **list()** - List all tracked worktrees
- **get()** - Get worktree by ID
- **remove()** - Clean up worktree and update state
- **gc()** - Garbage collect expired worktrees

### Automatic Cleanup

Garbage collection removes worktrees based on:
- Time-to-live (TTL)
- Last accessed timestamp
- Orphaned worktrees (no state entry)

```typescript
// Remove worktrees older than 1 hour
await manager.gc({ ttl: 3600 });

// Remove all inactive worktrees
await manager.gc({ ttl: 0 });
```

## Integration with CLI

Worktree management is integrated into the CLI:

```bash
# List active worktrees
pnpm --filter @magsag/cli exec magsag worktrees:ls

# Garbage collect with 1-hour TTL
pnpm --filter @magsag/cli exec magsag worktrees:gc --ttl 3600
```

## Usage Patterns

### SAG Execution in Isolated Worktrees

```typescript
import { WorktreeManager } from '@magsag/worktree';
import { selectEngine } from '@magsag/core';

const manager = new WorktreeManager({ /* ... */ });
const { sagRunner } = selectEngine();

// Create isolated worktree for SAG
const worktree = await manager.create({
  branch: `sag-task-${taskId}`,
  baseBranch: 'main',
});

try {
  // Execute SAG in worktree
  await sagRunner.execute({
    instruction: 'Implement feature',
    worktreePath: worktree.path,
  });
} finally {
  // Cleanup
  await manager.remove(worktree.id);
}
```

### Concurrent Worktree Allocation

```typescript
// Allocate worktrees for parallel execution
const worktrees = await Promise.all(
  tasks.map(task => manager.create({
    branch: `task-${task.id}`,
    baseBranch: task.baseBranch || 'main',
  }))
);

// Execute tasks in parallel
await Promise.allSettled(
  tasks.map((task, i) => executeInWorktree(task, worktrees[i]))
);

// Cleanup all worktrees
await Promise.all(
  worktrees.map(wt => manager.remove(wt.id))
);
```

## State File Location

Default state file: `.magsag/worktrees.json`

The state file tracks:
- Active worktrees
- Creation and access timestamps
- Branch associations
- Cleanup status

## Error Handling

The manager handles common Git errors:
- Branch conflicts
- Directory permission issues
- Orphaned worktrees
- State file corruption

## Development

```bash
# Run tests
pnpm --filter @magsag/worktree test

# Type checking
pnpm --filter @magsag/worktree typecheck

# Linting
pnpm --filter @magsag/worktree lint

# Build
pnpm --filter @magsag/worktree build
```

## Exports

- `src/index.ts` - WorktreeManager and core types
- `src/manager.ts` - Manager implementation

## Performance

- Creation: ~500ms per worktree
- Removal: ~200ms per worktree
- GC: O(n) where n = number of worktrees

## License

Apache-2.0
