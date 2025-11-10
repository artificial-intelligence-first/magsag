---
title: Agent Development Guide
slug: guide-agent-development
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- agents
- development
summary: TypeScript-first guidance for building, validating, and shipping MAGSAG agents.
description: End-to-end checklist for implementing and validating agents in the TypeScript monorepo.
authors: []
source_of_truth: https://github.com/artificial-intelligence-first/ssot/blob/main/docs/core/agents-guide.md
sources:
- id: R1
  title: MAGSAG Agent Playbook
  url: ../../AGENTS.md
  accessed: '2025-11-06'
---

# Agent Development Guide

> **For Humans**: Follow this workflow when creating or updating agents in the TypeScript monorepo.
>
> **For AI Assistants**: Mirror these steps unless the user explicitly waives a validation gate. Note any skipped commands in delivery notes.

## TypeScript Workflow Overview

1. **Bootstrap** — Install Node.js 20+ (22.x recommended) and pnpm 9. Run `pnpm install` inside each worktree after rebasing.
2. **Create a branch** — `git checkout -b feature/<slug>` and record worktree commands in the handoff doc when collaborating asynchronously.
3. **Author agent logic** — Implement MAG/SAG and shared helpers in TypeScript packages (for example `packages/catalog`). Reference exports via registry entrypoints such as `@magsag/catalog#agents.offerOrchestratorMag`.
4. **Update catalog metadata** — Adjust `catalog/agents/*/agent.yaml` and `catalog/registry/*.yaml` to point at the new TypeScript entrypoints.
5. **Align documentation** — Refresh AGENTS, SSOT, and any relevant guide when behaviour changes. Append to each Update Log.
6. **Capture validation evidence** — Run the commands below and paste results into delivery notes or PR descriptions.

## Validation Checklist

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm vitest --run --project e2e     # when flows or runners change
pnpm docs:lint
pnpm catalog:validate
pnpm --filter @magsag/cli exec magsag flow validate <flow>
pnpm --filter @magsag/cli exec magsag flow gate <summary.json>
```

Record each command’s exit status. Document skipped commands and the rationale (for example "e2e suite skipped: no flow changes").

## Resources

- [AGENTS.md](../../AGENTS.md) — Operational playbook and delivery expectations.
- [SSOT.md](../../SSOT.md) — Canonical glossary, schemas, and documentation map.
- [packages/catalog](../../packages/catalog/src/index.ts) — Sample MAG/SAG implementations and shared types.
- [docs/governance/frontmatter.md](../governance/frontmatter.md) — Documentation metadata requirements.
- [docs/workflows/changelog.md](../workflows/changelog.md) — Release note conventions.

## Legacy Python Workflow

The Python-based workflow (FastAPI, uv, Typer CLI) shipped prior to v2.0.0 and has been removed. Refer to the Git history before commit `feature/ts-migration/f-legacy-cleanup` if historical context is required.
