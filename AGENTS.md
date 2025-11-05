---
title: MAGSAG Agent Playbook
slug: agents
status: living
last_updated: 2025-11-05
last_synced: '2025-11-04'
tags:
- agents
- workflow
- governance
summary: Operational instructions for humans and AI assistants collaborating on MAGSAG.
description: Operational instructions for humans and AI assistants collaborating on
  MAGSAG.
authors: []
sources:
- id: R1
  title: MAGSAG README
  url: README.md
  accessed: '2025-11-01'
- id: R2
  title: Contributing to MAGSAG
  url: CONTRIBUTING.md
  accessed: '2025-11-01'
---

# MAGSAG Agent Playbook

> **For Humans**: Use this playbook to align day-to-day delivery, validation, and documentation practices with the repository’s governance model.
>
> **For AI Agents**: Treat every instruction here as binding unless the user overrides it. Keep documentation, tests, and metadata in sync while shipping minimal diffs.

## Development Environment

- Install Node.js 18.18+ (22.x LTS recommended) and [pnpm 9](https://pnpm.io/installation); bootstrap each worktree with `pnpm install`.
- Build packages on demand (for example `pnpm --filter @magsag/cli build`) and execute the CLI via `pnpm --filter @magsag/cli exec node dist/index.js --help`.
- Place new TypeScript modules under `packages/`; demo surfaces stay in `apps/`; catalog assets remain in `catalog/`; documentation continues under `docs/`.
- Update MCP YAML in `tools/adk/servers/` and document any manual regeneration steps until the TypeScript sync utility lands; Python fallbacks are retired.
- Export `MAGSAG_MCP_DIR` when invoking the CLI outside the repo root so MCP presets resolve correctly.
- Start demo services with `pnpm --filter @magsag/demo-cli start` or `pnpm --filter @magsag/demo-api start` after building.
- Configure secrets through neutral `ENGINE_*` variables or provider-specific keys. Never commit credentials or CLI configuration files.

## Engine Runtime

- `ENGINE_MODE` accepts `auto|subscription|api|oss`. `auto` resolves to subscription CLIs when explicit overrides are absent.
- `ENGINE_MAG` / `ENGINE_SAG` select `codex-cli`, `claude-cli`, `openai-agents`, `claude-agent`, or `adk`. Defaults: `codex-cli` (MAG) and `claude-cli` (SAG).
- Generate plans with `pnpm --filter @magsag/cli exec node dist/index.js agent plan --repo . "Investigate flaky CI"`, then execute via `agent exec` (e.g. add `--concurrency 4 --provider-map "claude-cli:2,codex-cli"`). Use stdin for long prompts and replay results with `runs describe`.
- Switch to API engines by exporting `ENGINE_MODE=api ENGINE_MAG=openai-agents ENGINE_SAG=claude-agent` alongside the necessary API keys.
- Resume a session with `--resume <id>` once persistence lands in Workstream C; track readiness in `docs/development/plans/repo-cleanup-execplan.md`.

## Quality Gates

Execute these checks before pushing or requesting review:

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

- Narrow scope with `pnpm --filter <pkg> lint|typecheck|test` when needed.
- Run targeted integration suites (e.g. Flow Runner, observability) once the corresponding TypeScript packages land.
- Capture command results in the delivery note or PR body. State any skipped gates and the reason.

## Documentation Workflow

- Apply the frontmatter standard in `docs/governance/frontmatter.md` to every Markdown file except `README.md`.
- Update the canonical surfaces listed in `SSOT.md` first, then propagate references (TypeScript package names, `ENGINE_*`, pnpm commands).
- Maintain update logs at the end of living documents (`docs/architecture/`, `docs/development/`, catalog templates).
- Follow `docs/workflows/changelog.md` and `docs/workflows/plans.md` when recording releases or long-running initiatives.
- Run `pnpm docs:lint` before merging documentation updates and log the outcome.
- Start new docs from `docs/_templates/` and align tags with `docs/governance/taxonomy.md`.
- Keep diagrams, examples, and CLI excerpts accurate; link to deeper guides instead of duplicating content.
- Highlight unresolved questions in delivery notes so follow-up work stays visible.

## Placement & Scope

- Keep this file at the repository root; create subsystem-specific `AGENTS.md` only when workflows diverge materially.
- Obey precedence: explicit user prompt → closest `AGENTS.md` → parent directories → repository root.
- Store instructions as UTF-8 Markdown with Unix line endings so tooling can parse them reliably.

## Content Expectations

- **Environment setup** – Tooling, dependency installation, workspace layout.
- **Validation commands** – Tests, lint, type checks, doc verification.
- **Governance** – Approvals, changelog updates, catalog synchronisation.
- **Security** – Secret handling, MCP configuration, escalation triggers.
- **Delivery** – Branching, commit format, PR evidence, observability artefacts.
- Link to deep dives (`docs/architecture`, `catalog/`) rather than duplicating lengthy explanations.

## Machine-First Writing

- Use imperative sentences (`Run`, `Update`, `Record`) and avoid hedging.
- Prefer numbered lists for ordered procedures; use bullets for independent tasks.
- Provide exact commands—including flags and sample payloads—so automations can execute without guessing.
- Call out blockers and escalation triggers; agents should pause rather than improvise.

## Change Delivery

1. Create an isolated worktree (record the `git worktree` command until the TypeScript replacement for `magsag wt` ships).
2. Implement changes with complete typing and focused tests; rely on pnpm scripts for build/test loops.
3. Run `pnpm -r lint typecheck test` (or filtered equivalents) for packages you touched and capture results.
4. Stage related files only (`git add -u`); avoid drive-by edits.
5. Update `CHANGELOG.md` under `## [Unreleased]` for user-visible changes.
6. Draft concise commits using imperative Conventional Commit-friendly summaries (≤72 chars).

## Security & Governance

- Follow `docs/policies/security.md` and never embed secrets in tests or fixtures.
- Pause and ask for guidance when requirements conflict with `SSOT.md` or governance policies.
- Prefer incremental ExecPlans (`docs/development/plans/`) for multi-session work. Close plans with validation evidence.
- Record approvals and risk decisions in delivery notes to keep audits traceable.

## Reference Surfaces

- `SSOT.md` – Canonical document index and governance rules across the TypeScript monorepo.
- `docs/governance/style.md` – Writing, formatting, and tone guidelines.
- `docs/governance/frontmatter.md` – Required metadata schema for Markdown.
- `docs/governance/taxonomy.md` – Controlled vocabulary for documentation tags.
- `docs/architecture/agents.md` – Deep dive into repository layout, workflows, and validation commands.
- `docs/workflows/changelog.md` / `docs/workflows/plans.md` – Changelog and ExecPlan operations.
- `packages/core/src/index.ts` – Engine contracts, selection helpers, and registry logic.
- `packages/cli/src/index.ts` – CLI command registration and runner integration.
- `packages/runner-*/src/index.ts` – Codex/Claude/OpenAI/ADK runner implementations.
- `packages/governance/src/flow-gate.ts` – Flow gate evaluation in progress.
- `packages/observability/src/flow-summary.ts` – Flow summary orchestration and metrics.
- `catalog/` templates – Authoritative schema for agent and skill definitions.

## Update Log

- 2025-11-05: Documented MAG/SAG plan → exec workflow and updated CLI guidance.
- 2025-11-06: Removed Python fallbacks, adopted TypeScript ops tooling, and refreshed validation gates.
- 2025-11-04: Revised MCP preset guidance to point at `tools/adk/servers/`, documented `MAGSAG_MCP_DIR`, and synced metadata.
- 2025-11-04: Added MAG/SAG runtime guidance (subscription-first defaults, session storage, metrics endpoint).
- 2025-11-03: Documented MCP YAML sources under `tools/adk/servers/` and JSON-only runtime artefacts.
- 2025-11-02: Linked workflow guides, templates, and taxonomy reference.
- 2025-11-01: Migrated to the unified documentation standard and refreshed metadata.
- 2025-11-01: Expanded guidance on placement, machine-first writing, and best practices.

## Best Practices

### Maintainers

1. Review this file during onboarding and whenever workflows shift.
2. Keep validation commands runnable on clean environments; update them alongside tooling changes.
3. Cross-link ExecPlans or roadmap items when introducing multi-phase work.
4. Document approved exceptions (e.g., skipping slow tests) so assistants and contributors stay aligned.

### AI Assistants

1. Follow these instructions literally unless the user explicitly overrides them.
2. Note all skipped validations and state why they were skipped in the delivery message.
3. Surface ambiguities early; never guess about approvals, secrets, or destructive operations.
4. Reference relevant sections in progress updates so humans can audit decisions quickly.

## Anti-patterns to Avoid

- **Stale commands** – Review tooling flags whenever dependencies change.
- **Human-only language** – Replace “please remember” with direct imperatives.
- **Hidden prerequisites** – Document required environment variables or scripts before invoking commands.
- **Oversized scope** – Split instructions into subsystem `AGENTS.md` files when workflows diverge materially.
