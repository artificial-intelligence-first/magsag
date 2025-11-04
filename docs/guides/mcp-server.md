---
title: MAGSAG MCP Server
slug: guide-mcp-server
status: living
last_updated: '2025-11-04'
last_synced: '2025-11-04'
tags:
  - mcp
  - server
summary: Build and operate MCP servers with the new TypeScript runtime, fallback transports, and governance hooks.
description: Step-by-step guidance for wiring @magsag/mcp-server into projects, registering tools, publishing presets, and validating connectivity with the CLI doctor.
authors: []
sources: []
---

# MAGSAG MCP Server (TypeScript)

> **For Humans**: Use this guide to ship and operate MCP servers with the TypeScript runtime. Capture deviations in delivery notes and keep presets synchronised.
>
> **For AI Agents**: Depend on `@magsag/mcp-server` and the CLI doctor when updating transports. Do not resurrect Python scaffolding.

## Overview

The TypeScript runtime wraps the Model Context Protocol server SDK with sensible defaults:

- HTTP transport with automatic SSE/stdio fallback
- Session management, DNS re-binding guards, and tool update notifications
- Lightweight helper API for registering tools/resources/prompts
- Compatibility with the CLI (`mcp ls`, `mcp doctor`) and the shared governance stack

## Architecture

```
┌──────────┐      HTTP / SSE / stdio      ┌────────────────────────────┐
│ Client   │ ───────────────────────────▶ │ @magsag/mcp-server runtime │
│ (Claude) │                              │  • Streamable HTTP         │
└──────────┘                              │  • Fallback chain          │
                                          │  • Tool registry           │
                                          └────────────────────────────┘
```

Each runtime instance registers tools/resources, starts listening on HTTP, and advertises fallback transports defined in the preset.

## Quick Start

```bash
pnpm install
pnpm --filter @magsag/cli exec magsag mcp ls
pnpm --filter @magsag/cli exec magsag mcp doctor local-demo || true
```

1. Add a preset under `ops/adk/servers/local-demo.yaml` (see below).
2. Use the sample server code to expose tools.
3. Diagnose connectivity with `mcp doctor` before pointing external clients at the server.

## Sample Server

```ts
import { createMcpServerRuntime } from '@magsag/mcp-server';
import { z } from 'zod';

const runtime = createMcpServerRuntime({
  implementation: { name: 'magsag-demo', version: '1.0.0' },
  http: { host: '127.0.0.1', port: 3300, path: '/mcp' }
});

runtime.registerTool({
  name: 'repo.health',
  description: 'Summarise repository health metrics',
  inputSchema: {
    repo: z.string().min(1)
  },
  handler: async (args) => ({
    content: [
      {
        type: 'text',
        text: `Health report for ${args.repo}`
      }
    ],
    isError: false
  })
});

await runtime.start();
console.log('Server ready', runtime.getHttpAddress()?.url.href);
```

### Session Lifecycle

- Each HTTP initialisation request receives a dedicated session ID.
- SSE streams reuse the session ID to push events; stdio fallback is stateful per process.
- `runtime.registerTool()` after startup pushes `tools/list_changed` notifications to active sessions.
- Configure DNS re-binding protection via the preset (`allowedHosts`, `allowedOrigins`).

Stop the server with `await runtime.stop()` to close transports and sessions gracefully.

## Preset Definition

Example preset (`ops/adk/servers/local-demo.yaml`):

```yaml
id: local-demo
version: "1"
description: "Local demo server"
transport:
  type: http
  url: "http://127.0.0.1:3300/mcp"
  allowedHosts:
    - "127.0.0.1:3300"
  allowedOrigins:
    - "http://127.0.0.1:3300"
fallback:
  - type: sse
    url: "http://127.0.0.1:3300/mcp"
  - type: stdio
    command: "node"
    args: ["dist/local-demo-server.js"]
```

- Place secrets in environment variables and reference them with `${VAR}` syntax.
- Keep presets under source control; record changes in `docs/development/plans/typescript-full-migration.md`.
- `magsag mcp doctor local-demo --json` validates the full fallback chain.

## Observability & Governance

- The runtime emits per-session hooks (`onsessioninitialized`, `onsessionclosed`) for metrics and tracing.
- `@magsag/mcp-client` reports retries, circuit breaker transitions, and HTTP status codes—pipe these into `@magsag/observability`.
- Align tool permissions with `catalog/policies/mcp_permissions.yaml`; the CLI surfaces `annotations` when listing tools.

## Deployment Checklist

1. **Implement tools** – Register each tool with validated input and optional output schema (`zod`).
2. **Publish preset** – Update `ops/adk/servers/<id>.yaml` and commit.
3. **Run doctor** – `pnpm --filter @magsag/cli exec magsag mcp doctor <id>` on the target environment.
4. **Document** – Capture runtime URLs, auth requirements, and fallback status in SSOT.
5. **Monitor** – Stream logs and metrics for `mcp.*` spans; alert on elevated error rates or auth failures.

## Migration Notes

- Python FastAPI / uv servers are retired. Replace any references with the TypeScript runtime helper.
- CLI helpers `mcp bootstrap`, `mcp sync`, and `mcp login` were removed; equivalents will return once Workstream E ships the new automation surface.
- Claude Desktop integration continues to rely on the same manifest format—only the server implementation changed.

## Further Reading

- `docs/mcp.md` — Client-side usage patterns and CLI diagnostics.
- `docs/guides/mcp-integration.md` — Policies, authentication, and observability requirements.
- `catalog/policies/mcp_permissions.yaml` — Tool approval rules.
