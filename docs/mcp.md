---
title: MCP Overview
slug: mcp-overview
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- mcp
- architecture
summary: Overview of MCP usage in the TypeScript-only MAGSAG monorepo.
description: Explains the components, configuration, and validation steps for MCP in the TypeScript stack.
authors: []
sources:
- id: R1
  title: @magsag/mcp-client
  url: ../packages/mcp-client/src/mcp-client.ts
  accessed: '2025-11-06'
- id: R2
  title: TypeScript Full Migration Plan
  url: ./development/plans/typescript-full-migration.md
  accessed: '2025-11-06'
---

# MCP Overview

MCP (Model Context Protocol) integration now relies entirely on TypeScript packages and catalog entrypoints.

## Components

- `@magsag/mcp-client` — Connects to MCP servers (stdio, HTTP/SSE, WebSocket).
- `@magsag/mcp-server` — Exposes catalog assets and governance policies (Workstream A).
- `ops/adk/servers/*.yaml` — Canonical MCP source definitions.
- `@magsag/catalog#skills.*` — Skills that call MCP tools via injected runtimes.

## Workflow

1. Define or update server configs in `ops/adk/servers/`.
2. Consume MCP runtimes inside TypeScript skills using the shared interfaces from `packages/catalog/src/shared/types.ts`.
3. Update registry permissions when adding new servers.
4. Validate using `pnpm catalog:validate` and note outcomes in delivery docs.

## Validation Checklist

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

## Legacy Python Runtime

The Python MCP runtime (`magsag.mcp.*`) and associated scripts were removed during Workstream F. Refer to earlier commits if historical behaviour is required.

> **Release Readiness (2025-11-06)**: Python assets are retired, and MCP guidance now targets the TypeScript 2.0.0 release preparation.
