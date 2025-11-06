# @magsag/runner-openai-agents

OpenAI Agents runner for MAG execution in API mode.

## Overview

`@magsag/runner-openai-agents` provides integration with OpenAI's Agents API for executing MAG agents. It supports the OpenAI Agents SDK with streaming, tool use, and multi-turn conversations.

## Features

- OpenAI Agents API integration
- Streaming response support
- Tool calling and function execution
- Multi-turn conversation handling
- Automatic retry with rate limit handling
- Token usage tracking

## Usage

```typescript
import { OpenAIAgentsRunner } from '@magsag/runner-openai-agents';

const runner = new OpenAIAgentsRunner({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo-preview',
  timeout: 300000,
});

const events = runner.execute({
  id: 'run-123',
  taskId: 'task-456',
  instruction: 'Generate test suite for authentication module',
  engine: 'mag',
});

for await (const event of events) {
  console.log(event);
  // { type: 'start', ... }
  // { type: 'progress', data: { message: '...', tokens: 150 }, ... }
  // { type: 'complete', data: { output: '...', totalTokens: 1500 }, ... }
}
```

## Configuration

### Environment Variables

- `OPENAI_API_KEY` - OpenAI API key (required)
- `OPENAI_MODEL` - Model to use (default: 'gpt-4-turbo-preview')
- `OPENAI_BASE_URL` - Custom API endpoint (optional)
- `OPENAI_ORG_ID` - Organization ID (optional)

### Runner Options

```typescript
const runner = new OpenAIAgentsRunner({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4-turbo-preview',
  temperature: 0.7,
  maxTokens: 4096,
  timeout: 300000,
  streaming: true,
  tools: [
    { name: 'search', description: 'Search for information' },
    { name: 'analyze', description: 'Analyze code' },
  ],
});
```

## Supported Models

- `gpt-4-turbo-preview` - Latest GPT-4 Turbo
- `gpt-4` - GPT-4
- `gpt-3.5-turbo` - GPT-3.5 Turbo
- Custom fine-tuned models

## Event Types

### Start Event
```typescript
{
  type: 'start',
  timestamp: '2025-11-06T08:00:00Z',
  runId: 'run-123',
  data: {
    model: 'gpt-4-turbo-preview',
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
    message: 'Analyzing requirements...',
    progress: 0.3,
    tokens: 150,
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
    output: 'Test suite generated',
    totalTokens: 1500,
    promptTokens: 500,
    completionTokens: 1000,
  },
}
```

## Tool Integration

Define custom tools for agent use:

```typescript
const runner = new OpenAIAgentsRunner({
  tools: [
    {
      name: 'execute_tests',
      description: 'Execute test suite and return results',
      parameters: {
        type: 'object',
        properties: {
          testPath: { type: 'string' },
          coverage: { type: 'boolean' },
        },
        required: ['testPath'],
      },
    },
  ],
  toolHandler: async (toolName, params) => {
    if (toolName === 'execute_tests') {
      // Execute tests
      const result = await runTests(params.testPath);
      return JSON.stringify(result);
    }
  },
});
```

## Streaming Support

Enable streaming for real-time progress:

```typescript
const runner = new OpenAIAgentsRunner({
  streaming: true,
});

for await (const event of runner.execute(spec)) {
  if (event.type === 'progress') {
    // Real-time progress updates
    console.log(event.data.message);
  }
}
```

## Integration with Core

Implements the `EngineRunner` interface:

```typescript
import { selectEngine } from '@magsag/core';

// Set ENGINE_MAG=openai-agents
const { magRunner } = selectEngine();
// Returns OpenAIAgentsRunner
```

## CLI Integration

```bash
export ENGINE_MODE=api
export ENGINE_MAG=openai-agents
export OPENAI_API_KEY=your-api-key

pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json
```

## Error Handling

Handles OpenAI API errors:

- **Rate limits** - Automatic retry with exponential backoff
- **Authentication** - Clear error messages
- **Token limits** - Graceful handling and truncation
- **API errors** - Detailed error reporting

```typescript
try {
  for await (const event of runner.execute(spec)) {
    // Handle events
  }
} catch (error) {
  if (error.code === 'rate_limit_exceeded') {
    console.error('Rate limit exceeded, retry in:', error.retryAfter);
  } else if (error.code === 'invalid_api_key') {
    console.error('Invalid API key');
  }
}
```

## Token Management

Tracks token usage:

```typescript
const events = runner.execute(spec);
let totalTokens = 0;

for await (const event of events) {
  if (event.type === 'progress' && event.data.tokens) {
    totalTokens += event.data.tokens;
  }
}

console.log(`Total tokens used: ${totalTokens}`);
```

## Performance

- API latency: ~1-3 seconds for first token
- Streaming latency: ~50-100ms per token
- Typical token rate: ~20-40 tokens/second

## Cost Optimization

```typescript
const runner = new OpenAIAgentsRunner({
  model: 'gpt-3.5-turbo', // Lower cost
  maxTokens: 2048, // Limit output
  temperature: 0.7, // Reduce variability
});
```

## Development

```bash
# Run tests
pnpm --filter @magsag/runner-openai-agents test

# Type checking
pnpm --filter @magsag/runner-openai-agents typecheck

# Linting
pnpm --filter @magsag/runner-openai-agents lint

# Build
pnpm --filter @magsag/runner-openai-agents build
```

## Dependencies

- `@magsag/core` - Runner interfaces
- `openai` - OpenAI SDK (optional peer dependency)

## License

Apache-2.0
