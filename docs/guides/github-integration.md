---
title: GitHub Integration Guide
slug: guide-github-integration
status: deprecated
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- github
- integration
summary: Notes the retirement of Python GitHub workflows and points to TypeScript replacements.
description: Interim guidance while GitHub automation moves to the TypeScript CLI and runners.
authors: []
sources:
- id: R1
  title: @magsag/catalog Skills
  url: ../../packages/catalog/src/skills/index.ts
  accessed: '2025-11-06'
---

# GitHub Integration Guide

> The Python-based automations (Typer CLI, `magsag.mcp.github`) have been removed. Use the TypeScript CLI and `@magsag/catalog#skills.githubIssueTriage` for repository operations.

## Current Workflow

- Execute GitHub actions through the CLI: `pnpm --filter @magsag/cli exec magsag agent run ...`.
- Configure MCP access with the TypeScript runtime (`packages/mcp-client`).
- Store secrets in environment variables; never commit tokens.

## Validation

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

## Legacy Reference

Historical Python integrations (e.g., `magsag/github/*`) were removed during Workstream F. Refer to prior commits if needed for archival purposes.
