# @magsag/mcp-server

MCP server façade exposing MAGSAG catalog and governance capabilities.

## Overview

`@magsag/mcp-server` provides a Model Context Protocol (MCP) server implementation that exposes MAGSAG's catalog of agents, skills, policies, and contracts as MCP tools and resources.

**Status**: Work in Progress (WIP)

## Key Components

### MCPServer

Main server implementation:

```typescript
import { MCPServer } from '@magsag/mcp-server';

const server = new MCPServer({
  catalogRoot: './catalog',
  policiesRoot: './catalog/policies',
  port: 3000,
  idleTimeout: 300000, // 5 minutes
});

await server.start();
console.log('MCP server listening on port 3000');
```

## Features

### Catalog Exposure

Exposes the MAGSAG catalog as MCP resources:

- **Agents**: `/agents/*` - Available agent definitions
- **Skills**: `/skills/*` - Reusable skill modules
- **Policies**: `/policies/*` - Governance policies
- **Contracts**: `/contracts/*` - Agent contracts

### Tool Definitions

Provides MCP tools for:
- Listing available agents
- Querying agent capabilities
- Validating policy compliance
- Fetching contract specifications

### Resource Management

MCP resources map to catalog entities:

```typescript
// List resources
const resources = await client.listResources();
// [
//   { uri: 'catalog://agents/code-reviewer', mimeType: 'application/json' },
//   { uri: 'catalog://skills/test-runner', mimeType: 'application/json' },
//   { uri: 'catalog://policies/security-gate', mimeType: 'application/yaml' }
// ]

// Read resource
const agent = await client.readResource('catalog://agents/code-reviewer');
```

## Server Configuration

### Environment Variables

- `MCP_SERVER_PORT` - Server port (default: 3000)
- `MCP_CATALOG_ROOT` - Catalog directory (default: './catalog')
- `MCP_IDLE_TIMEOUT` - Idle connection timeout in ms (default: 300000)
- `MCP_CLEANUP_INTERVAL` - Cleanup interval in ms (default: 60000)

### Programmatic Configuration

```typescript
const server = new MCPServer({
  catalogRoot: process.env.MCP_CATALOG_ROOT || './catalog',
  port: parseInt(process.env.MCP_SERVER_PORT || '3000'),
  idleTimeout: 5 * 60_000, // 5 minutes
  cleanupInterval: 60_000, // 1 minute
  auth: {
    enabled: true,
    apiKey: process.env.MCP_API_KEY,
  },
});
```

## Usage

### Starting the Server

```bash
# Start MCP server
pnpm --filter @magsag/mcp-server exec node dist/index.js

# Or via CLI
pnpm --filter @magsag/cli exec magsag mcp:serve
```

### Connecting Clients

```typescript
import { MCPClient } from '@magsag/mcp-client';

const client = new MCPClient({
  transport: 'http',
  endpoint: 'http://localhost:3000',
});

await client.connect();

// List available tools
const tools = await client.listTools();
console.log(tools);
```

## Available Tools

### `catalog:list-agents`

Lists all available agents:

```typescript
const agents = await client.callTool('catalog:list-agents', {
  filter: { type: 'mag' },
});
```

### `catalog:get-agent`

Retrieves agent definition:

```typescript
const agent = await client.callTool('catalog:get-agent', {
  id: 'code-reviewer',
});
```

### `catalog:list-skills`

Lists available skills:

```typescript
const skills = await client.callTool('catalog:list-skills', {});
```

### `catalog:get-skill`

Retrieves skill definition:

```typescript
const skill = await client.callTool('catalog:get-skill', {
  id: 'test-runner',
});
```

### `governance:validate-policy`

Validates flow against policies:

```typescript
const result = await client.callTool('governance:validate-policy', {
  flowSummary: { /* ... */ },
  policies: ['security-gate', 'quality-gate'],
});
```

## Runtime Management

### Idle Timeout

Connections are automatically closed after idle timeout:

```typescript
const server = new MCPServer({
  idleTimeout: 5 * 60_000, // 5 minutes
});
```

### Cleanup Interval

Periodic cleanup of idle connections:

```typescript
const server = new MCPServer({
  cleanupInterval: 60_000, // 1 minute
});
```

### Graceful Shutdown

```typescript
process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
```

## Integration with Catalog

The server dynamically loads catalog content:

```
catalog/
├── agents/
│   ├── code-reviewer/
│   │   └── agent.yaml
│   └── test-generator/
│       └── agent.yaml
├── skills/
│   ├── test-runner.ts
│   └── doc-generator.ts
└── policies/
    ├── security-gate.yaml
    └── quality-gate.yaml
```

## Security

### Authentication

Optional API key authentication:

```typescript
const server = new MCPServer({
  auth: {
    enabled: true,
    apiKey: process.env.MCP_API_KEY,
  },
});
```

Clients must provide the API key:

```typescript
const client = new MCPClient({
  endpoint: 'http://localhost:3000',
  headers: {
    'Authorization': `Bearer ${process.env.MCP_API_KEY}`,
  },
});
```

### CORS

Configurable CORS policies:

```typescript
const server = new MCPServer({
  cors: {
    origins: ['http://localhost:8080'],
    methods: ['GET', 'POST'],
  },
});
```

## Development

```bash
# Run tests
pnpm --filter @magsag/mcp-server test

# Type checking
pnpm --filter @magsag/mcp-server typecheck

# Linting
pnpm --filter @magsag/mcp-server lint

# Build
pnpm --filter @magsag/mcp-server build
```

## Roadmap

- [ ] Complete tool implementations
- [ ] Add WebSocket transport support
- [ ] Implement streaming responses
- [ ] Add caching layer
- [ ] Enhance error handling
- [ ] Add rate limiting

## Dependencies

- `@magsag/catalog` - Catalog loading utilities
- `@magsag/governance` - Policy validation
- `@modelcontextprotocol/sdk` - MCP protocol

## License

Apache-2.0
