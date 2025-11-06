# @magsag/mcp-client

Model Context Protocol (MCP) transport layer and client utilities.

## Overview

`@magsag/mcp-client` provides a robust client implementation for communicating with MCP servers. It supports multiple transport protocols (HTTP, SSE, stdio), circuit breaker patterns, and automatic retries.

## Key Components

### MCPClient

Main client interface for MCP communication:

```typescript
import { MCPClient } from '@magsag/mcp-client';

const client = new MCPClient({
  transport: 'http',
  endpoint: 'http://localhost:3000',
  timeout: 30000,
  retries: 3,
});

// Initialize connection
await client.connect();

// List available tools
const tools = await client.listTools();
console.log(tools);

// Call a tool
const result = await client.callTool('search', {
  query: 'TypeScript best practices',
  limit: 10,
});

// Disconnect
await client.disconnect();
```

## Supported Transports

### HTTP Transport

Standard HTTP request-response:

```typescript
const client = new MCPClient({
  transport: 'http',
  endpoint: 'http://localhost:3000',
  headers: {
    'Authorization': 'Bearer token',
  },
});
```

### Server-Sent Events (SSE)

For streaming responses:

```typescript
const client = new MCPClient({
  transport: 'sse',
  endpoint: 'http://localhost:3000/stream',
});

client.on('message', (event) => {
  console.log('Received:', event.data);
});
```

### Stdio Transport

For local process communication:

```typescript
const client = new MCPClient({
  transport: 'stdio',
  command: 'node',
  args: ['./mcp-server.js'],
});
```

## Features

### Circuit Breaker

Automatic circuit breaking on repeated failures:

```typescript
const client = new MCPClient({
  endpoint: 'http://localhost:3000',
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeout: 30000,
  },
});

// Circuit opens after 5 consecutive failures
// Automatically resets after 30 seconds
```

### Automatic Retries

Configurable retry logic with exponential backoff:

```typescript
const client = new MCPClient({
  endpoint: 'http://localhost:3000',
  retries: 3,
  retryDelay: 1000,
  retryBackoff: 2,
});

// Retry delays: 1s, 2s, 4s
```

### Connection Pooling

Efficient connection reuse:

```typescript
const client = new MCPClient({
  endpoint: 'http://localhost:3000',
  pool: {
    maxConnections: 10,
    idleTimeout: 60000,
  },
});
```

### Timeout Management

Configurable timeouts at multiple levels:

```typescript
const client = new MCPClient({
  endpoint: 'http://localhost:3000',
  timeout: 30000, // Global timeout
  toolTimeout: {
    'slow-tool': 60000, // Per-tool override
  },
});
```

## MCP Protocol Methods

### List Tools

```typescript
const tools = await client.listTools();
// [
//   { name: 'search', description: 'Search for information', schema: {...} },
//   { name: 'analyze', description: 'Analyze data', schema: {...} }
// ]
```

### Call Tool

```typescript
const result = await client.callTool('search', {
  query: 'example',
  options: { limit: 10 },
});
```

### List Resources

```typescript
const resources = await client.listResources();
// [
//   { uri: 'file:///data/example.txt', mimeType: 'text/plain' },
//   { uri: 'db://users/123', mimeType: 'application/json' }
// ]
```

### Read Resource

```typescript
const content = await client.readResource('file:///data/example.txt');
console.log(content);
```

### List Prompts

```typescript
const prompts = await client.listPrompts();
// [
//   { name: 'analyze-code', description: 'Analyze code quality' },
//   { name: 'generate-tests', description: 'Generate unit tests' }
// ]
```

### Get Prompt

```typescript
const prompt = await client.getPrompt('analyze-code', {
  language: 'typescript',
  file: 'src/app.ts',
});
```

## Error Handling

```typescript
import { MCPClient, MCPError, TransportError, TimeoutError } from '@magsag/mcp-client';

try {
  const result = await client.callTool('tool', params);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error('Request timed out');
  } else if (error instanceof TransportError) {
    console.error('Transport error:', error.message);
  } else if (error instanceof MCPError) {
    console.error('MCP error:', error.code, error.message);
  }
}
```

## Integration with CLI

MCP client is used throughout the CLI:

```bash
# List MCP servers
pnpm --filter @magsag/cli exec magsag mcp:ls

# Test MCP server configuration
pnpm --filter @magsag/cli exec magsag mcp:doctor
```

## Configuration

MCP server configuration is stored in `mcp.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"],
      "transport": "stdio"
    },
    "github": {
      "endpoint": "http://localhost:3000",
      "transport": "http",
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

## Development

```bash
# Run tests
pnpm --filter @magsag/mcp-client test

# Type checking
pnpm --filter @magsag/mcp-client typecheck

# Linting
pnpm --filter @magsag/mcp-client lint

# Build
pnpm --filter @magsag/mcp-client build
```

## Performance

- Connection establishment: ~50ms
- Tool call overhead: ~10ms
- Streaming latency: ~1ms

## Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol definitions
- `ws` - WebSocket support (optional)

## License

Apache-2.0
