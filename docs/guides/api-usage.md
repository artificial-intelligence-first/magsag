---
title: HTTP API Usage Guide
slug: guide-api-usage
status: deprecated
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- api
- http
summary: Placeholder guidance while the TypeScript HTTP server replaces the legacy FastAPI service.
description: Documents the interim state of the MAGSAG HTTP API during the TypeScript migration.
authors: []
sources:
- id: R1
  title: TypeScript Full Migration Plan
  url: ../development/plans/typescript-full-migration.md
  accessed: '2025-11-06'
---

# HTTP API Usage Guide

> **Status**: The FastAPI implementation shipped with the Python stack has been removed. A TypeScript HTTP server is under active development (`packages/server`).

## Current Guidance

- Use the CLI (`pnpm --filter @magsag/cli exec magsag agent run ...`) for end-to-end automation until the new server exposes `/api/v1/agent/run`.
- Follow updates in `docs/development/plans/typescript-full-migration.md` and Workstream C’s tracker for SSE/WebSocket readiness.
- When the TypeScript server lands, start it via workspace scripts (planned: `pnpm --filter @magsag/server dev`) and capture commands in delivery notes.

## Validation

Run the shared gates before referencing the HTTP surface:

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

## Legacy Reference

Legacy FastAPI usage (e.g., `uv run uvicorn ...`) is out of scope for v2.0.0. Refer to the Git history prior to branch `feature/ts-migration/f-legacy-cleanup` if archival behaviour is required.
