---
title: MAGSAG Single Source of Truth
slug: ssot
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- governance
- ssot
- documentation
summary: Defines canonical documentation surfaces, ownership, and update workflows for the TypeScript monorepo.
description: Defines canonical documentation surfaces, ownership, and update workflows for MAGSAG.
authors: []
source_of_truth: https://github.com/artificial-intelligence-first/ssot
sources:
- id: R1
  title: MAGSAG Agent Playbook
  url: AGENTS.md
  accessed: '2025-11-06'
- id: R2
  title: Contributing to MAGSAG
  url: CONTRIBUTING.md
  accessed: '2025-11-06'
---

# Single Source of Truth

> **For Humans**: Use this reference to locate authoritative documents, understand governance expectations, and coordinate updates across the TypeScript monorepo.
>
> **For AI Assistants**: Update the canonical surface first, then propagate references. Log every change in the Update Log.

## Canonical Document Map

| Domain | SSOT Location | Purpose |
|--------|---------------|---------|
| Agent operations | `AGENTS.md` | Operational expectations |
| Governance policies | `docs/policies/` | Security, conduct, approvals |
| Documentation standards | `docs/governance/` | Frontmatter schema, style, taxonomy |
| Documentation workflows | `docs/workflows/` | Changelog and ExecPlan procedures |
| Architecture overview | `docs/architecture/` | System design, skill conventions |
| TypeScript packages | `packages/` | CLI, governance, runners, observability, MCP utilities |
| Demo surfaces | `apps/` | CLI / API demos |
| Development process | `docs/development/` | Roadmap, plans, contributing guides |
| Catalog assets | `catalog/` | Agents, skills, policies, contracts |
| Changelog | `CHANGELOG.md`, `docs/development/changelog.md` | Release notes |

## Validation Workflow

1. Update the canonical surface listed above.
2. Propagate references to downstream docs.
3. Run `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`.
4. Run `pnpm docs:lint` and `pnpm catalog:validate`.
5. Log outcomes in delivery notes and the validation memo.

## Data Contracts

- `catalog/contracts/candidate_profile.schema.json`
- `catalog/contracts/offer_packet.schema.json`
- `catalog/contracts/flow_summary.schema.json`

Keep schemas synchronized with TypeScript implementations (`packages/catalog`, `packages/observability`).

## API & Runners

- CLI defaults (`@magsag/cli`) support MAG/SAG invocation via subscription runners.
- TypeScript server (`@magsag/server`) will expose `/api/v1/agent/run` (Workstream C).
- Runner packages live under `packages/runner-*`.

## Observability

- Flow summaries and metrics originate from `packages/observability/src/flow-summary.ts`.
- Store run artefacts in `.runs/` and propagate summaries to reporting surfaces.

## Update Log

- 2025-11-06: Logged TypeScript-only cleanup (Python/FastAPI/uv retired) and updated validation commands (`pnpm docs:lint`, `pnpm catalog:validate`).
- 2025-11-05: Updated canonical surfaces for the TypeScript monorepo and aligned validation commands with pnpm workflows.
- 2025-11-03: Migrated MCP workflow to JSON runtime artefacts with YAML sources under `ops/adk/servers/`.
- 2025-11-03: Documented external SDK drivers, ADK sync pipeline, and CLI touchpoints.
- 2025-11-02: Added documentation workflows to the canonical map.
- 2025-11-01: Expanded SSOT guidance with glossary, data contracts, policies, and workflows aligned to ssot reference.
