# @magsag/runner-claude-agent

Claude Agent SDK runner for SAG execution in API mode.

## Overview

`@magsag/runner-claude-agent` provides integration with Anthropic's Claude Agent SDK for executing SAG agents via the Claude API. It supports tool use, multi-turn conversations, and streaming responses.

## Features

- Claude Agent SDK integration
- Streaming response support
- Tool calling and execution
- Multi-turn conversation handling
- Automatic retry with rate limit handling
- Token usage tracking
- Extended context window support

## Usage

```typescript
import { ClaudeAgentRunner } from '@magsag/runner-claude-agent';

const runner = new ClaudeAgentRunner({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-opus-20240229',
  timeout: 300000,
});

const events = runner.execute({
  id: 'run-123',
  taskId: 'task-456',
  instruction: 'Refactor caching layer with error handling',
  engine: 'sag',
  cwd: '/path/to/worktree',
});

for await (const event of events) {
  console.log(event);
  // { type: 'start', ... }
  // { type: 'progress', data: { message: '...', tokens: 200 }, ... }
  // { type: 'complete', data: { output: '...', totalTokens: 2000 }, ... }
}
```

## Configuration

### Environment Variables

- `ANTHROPIC_API_KEY` - Anthropic API key (required)
- `CLAUDE_MODEL` - Model to use (default: 'claude-3-opus-20240229')
- `CLAUDE_BASE_URL` - Custom API endpoint (optional)

### Runner Options

```typescript
const runner = new ClaudeAgentRunner({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-opus-20240229',
  maxTokens: 4096,
  temperature: 1.0,
  timeout: 300000,
  streaming: true,
  tools: [
    { name: 'search', description: 'Search codebase' },
    { name: 'analyze', description: 'Analyze code structure' },
  ],
});
```

## Supported Models

- `claude-3-opus-20240229` - Most capable model
- `claude-3-sonnet-20240229` - Balanced performance
- `claude-3-haiku-20240307` - Fast and cost-effective
- `claude-2.1` - Legacy model

## Event Types

### Start Event
```typescript
{
  type: 'start',
  timestamp: '2025-11-06T08:00:00Z',
  runId: 'run-123',
  data: {
    model: 'claude-3-opus-20240229',
  },
}
```

### Progress Event
```typescript
{
  type: 'progress',
  timestamp: '2025-11-06T08:00:05Z',
  runId: 'run-123',
  data: {
    message: 'Refactoring in progress...',
    progress: 0.4,
    tokens: 200,
    thinking: 'Analyzing current implementation...',
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
    totalTokens: 2000,
    inputTokens: 800,
    outputTokens: 1200,
    filesModified: ['src/cache.ts', 'tests/cache.test.ts'],
  },
}
```

## Tool Integration

Define custom tools for agent use:

```typescript
const runner = new ClaudeAgentRunner({
  tools: [
    {
      name: 'run_tests',
      description: 'Execute test suite',
      input_schema: {
        type: 'object',
        properties: {
          testPath: { type: 'string' },
          coverage: { type: 'boolean' },
        },
        required: ['testPath'],
      },
    },
  ],
  toolHandler: async (toolName, input) => {
    if (toolName === 'run_tests') {
      const result = await runTests(input.testPath);
      return { result };
    }
  },
});
```

## Streaming Support

Enable streaming for real-time progress:

```typescript
const runner = new ClaudeAgentRunner({
  streaming: true,
});

for await (const event of runner.execute(spec)) {
  if (event.type === 'progress') {
    // Real-time updates including thinking process
    console.log('Thinking:', event.data.thinking);
    console.log('Message:', event.data.message);
  }
}
```

## Extended Context

Claude models support extended context windows:

```typescript
const runner = new ClaudeAgentRunner({
  model: 'claude-3-opus-20240229',
  maxTokens: 4096,
  // Opus supports up to 200K context
});
```

## Integration with Core

Implements the `EngineRunner` interface:

```typescript
import { selectEngine } from '@magsag/core';

// Set ENGINE_SAG=claude-agent
const { sagRunner } = selectEngine();
// Returns ClaudeAgentRunner
```

## CLI Integration

```bash
export ENGINE_MODE=api
export ENGINE_SAG=claude-agent
export ANTHROPIC_API_KEY=your-api-key

pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json
```

## Worktree Integration

Typically used with Git worktrees:

```typescript
import { WorktreeManager } from '@magsag/worktree';
import { ClaudeAgentRunner } from '@magsag/runner-claude-agent';

const worktreeManager = new WorktreeManager({ /* ... */ });
const runner = new ClaudeAgentRunner({ /* ... */ });

const worktree = await worktreeManager.create({
  branch: 'sag-task-123',
});

const events = runner.execute({
  instruction: 'Implement feature',
  cwd: worktree.path,
  engine: 'sag',
});

for await (const event of events) {
  // Handle events
}

await worktreeManager.remove(worktree.id);
```

## Error Handling

Handles Claude API errors:

- **Rate limits** - Automatic retry with exponential backoff
- **Authentication** - Clear error messages
- **Token limits** - Graceful handling
- **API errors** - Detailed error reporting

```typescript
try {
  for await (const event of runner.execute(spec)) {
    // Handle events
  }
} catch (error) {
  if (error.type === 'rate_limit_error') {
    console.error('Rate limit exceeded');
  } else if (error.type === 'invalid_request_error') {
    console.error('Invalid request:', error.message);
  }
}
```

## Token Management

Tracks token usage:

```typescript
const events = runner.execute(spec);
let totalTokens = 0;

for await (const event of events) {
  if (event.type === 'complete') {
    totalTokens = event.data.totalTokens;
    console.log(`Tokens: ${totalTokens}`);
  }
}
```

## Performance

- API latency: ~500ms-2s for first token
- Streaming latency: ~30-60ms per token
- Typical token rate: ~30-50 tokens/second

## Cost Optimization

```typescript
const runner = new ClaudeAgentRunner({
  model: 'claude-3-haiku-20240307', // Lower cost
  maxTokens: 2048, // Limit output
});
```

## Development

```bash
# Run tests
pnpm --filter @magsag/runner-claude-agent test

# Type checking
pnpm --filter @magsag/runner-claude-agent typecheck

# Linting
pnpm --filter @magsag/runner-claude-agent lint

# Build
pnpm --filter @magsag/runner-claude-agent build
```

## Dependencies

- `@magsag/core` - Runner interfaces
- `@anthropic-ai/sdk` - Anthropic SDK (optional peer dependency)

## License

Apache-2.0
