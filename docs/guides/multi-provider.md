---
title: Multi-Provider Guide
slug: guide-multi-provider
status: deprecated
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- providers
- integration
summary: Notes the removal of Python provider adapters and points to TypeScript runners.
description: Interim documentation while TypeScript runners assume full responsibility for provider orchestration.
authors: []
sources:
- id: R1
  title: @magsag/runner-codex-cli
  url: ../../packages/runner-codex-cli/src/index.ts
  accessed: '2025-11-06'
- id: R2
  title: @magsag/runner-claude-cli
  url: ../../packages/runner-claude-cli/src/index.ts
  accessed: '2025-11-06'
---

# Multi-Provider Guide

> Provider switching is now handled by TypeScript runners. Python shims (`src/magsag/providers/*.py`) no longer exist.

## Current Approach

- Select MAG/SAG engines using environment variables (`ENGINE_MODE`, `ENGINE_MAG`, `ENGINE_SAG`).
- Implement custom runners by extending the TypeScript runner packages under `packages/runner-*`.
- Capture provider-specific configuration in delivery notes and ExecPlans.

## Validation

- `pnpm -r lint`
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm docs:lint`
- `pnpm catalog:validate`

## Legacy Reference

Legacy Python providers were removed; consult prior commits if needed.
