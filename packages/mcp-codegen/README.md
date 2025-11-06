# @magsag/mcp-codegen

Code generation utilities for MCP server implementations.

## Overview

`@magsag/mcp-codegen` provides code generation tools for creating MCP (Model Context Protocol) server implementations from schema definitions. It automates boilerplate generation and ensures type safety.

## Features

- Generate MCP server implementations from schemas
- TypeScript type generation
- Tool handler scaffolding
- Resource definition generation
- Validation code generation

## Usage

### CLI

```bash
# Generate MCP server from schema
pnpm --filter @magsag/mcp-codegen exec tsx src/index.ts \
  --schema ./schema.yaml \
  --output ./generated

# Or via npm script
pnpm mcp:codegen
```

### Programmatic API

```typescript
import { generateMCPServer } from '@magsag/mcp-codegen';

await generateMCPServer({
  schemaPath: './schema.yaml',
  outputDir: './generated',
  options: {
    typescript: true,
    handlers: true,
    validation: true,
  },
});
```

## Schema Format

Define MCP tools in YAML:

```yaml
# schema.yaml
name: my-mcp-server
version: 1.0.0

tools:
  - name: search
    description: Search for information
    inputSchema:
      type: object
      properties:
        query:
          type: string
          description: Search query
        limit:
          type: number
          description: Maximum results
          default: 10
      required: [query]

  - name: analyze
    description: Analyze data
    inputSchema:
      type: object
      properties:
        data:
          type: string
          description: Data to analyze
      required: [data]

resources:
  - uri: data://{id}
    name: Data resource
    mimeType: application/json
    description: Access data by ID
```

## Generated Output

### Types

```typescript
// generated/types.ts
export interface SearchInput {
  query: string;
  limit?: number;
}

export interface AnalyzeInput {
  data: string;
}

export type ToolInput = SearchInput | AnalyzeInput;
```

### Tool Handlers

```typescript
// generated/handlers.ts
import type { SearchInput, AnalyzeInput } from './types';

export async function handleSearch(input: SearchInput): Promise<unknown> {
  // TODO: Implement search logic
  const { query, limit = 10 } = input;
  return { results: [] };
}

export async function handleAnalyze(input: AnalyzeInput): Promise<unknown> {
  // TODO: Implement analyze logic
  const { data } = input;
  return { analysis: {} };
}

export const toolHandlers = {
  search: handleSearch,
  analyze: handleAnalyze,
};
```

### Server Implementation

```typescript
// generated/server.ts
import { MCPServer } from '@magsag/mcp-server';
import { toolHandlers } from './handlers';
import { validateSearchInput, validateAnalyzeInput } from './validation';

const server = new MCPServer({
  name: 'my-mcp-server',
  version: '1.0.0',
});

server.registerTool({
  name: 'search',
  description: 'Search for information',
  inputSchema: { /* ... */ },
  handler: async (input) => {
    const validInput = validateSearchInput(input);
    return await toolHandlers.search(validInput);
  },
});

server.registerTool({
  name: 'analyze',
  description: 'Analyze data',
  inputSchema: { /* ... */ },
  handler: async (input) => {
    const validInput = validateAnalyzeInput(input);
    return await toolHandlers.analyze(validInput);
  },
});

export default server;
```

### Validation

```typescript
// generated/validation.ts
import { z } from 'zod';

export const SearchInputSchema = z.object({
  query: z.string(),
  limit: z.number().optional().default(10),
});

export const AnalyzeInputSchema = z.object({
  data: z.string(),
});

export function validateSearchInput(input: unknown) {
  return SearchInputSchema.parse(input);
}

export function validateAnalyzeInput(input: unknown) {
  return AnalyzeInputSchema.parse(input);
}
```

## Configuration

### codegen.config.js

```javascript
export default {
  schema: './schema.yaml',
  output: './generated',
  typescript: true,
  handlers: true,
  validation: true,
  format: {
    indentation: 2,
    quotes: 'single',
    semicolons: true,
  },
};
```

## CLI Options

```bash
tsx src/index.ts [options]

Options:
  --schema <path>      Path to schema file (required)
  --output <path>      Output directory (default: ./generated)
  --typescript         Generate TypeScript types (default: true)
  --handlers           Generate handler scaffolds (default: true)
  --validation         Generate validation code (default: true)
  --force              Overwrite existing files
  --watch              Watch for schema changes
```

## Watch Mode

Auto-regenerate on schema changes:

```bash
pnpm --filter @magsag/mcp-codegen exec tsx src/index.ts \
  --schema ./schema.yaml \
  --output ./generated \
  --watch
```

## Template Customization

Customize generation templates:

```typescript
import { generateMCPServer } from '@magsag/mcp-codegen';

await generateMCPServer({
  schemaPath: './schema.yaml',
  outputDir: './generated',
  templates: {
    types: './templates/types.hbs',
    handlers: './templates/handlers.hbs',
    server: './templates/server.hbs',
  },
});
```

## Integration with Build

Add to package.json scripts:

```json
{
  "scripts": {
    "codegen": "tsx packages/mcp-codegen/src/index.ts --schema ./schema.yaml --output ./src/generated",
    "prebuild": "pnpm codegen",
    "build": "tsup"
  }
}
```

## Validation

Generated code includes runtime validation:

```typescript
// Usage
try {
  const validInput = validateSearchInput(userInput);
  const result = await handleSearch(validInput);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Invalid input:', error.issues);
  }
}
```

## Development

```bash
# Run codegen
pnpm mcp:codegen

# Run tests
pnpm --filter @magsag/mcp-codegen test

# Type checking
pnpm --filter @magsag/mcp-codegen typecheck

# Linting
pnpm --filter @magsag/mcp-codegen lint

# Build
pnpm --filter @magsag/mcp-codegen build
```

## Performance

- Generation time: ~100ms for 10 tools
- Watch mode latency: ~50ms

## Dependencies

- `yaml` - YAML parsing
- `zod` - Schema validation
- `handlebars` - Template engine (optional)

## License

Apache-2.0
