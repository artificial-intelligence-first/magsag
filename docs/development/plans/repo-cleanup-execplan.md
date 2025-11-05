---
title: Repository Cleanup ExecPlan
slug: repo-cleanup-execplan
status: living
last_updated: 2025-11-04
last_synced: '2025-11-04'
tags:
- plans
- development
- governance
summary: Coordinate the end-to-end cleanup of technical debt, obsolete assets, and documentation drift across the repo.
description: Defines the actionable steps, sequencing, and validation needed to align the TypeScript-first codebase and documentation with the current AI-first operating model.
authors: []
sources:
- id: R1
  title: MAGSAG Agent Playbook
  url: ../../AGENTS.md
  accessed: '2025-11-04'
- id: R2
  title: Single Source of Truth
  url: ../../SSOT.md
  accessed: '2025-11-04'
---

# Repository Cleanup and Alignment

## Purpose
- Deliver a lean, AI-first repository by removing deprecated assets, unifying MCP configuration, and syncing documentation with the active TypeScript runtime.

## Context
- `SSOT.md` and `docs/architecture/agents.md` highlight drift between documented and actual MCP server paths.
- Legacy Python references persist across guides and tooling, conflicting with the current TypeScript-only strategy.
- Runner packages duplicate MCP environment setup logic instead of reusing `@magsag/core` utilities.

## Plan of Work
1. Retire outdated plans, deprecated guides, and duplicate SSOT/contributing docs; author this ExecPlan to steer ongoing cleanup.
2. Align MCP preset discovery across CLI code, scripts, and documentation with the `tools/adk/servers` source of truth; update supporting tests or validation.
3. Refactor runner packages to reuse shared MCP helpers, remove lingering TODOs, and document the canonical approach.
4. Purge obsolete demos, examples, and tooling remnants (FlowRunner assets, empty directories, Python artifacts); streamline `.gitignore`.
5. Refresh README, SSOT, and related docs to reflect the simplified structure, note archived components, and capture validation evidence.

## Validation
- `pnpm -r lint`
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm docs:lint`
- Manual verification that `pnpm --filter @magsag/cli exec node dist/index.js mcp doctor` reports the expected servers.

## Status
- [2025-11-04 19:11 UTC] Plan created; initial cleanup milestones defined.
- [2025-11-05 02:59 UTC] Retired deprecated guides, synced MCP paths, and updated runner MCP environment handling.
- [2025-11-05 03:20 UTC] Replaced demo CLI/API placeholders with repo-aligned MCP and ExecPlan previews.
- [2025-11-05 05:04 UTC] Hardened shared MCP helpers/tests to prevent stale env state and preserve preset fallbacks.

## Follow-up
- Track MCP sync automation work once the TypeScript utility lands.
- Schedule periodic audits to ensure README topology and SSOT remain accurate after structural changes.
- Capture any skipped validation commands with justification in delivery notes.

## Update Log

- 2025-11-04: Initial ExecPlan authored to guide repository cleanup.
