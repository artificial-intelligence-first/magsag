# @magsag/runner-claude-cli

Claude CLI runner for SAG (Specialized Agent) execution.

## Overview

`@magsag/runner-claude-cli` provides integration with the Claude CLI for executing SAG agents in subscription mode. It manages process spawning, event streaming, and error handling for Claude-based workflows.

## Features

- Process-based Claude CLI execution
- Event streaming and progress tracking
- Automatic retry logic
- Timeout management
- Environment variable handling
- Working directory isolation

## Usage

```typescript
import { ClaudeCliRunner } from '@magsag/runner-claude-cli';

const runner = new ClaudeCliRunner({
  timeout: 300000, // 5 minutes
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  },
});

const events = runner.execute({
  id: 'run-123',
  taskId: 'task-456',
  instruction: 'Refactor authentication module',
  engine: 'sag',
  cwd: '/path/to/worktree',
});

for await (const event of events) {
  console.log(event);
  // { type: 'start', timestamp: '...', ... }
  // { type: 'progress', data: { message: '...', progress: 0.5 }, ... }
  // { type: 'complete', data: { status: 'success' }, ... }
}
```

## Configuration

### Environment Variables

- `ANTHROPIC_API_KEY` - Anthropic API authentication key
- `CLAUDE_CLI_PATH` - Custom path to Claude CLI binary (optional)
- `CLAUDE_MODEL` - Model to use (default: auto-select)

### Runner Options

```typescript
const runner = new ClaudeCliRunner({
  timeout: 300000,
  retries: 3,
  env: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CLAUDE_MODEL: 'claude-3-opus-20240229',
  },
  cliPath: '/usr/local/bin/claude',
});
```

## Event Types

### Start Event
```typescript
{
  type: 'start',
  timestamp: '2025-11-06T08:00:00Z',
  runId: 'run-123',
}
```

### Progress Event
```typescript
{
  type: 'progress',
  timestamp: '2025-11-06T08:00:05Z',
  runId: 'run-123',
  data: {
    message: 'Analyzing code structure...',
    progress: 0.4,
  },
}
```

### Complete Event
```typescript
{
  type: 'complete',
  timestamp: '2025-11-06T08:05:00Z',
  runId: 'run-123',
  data: {
    status: 'success',
    output: 'Refactoring complete',
    filesModified: ['src/auth.ts', 'tests/auth.test.ts'],
  },
}
```

### Error Event
```typescript
{
  type: 'error',
  timestamp: '2025-11-06T08:02:00Z',
  runId: 'run-123',
  error: {
    message: 'Execution failed',
    code: 'EXECUTION_ERROR',
  },
}
```

## Integration with Core

This runner implements the `EngineRunner` interface from `@magsag/core`:

```typescript
import { selectEngine } from '@magsag/core';

const { sagRunner } = selectEngine();
// Returns ClaudeCliRunner when ENGINE_SAG=claude-cli
```

## CLI Integration

Automatically selected via environment variables:

```bash
export ENGINE_SAG=claude-cli
export ANTHROPIC_API_KEY=your-api-key

pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json
```

## Worktree Isolation

Claude CLI runner is typically used with Git worktrees for isolated execution:

```typescript
import { WorktreeManager } from '@magsag/worktree';
import { ClaudeCliRunner } from '@magsag/runner-claude-cli';

const worktreeManager = new WorktreeManager({ /* ... */ });
const runner = new ClaudeCliRunner();

// Create isolated worktree
const worktree = await worktreeManager.create({
  branch: 'sag-task-123',
  baseBranch: 'main',
});

// Execute in worktree
const events = runner.execute({
  instruction: 'Implement feature',
  cwd: worktree.path,
  engine: 'sag',
});

for await (const event of events) {
  // Handle events
}

// Cleanup
await worktreeManager.remove(worktree.id);
```

## Error Handling

The runner handles common Claude CLI errors:

- **Authentication failures** - Invalid or missing API key
- **Rate limits** - Automatic retry with exponential backoff
- **Timeouts** - Configurable timeout with cleanup
- **Process errors** - Graceful error reporting

```typescript
try {
  for await (const event of runner.execute(spec)) {
    // Handle events
  }
} catch (error) {
  if (error.code === 'TIMEOUT') {
    console.error('Execution timed out');
  } else if (error.code === 'AUTH_ERROR') {
    console.error('Authentication failed');
  } else if (error.code === 'RATE_LIMIT') {
    console.error('Rate limit exceeded');
  }
}
```

## Process Management

- Spawns isolated Claude CLI processes
- Captures stdout/stderr streams
- Handles process cleanup on exit
- Supports graceful cancellation
- Signal handling (SIGINT, SIGTERM)

## Performance

- Startup overhead: ~500ms
- Event latency: <100ms
- Memory per process: ~50-100MB

## Development

```bash
# Run tests
pnpm --filter @magsag/runner-claude-cli test

# Type checking
pnpm --filter @magsag/runner-claude-cli typecheck

# Linting
pnpm --filter @magsag/runner-claude-cli lint

# Build
pnpm --filter @magsag/runner-claude-cli build
```

## Dependencies

- `@magsag/core` - Runner interfaces
- `execa` - Process execution (optional)

## License

Apache-2.0
