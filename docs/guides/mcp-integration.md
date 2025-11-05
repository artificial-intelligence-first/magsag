---
title: MCP Integration Guide
slug: guide-mcp-integration
status: living
last_updated: 2025-11-04
last_synced: '2025-11-04'
tags:
- mcp
- integration
summary: Guidance for connecting MCP servers and tools to the TypeScript runtime.
description: Explains how to integrate MCP transports using the TypeScript packages and catalog entrypoints.
authors: []
sources:
- id: R1
  title: @magsag/mcp-client
  url: ../../packages/mcp-client/src/mcp-client.ts
  accessed: '2025-11-06'
- id: R2
  title: @magsag/catalog Skills
  url: ../../packages/catalog/src/skills/index.ts
  accessed: '2025-11-06'
---

# MCP Integration Guide

> **For Humans**: Wire MCP transports into TypeScript skills and update catalog metadata.
>
> **For AI Assistants**: Apply these steps literally.

## Integration Steps

1. Add or update MCP server definitions in `tools/adk/servers/*.yaml`.
2. Set `MAGSAG_MCP_DIR` when invoking the CLI from outside the repo to point at the YAML preset directory.
3. Reference MCP-dependent skills via `@magsag/catalog` (for example `@magsag/catalog#skills.githubIssueTriage`).
4. Inject `McpRuntime` instances using the shared interfaces from `packages/catalog/src/shared/types.ts`.
5. Document any new permissions inside `catalog/registry/skills.yaml`.
6. Validate with `pnpm catalog:validate` and record outcomes.

## Validation Commands

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

## Legacy Python Implementation

Python MCP helpers were removed; the TypeScript equivalents live in `packages/mcp-client` and `packages/catalog`.
