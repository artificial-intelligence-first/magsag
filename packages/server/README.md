# @magsag/server

HTTP server entrypoint for MAGSAG API (experimental).

## Overview

`@magsag/server` provides an experimental HTTP server for exposing MAGSAG functionality via REST API. It offers endpoints for agent execution, flow governance, and monitoring.

**Status**: Experimental - API may change in future versions.

## Features

- REST API for agent execution
- Health check endpoints
- OpenAPI/Swagger documentation
- CORS support
- Rate limiting (optional)
- Authentication (API key)
- WebSocket support for streaming

## Quick Start

```typescript
import { createServer } from '@magsag/server';

const server = createServer({
  port: 3000,
  catalogRoot: './catalog',
  auth: {
    enabled: true,
    apiKey: process.env.MAGSAG_API_KEY,
  },
});

await server.start();
console.log('Server running on http://localhost:3000');
```

## API Endpoints

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "healthy",
  "version": "2.0.0-alpha.0",
  "uptime": 3600
}
```

### Execute Agent

```bash
POST /api/v1/agent/execute
Content-Type: application/json
Authorization: Bearer <api-key>

{
  "instruction": "Implement feature X",
  "engine": "mag",
  "timeout": 300000,
  "env": {
    "NODE_ENV": "development"
  }
}
```

Response:
```json
{
  "runId": "run-123",
  "status": "running",
  "startTime": "2025-11-06T08:00:00Z"
}
```

### Get Run Status

```bash
GET /api/v1/runs/:runId
Authorization: Bearer <api-key>
```

Response:
```json
{
  "runId": "run-123",
  "status": "completed",
  "startTime": "2025-11-06T08:00:00Z",
  "endTime": "2025-11-06T08:05:00Z",
  "result": {
    "output": "Feature implemented",
    "artifacts": []
  }
}
```

### List Agents

```bash
GET /api/v1/catalog/agents
Authorization: Bearer <api-key>
```

Response:
```json
{
  "agents": [
    {
      "id": "code-reviewer",
      "name": "Code Reviewer",
      "type": "mag",
      "description": "Reviews code changes"
    }
  ]
}
```

### Validate Policy

```bash
POST /api/v1/governance/validate
Content-Type: application/json
Authorization: Bearer <api-key>

{
  "flowSummary": { /* ... */ },
  "policies": ["security-gate", "quality-gate"]
}
```

Response:
```json
{
  "passed": true,
  "violations": []
}
```

## WebSocket Streaming

Connect to streaming endpoint for real-time events:

```typescript
const ws = new WebSocket('ws://localhost:3000/api/v1/runs/run-123/stream');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log(event);
  // { type: 'progress', data: { message: '...', progress: 0.5 } }
});
```

## Configuration

### Environment Variables

- `MAGSAG_API_PORT` - Server port (default: 3000)
- `MAGSAG_API_HOST` - Server host (default: 'localhost')
- `MAGSAG_API_KEY` - API key for authentication
- `MAGSAG_CORS_ORIGINS` - CORS origins (comma-separated)
- `MAGSAG_RATE_LIMIT_QPS` - Rate limit (queries per second)
- `MAGSAG_RATE_LIMIT_BURST` - Rate limit burst capacity (defaults to `3×QPS` in production when unset)
- `MAGSAG_RATE_LIMIT_ENABLED` - Enable rate limiting (defaults to `true` when `NODE_ENV=production`)
- `MAGSAG_RATE_LIMIT_TRUST_PROXY` - Trust `x-forwarded-*` headers for client identity (defaults to `false`)
- `MAGSAG_API_DEBUG` - Enable debug mode (default: false)

> Copy `packages/server/.env.example` into your deployment tooling and replace the sample domains with real frontend origins before promoting to production. Without an explicit allowlist the server retains the legacy “allow all origins” behaviour.

### Programmatic Configuration

```typescript
const server = createServer({
  port: 3000,
  host: 'localhost',
  catalogRoot: './catalog',

  auth: {
    enabled: true,
    apiKey: process.env.MAGSAG_API_KEY,
  },

  cors: {
    origins: ['http://localhost:8080'],
    credentials: true,
  },

  rateLimit: {
    enabled: true,
    qps: 10,
  },

  logging: {
    level: 'info',
    format: 'json',
  },
});
```

## OpenAPI Documentation

Access API documentation:

```bash
# View OpenAPI spec
GET /api/docs

