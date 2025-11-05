---
title: MAGSAG Migration Guide
slug: guide-migration
status: living
last_updated: 2025-11-04
last_synced: '2025-11-04'
tags:
- migration
summary: High-level checklist for adopting the TypeScript-only MAGSAG 2.0.0 release.
description: Summarises the steps required to move from the legacy Python stack to the TypeScript monorepo.
authors: []
sources:
- id: R1
  title: Repository Cleanup ExecPlan
  url: ../development/plans/repo-cleanup-execplan.md
  accessed: '2025-11-04'
---

# MAGSAG Migration Guide

## Breaking Changes

- Python code, FastAPI services, and uv-based workflows have been removed.
- Catalog entrypoints now reference TypeScript modules (`@magsag/catalog#agents.*`, `@magsag/catalog#skills.*`).
- Validation relies on pnpm scripts and Vitest; pytest/ruff/mypy are no longer used.

## Migration Checklist

1. Port agent and skill logic to TypeScript packages.
2. Update catalog YAML and schemas to point at new entrypoints.
3. Replace CI commands with `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm docs:lint`, and `pnpm catalog:validate`.
4. Drop Python-only dependencies from manifests and worktree notes.
5. Capture the migration outcome in `CHANGELOG.md` under `## [Unreleased]`.

## Validation Commands

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

## Legacy Reference

See the Git history prior to branch `feature/ts-migration/f-legacy-cleanup` for the retired Python workflow.
