---
title: MAGSAG Agent Playbook
slug: agents
status: living
last_updated: 2025-11-04
last_synced: '2025-11-03'
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

- Use Python 3.12 with [`uv`](https://docs.astral.sh/uv/) for dependency management: `uv sync --extra dev`.
- Run the Typer CLI via `uv run magsag --help` to explore supported commands.
- Keep new source modules under `src/magsag/`; catalog assets live in `catalog/`; documentation resides in `docs/`.
- Manage MCP configurations by editing YAML under `ops/adk/servers/` and regenerating runtime JSON with `uv run magsag mcp sync`.
- Start local services when needed:
  - API server: `uv run python -m magsag.api.server`
  - Flow validation: `uv run magsag flow validate <flow>`
- Configure secrets through environment variables prefixed with `MAGSAG_`. Never commit credentials.
- When `MAGSAG_ENGINE_MODE` is unset or `auto`, Codex/Claude CLIs are used; set `MAGSAG_ENGINE_MODE=api` to require SDK mode.

## Engine Runtime

- `MAGSAG_ENGINE_MODE` accepts `auto|subscription|api|oss`; `auto` selects subscription mode unless both OpenAI and Anthropic keys are configured.
- Use `MAGSAG_ENGINE_MAG` / `MAGSAG_ENGINE_SAG` to reassign roles to `codex-cli`, `claude-cli`, `openai-api`, or `anthropic-api` as needed.
- Codex CLI runs with `--ask-for-approval on-failure` and `--sandbox workspace-write`. Claude CLI runs with `--allowedTools "Read,Bash,Edit"` and `--permission-mode acceptEdits`.
- Session metadata persists to `.magsag/sessions/<engine>.json`. Provide notes with `--notes` (CLI) or `notes` in API requests.
- Typical commands:
  - `uv run magsag agent --repo . "Investigate flaky CI"`
  - `uv run magsag agent --mode api --mag openai-api --sag anthropic-api --repo . "Draft release summary"`
  - `uv run magsag agent --resume last --repo . "Continue prior Codex session"`
- Legacy slug execution is available via `uv run magsag agent -- run <slug>`.
- API parity via `POST /api/v1/agent/run`; aggregated health metrics available at `GET /api/v1/health/metrics`.

## Quality Gates

Execute these checks before pushing or requesting review:

```bash
uv run ruff check .
uv run mypy src tests
uv run pytest -q -m "not slow"
uv run python ops/tools/check_docs.py
```

- Run `uv run -m pytest -m slow` when touching flows, storage backends, or MCP integrations.
- Capture command results in the delivery note or PR body. State any skipped gates and the reason.

## Documentation Workflow

- Apply the frontmatter standard in `docs/governance/frontmatter.md` to every Markdown file except `README.md`.
- Update the canonical surfaces listed in `SSOT.md` first, then propagate references.
- Maintain update logs at the end of living documents (`docs/architecture/`, `docs/development/`, catalog templates).
- Follow workflow guides in `docs/workflows/changelog.md` and `docs/workflows/plans.md` when recording releases or long-running initiatives.
- Start new docs from the templates under `docs/_templates/` and align tags with `docs/governance/taxonomy.md`.
- Keep diagrams, examples, and CLI excerpts accurate. Link to deeper guides rather than duplicating content.
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

1. Create an isolated worktree: `uv run magsag wt new <run> --task <slug> --base main`.
2. Implement changes with complete typing and focused tests.
3. Stage related files only (`git add -u`); avoid drive-by edits.
4. Update `CHANGELOG.md` under `## [Unreleased]` for user-visible changes.
5. Draft concise commits using imperative Conventional Commit-friendly summaries (≤72 chars).

## Security & Governance

- Follow `docs/policies/security.md` and never embed secrets in tests or fixtures.
- Pause and ask for guidance when requirements conflict with `SSOT.md` or governance policies.
- Prefer incremental ExecPlans (`docs/development/plans/`) for multi-session work. Close plans with validation evidence.
- Record approvals and risk decisions in delivery notes to keep audits traceable.

## Reference Surfaces

- `SSOT.md` – Canonical document index and governance rules.
- `docs/governance/style.md` – Writing, formatting, and tone guidelines.
- `docs/governance/frontmatter.md` – Required metadata schema for Markdown.
- `docs/governance/taxonomy.md` – Controlled vocabulary for documentation tags.
- `docs/architecture/agents.md` – Deep dive into repository layout, workflows, and validation commands.
- `docs/workflows/changelog.md` / `docs/workflows/plans.md` – Changelog and ExecPlan operations.
- `catalog/` templates – Authoritative schema for agent and skill definitions.

## Update Log

- 2025-11-04: Added MAG/SAG runtime guidance (subscription-first defaults, session storage, metrics endpoint).
- 2025-11-03: Documented MCP YAML sources under `ops/adk/servers/` and JSON-only runtime artefacts.
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
