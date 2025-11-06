# @magsag/runner-adk

Google Agent Development Kit (ADK) runner for both MAG and SAG execution.

## Overview

`@magsag/runner-adk` provides integration with Google's Agent Development Kit for executing both MAG and SAG agents. It supports the ADK's agent framework with multi-modal inputs, tool use, and streaming responses.

## Features

- Google ADK integration
- Support for both MAG and SAG engines
- Multi-modal input support (text, images, etc.)
- Tool calling and execution
- Streaming response support
- Automatic retry logic
- Token usage tracking

## Usage

```typescript
import { ADKRunner } from '@magsag/runner-adk';

const runner = new ADKRunner({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-pro',
  timeout: 300000,
});

const events = runner.execute({
  id: 'run-123',
  taskId: 'task-456',
  instruction: 'Generate API documentation',
  engine: 'mag', // or 'sag'
});

for await (const event of events) {
  console.log(event);
  // { type: 'start', ... }
  // { type: 'progress', data: { message: '...', tokens: 150 }, ... }
  // { type: 'complete', data: { output: '...', totalTokens: 1200 }, ... }
}
```

## Configuration

### Environment Variables

- `GOOGLE_API_KEY` - Google API key (required)
- `ADK_MODEL` - Model to use (default: 'gemini-pro')
- `GOOGLE_PROJECT_ID` - GCP project ID (optional)

### Runner Options

```typescript
const runner = new ADKRunner({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-pro',
  temperature: 0.8,
  maxTokens: 2048,
  timeout: 300000,
  streaming: true,
  safetySettings: {
    // Configure safety filters
  },
});
```

## Supported Models

- `gemini-pro` - Best for text-only tasks
- `gemini-pro-vision` - Supports multi-modal inputs
- `gemini-ultra` - Most capable model (when available)
- Custom fine-tuned models

## Event Types

### Start Event
```typescript
{
  type: 'start',
  timestamp: '2025-11-06T08:00:00Z',
  runId: 'run-123',
  data: {
    model: 'gemini-pro',
    engine: 'mag',
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
    message: 'Generating documentation...',
    progress: 0.5,
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
    output: 'Documentation generated',
    totalTokens: 1200,
    inputTokens: 400,
    outputTokens: 800,
  },
}
```

## Multi-Modal Support

ADK runner supports multi-modal inputs:

```typescript
const runner = new ADKRunner({
  model: 'gemini-pro-vision',
});

const events = runner.execute({
  instruction: 'Analyze this UI screenshot and suggest improvements',
  inputs: [
    { type: 'text', content: 'Analyze the layout' },
    { type: 'image', url: 'https://example.com/screenshot.png' },
  ],
  engine: 'mag',
});
```

## Tool Integration

Define custom tools:

```typescript
const runner = new ADKRunner({
  tools: [
    {
      name: 'execute_query',
      description: 'Execute database query',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          database: { type: 'string' },
        },
        required: ['query'],
      },
    },
  ],
  toolHandler: async (toolName, params) => {
    if (toolName === 'execute_query') {
      const result = await db.query(params.query);
      return result;
    }
  },
});
```

## Streaming Support

Enable streaming for real-time updates:

```typescript
const runner = new ADKRunner({
  streaming: true,
});

for await (const event of runner.execute(spec)) {
  if (event.type === 'progress') {
    console.log(event.data.message);
  }
}
```

## Integration with Core

Implements the `EngineRunner` interface for both MAG and SAG:

```typescript
import { selectEngine } from '@magsag/core';

// For MAG
// Set ENGINE_MAG=adk
const { magRunner } = selectEngine();

// For SAG
// Set ENGINE_SAG=adk
const { sagRunner } = selectEngine();
```

## CLI Integration

```bash
# Use ADK for both MAG and SAG
export ENGINE_MODE=api
export ENGINE_MAG=adk
export ENGINE_SAG=adk
export GOOGLE_API_KEY=your-api-key

pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json
```

## Safety Settings

Configure content safety filters:

```typescript
const runner = new ADKRunner({
  safetySettings: {
    HARM_CATEGORY_HARASSMENT: 'BLOCK_MEDIUM_AND_ABOVE',
    HARM_CATEGORY_HATE_SPEECH: 'BLOCK_MEDIUM_AND_ABOVE',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'BLOCK_MEDIUM_AND_ABOVE',
    HARM_CATEGORY_DANGEROUS_CONTENT: 'BLOCK_MEDIUM_AND_ABOVE',
  },
});
```

## Error Handling

Handles ADK API errors:

- **Rate limits** - Automatic retry with backoff
- **Authentication** - Clear error messages
- **Token limits** - Graceful handling
- **Safety filters** - Blocked content handling

```typescript
try {
  for await (const event of runner.execute(spec)) {
    // Handle events
  }
} catch (error) {
  if (error.code === 'RATE_LIMIT_EXCEEDED') {
    console.error('Rate limit exceeded');
  } else if (error.code === 'SAFETY_ERROR') {
    console.error('Content blocked by safety filters');
  }
}
```

## Token Management

Track token usage:

```typescript
const events = runner.execute(spec);
let totalTokens = 0;

for await (const event of events) {
  if (event.type === 'complete') {
    totalTokens = event.data.totalTokens;
    console.log(`Tokens used: ${totalTokens}`);
  }
}
```

## Performance

- API latency: ~800ms-2s for first token
- Streaming latency: ~40-80ms per token
- Typical token rate: ~25-40 tokens/second

## Cost Optimization

```typescript
const runner = new ADKRunner({
  model: 'gemini-pro', // Cost-effective
  maxTokens: 1024, // Limit output
  temperature: 0.7,
});
```

## Development

```bash
# Run tests
pnpm --filter @magsag/runner-adk test

# Type checking
pnpm --filter @magsag/runner-adk typecheck

# Linting
pnpm --filter @magsag/runner-adk lint

# Build
pnpm --filter @magsag/runner-adk build
```

## Dependencies

- `@magsag/core` - Runner interfaces
- `@google-cloud/aiplatform` - Google AI Platform SDK (optional peer dependency)

## License

Apache-2.0
