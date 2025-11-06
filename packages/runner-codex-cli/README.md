# @magsag/runner-codex-cli

Codex CLI runner for MAG (Multi-Agent Generator) execution.

## Overview

`@magsag/runner-codex-cli` provides integration with the Codex CLI for executing MAG agents in subscription mode. It manages process spawning, event streaming, and error handling for Codex-based workflows.

## Features

- Process-based Codex CLI execution
- Event streaming and progress tracking
- Automatic retry logic
- Timeout management
- Environment variable handling
- Working directory isolation

## Usage

```typescript
import { CodexCliRunner } from '@magsag/runner-codex-cli';

const runner = new CodexCliRunner({
  timeout: 300000, // 5 minutes
  env: {
    CODEX_API_KEY: process.env.CODEX_API_KEY,
  },
});

const events = runner.execute({
  id: 'run-123',
  taskId: 'task-456',
  instruction: 'Implement feature X',
  engine: 'mag',
  cwd: '/path/to/repo',
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

- `CODEX_API_KEY` - Codex API authentication key
- `CODEX_CLI_PATH` - Custom path to Codex CLI binary (optional)
- `CODEX_MODEL` - Model to use (default: auto-select)

### Runner Options

```typescript
const runner = new CodexCliRunner({
  timeout: 300000,
  retries: 3,
  env: {
    CODEX_API_KEY: process.env.CODEX_API_KEY,
    CODEX_MODEL: 'gpt-4',
  },
  cliPath: '/usr/local/bin/codex',
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
    message: 'Analyzing codebase...',
    progress: 0.3,
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
    output: 'Feature implemented successfully',
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

const { magRunner } = selectEngine();
// Returns CodexCliRunner when ENGINE_MAG=codex-cli
```

## CLI Integration

Automatically selected via environment variables:

```bash
export ENGINE_MAG=codex-cli
export CODEX_API_KEY=your-api-key

pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json
```

## Error Handling

The runner handles common Codex CLI errors:

- **Authentication failures** - Invalid or missing API key
- **Rate limits** - Automatic retry with backoff
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
  }
}
```

## Process Management

- Spawns isolated Codex CLI processes
- Captures stdout/stderr streams
- Handles process cleanup on exit
- Supports graceful cancellation

## Performance

- Startup overhead: ~500ms
- Event latency: <100ms
- Memory per process: ~50-100MB

## Development

```bash
# Run tests
pnpm --filter @magsag/runner-codex-cli test

# Type checking
pnpm --filter @magsag/runner-codex-cli typecheck

# Linting
pnpm --filter @magsag/runner-codex-cli lint

# Build
pnpm --filter @magsag/runner-codex-cli build
```

## Dependencies

- `@magsag/core` - Runner interfaces
- `execa` - Process execution (optional)

## License

Apache-2.0
