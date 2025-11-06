# @magsag/catalog-mcp

MCP tool definitions for MAGSAG catalog access.

## Overview

`@magsag/catalog-mcp` provides Model Context Protocol (MCP) tool definitions for accessing the MAGSAG catalog. It exposes agents, skills, policies, and contracts as MCP tools for use by AI assistants.

## Features

- MCP tool definitions for catalog access
- Agent listing and retrieval
- Skill discovery
- Policy querying
- Contract validation
- Schema generation

## Tool Definitions

### catalog:list-agents

Lists available agents:

```typescript
{
  name: 'catalog:list-agents',
  description: 'List all available agents in the catalog',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['mag', 'sag', 'all'],
        description: 'Filter by agent type',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags',
      },
    },
  },
}
```

### catalog:get-agent

Retrieves specific agent:

```typescript
{
  name: 'catalog:get-agent',
  description: 'Get detailed information about a specific agent',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Agent ID',
      },
    },
    required: ['id'],
  },
}
```

### catalog:list-skills

Lists available skills:

```typescript
{
  name: 'catalog:list-skills',
  description: 'List all available skills',
  inputSchema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        description: 'Filter by domain (e.g., testing, documentation)',
      },
      language: {
        type: 'string',
        description: 'Filter by programming language',
      },
    },
  },
}
```

### catalog:get-skill

Retrieves specific skill:

```typescript
{
  name: 'catalog:get-skill',
  description: 'Get detailed information about a specific skill',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Skill ID',
      },
    },
    required: ['id'],
  },
}
```

### catalog:list-policies

Lists governance policies:

```typescript
{
  name: 'catalog:list-policies',
  description: 'List all governance policies',
  inputSchema: {
    type: 'object',
    properties: {
      severity: {
        type: 'string',
        enum: ['error', 'warning', 'info'],
        description: 'Filter by severity level',
      },
    },
  },
}
```

### catalog:validate-contract

Validates agent against contract:

```typescript
{
  name: 'catalog:validate-contract',
  description: 'Validate an agent implementation against its contract',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'Agent ID',
      },
      contractId: {
        type: 'string',
        description: 'Contract ID',
      },
    },
    required: ['agentId', 'contractId'],
  },
}
```

## Usage with MCP Server

```typescript
import { registerCatalogTools } from '@magsag/catalog-mcp';
import { MCPServer } from '@magsag/mcp-server';

const server = new MCPServer();

// Register catalog tools
registerCatalogTools(server, {
  catalogRoot: './catalog',
});

await server.start();
```

## Usage with MCP Client

```typescript
import { MCPClient } from '@magsag/mcp-client';

const client = new MCPClient({
  endpoint: 'http://localhost:3000',
});

await client.connect();

// List agents
const agents = await client.callTool('catalog:list-agents', {
  type: 'mag',
  tags: ['code-quality'],
});

console.log(agents);
// [
//   { id: 'code-reviewer', name: 'Code Reviewer', type: 'mag', ... },
//   ...
// ]

// Get specific agent
const agent = await client.callTool('catalog:get-agent', {
  id: 'code-reviewer',
});

console.log(agent);
// {
//   id: 'code-reviewer',
//   name: 'Code Reviewer',
//   description: '...',
//   capabilities: [...],
//   ...
// }
```

## Tool Handlers

Implement tool handlers:

```typescript
import { createCatalogToolHandlers } from '@magsag/catalog-mcp';

const handlers = createCatalogToolHandlers({
  catalogRoot: './catalog',
});

// Use with MCP server
server.onToolCall(async (toolName, input) => {
  const handler = handlers[toolName];
  if (handler) {
    return await handler(input);
  }
});
```

## Schema Generation

Generate MCP schemas from catalog:

```typescript
import { generateMCPSchemas } from '@magsag/catalog-mcp';

const schemas = await generateMCPSchemas({
  catalogRoot: './catalog',
});

console.log(schemas);
// {
//   tools: [...],
//   resources: [...],
//   prompts: [...],
// }
```

## Resource Definitions

Catalog items as MCP resources:

```typescript
{
  resources: [
    {
      uri: 'catalog://agents/code-reviewer',
      name: 'Code Reviewer Agent',
      mimeType: 'application/yaml',
      description: 'Reviews code changes for quality',
    },
    {
      uri: 'catalog://skills/test-runner',
      name: 'Test Runner Skill',
      mimeType: 'application/typescript',
      description: 'Executes test suites',
    },
  ]
}
```

## Integration Example

Complete integration:

```typescript
import { MCPServer } from '@magsag/mcp-server';
import { registerCatalogTools, createCatalogResources } from '@magsag/catalog-mcp';

const server = new MCPServer({
  port: 3000,
  catalogRoot: './catalog',
});

// Register tools
registerCatalogTools(server, {
  catalogRoot: './catalog',
});

// Register resources
const resources = await createCatalogResources({
  catalogRoot: './catalog',
});

server.registerResources(resources);

await server.start();
console.log('MCP server with catalog tools running on port 3000');
```

## CLI Integration

```bash
# Start MCP server with catalog tools
pnpm --filter @magsag/cli exec magsag mcp:serve \
  --catalog ./catalog \
  --port 3000
```

## Development

```bash
# Run tests
pnpm --filter @magsag/catalog-mcp test

# Type checking
pnpm --filter @magsag/catalog-mcp typecheck

# Linting
pnpm --filter @magsag/catalog-mcp lint

# Build
pnpm --filter @magsag/catalog-mcp build
```

## Tool Response Format

All tools return JSON responses:

```json
{
  "success": true,
  "data": {
    "agents": [...]
  },
  "metadata": {
    "total": 10,
    "filtered": 5
  }
}
```

## Error Handling

Tools return structured errors:

```json
{
  "success": false,
  "error": {
    "code": "AGENT_NOT_FOUND",
    "message": "Agent 'unknown' not found in catalog",
    "details": {}
  }
}
```

## Dependencies

- `@magsag/catalog` - Catalog loading
- `@modelcontextprotocol/sdk` - MCP types

## License

Apache-2.0