# Swagger UI
GET /api/docs/ui
```

## Authentication

API key authentication:

```bash
curl -H "Authorization: Bearer your-api-key" \
  http://localhost:3000/api/v1/catalog/agents
```

Generate secure API key:

```bash
openssl rand -hex 32
```

## CORS Configuration

```typescript
const server = createServer({
  cors: {
    origins: [
      'http://localhost:8080',
      'https://app.example.com',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
```

## Rate Limiting

```typescript
const server = createServer({
  rateLimit: {
    enabled: true,
    qps: 10, // 10 queries per second
    burst: 20, // Allow bursts up to 20
    trustForwardedHeaders: false, // Default: derive client identity from the socket
  },
});
```

> **Note:** When `trustForwardedHeaders` stays `false`, the limiter keys every request by the socket address surfaced via `@hono/node-server` (`context.env.incoming`). Only enable `trustForwardedHeaders` once your deployment sits behind a trusted reverse proxy that injects canonical `X-Forwarded-For` / `X-Client-IP` headers; otherwise malicious clients can spoof their identity and bypass quotas.

## Monitoring

- Export `x-ratelimit-limit` and `x-ratelimit-remaining` headers to your metrics store and alert when remaining capacity stays at `0` for sustained windows.
- Capture counts of `429` responses (REST) and rejected WebSocket upgrades to verify rate limits are tuned for production workloads.
- Track `403` responses with the payload `{ "error": { "message": "CORS origin not allowed" } }` to detect misconfigured `MAGSAG_CORS_ORIGINS`.
- Run `pnpm --filter @magsag/server smoke` to execute an automated smoke test that demonstrates the 200/403/429 paths with the bundled sample configuration.

## Error Responses

Standard error format:

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "Missing required field: instruction",
    "details": {
      "field": "instruction"
    }
  }
}
```

## WebSocket Server

Enable WebSocket support:

```typescript
import { createServer, attachWebSocketServer } from '@magsag/server';

const server = createServer({ port: 3000 });
attachWebSocketServer(server);

await server.start();
```

## Middleware

Add custom middleware:

```typescript
const server = createServer({ port: 3000 });

server.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

server.use('/api/v1/custom', customRouter);
```

## Production Deployment

```typescript
import { createServer } from '@magsag/server';

const server = createServer({
  port: process.env.PORT || 3000,
  host: '0.0.0.0',

  auth: {
    enabled: true,
    apiKey: process.env.MAGSAG_API_KEY,
  },

  cors: {
    origins: process.env.CORS_ORIGINS?.split(',') || [],
  },

  rateLimit: {
    enabled: true,
    qps: 100,
  },

  logging: {
    level: 'warn',
    format: 'json',
  },
});

await server.start();
```

## Graceful Shutdown

```typescript
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await server.stop();
  process.exit(0);
});
```

## Development

```bash
# Start dev server
pnpm --filter @magsag/server dev

# Run tests
pnpm --filter @magsag/server test

# Type checking
pnpm --filter @magsag/server typecheck

# Linting
pnpm --filter @magsag/server lint

# Build
pnpm --filter @magsag/server build
```

## Performance

- Startup time: ~200ms
- Request latency: <10ms (excluding agent execution)
- Concurrent connections: 1000+

## Dependencies

- `express` - HTTP framework (or fastify)
- `ws` - WebSocket support
- `@magsag/core` - Core functionality
- `@magsag/governance` - Policy validation
- `@magsag/catalog` - Catalog access

## License

Apache-2.0
