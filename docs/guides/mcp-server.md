---
title: MCP Server Guide
slug: guide-mcp-server
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- mcp
- server
summary: Describes the in-progress TypeScript MCP server and how to expose catalog assets.
description: Replaces the Python MCP server walkthrough with TypeScript-centric instructions.
authors: []
sources:
- id: R1
  title: @magsag/mcp-server Package
  url: ../../packages/mcp-server/src/index.ts
  accessed: '2025-11-06'
---

# MCP Server Guide

> The Python MCP server has been retired. This guide tracks the TypeScript replacement.

## Current Status

- `packages/mcp-server` exports placeholders; Workstream A is completing the implementation.
- Track progress in `docs/development/plans/typescript-full-migration-workstreams.md` (Workstream A).
- When released, start the server via `pnpm --filter @magsag/mcp-server build && pnpm --filter @magsag/mcp-server exec node dist/index.js` (command subject to refinement).

## Configuration

- Store editable YAML definitions under `ops/adk/servers/`.
- Use `pnpm catalog:validate` after updating JSON artefacts.

## Validation

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

## Legacy Reference

Historical Python instructions (Typer CLI, uvicorn) were removed in branch `feature/ts-migration/f-legacy-cleanup`.
