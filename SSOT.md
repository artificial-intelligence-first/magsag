---
title: MAGSAG Single Source of Truth
slug: ssot
status: living
last_updated: 2025-11-06
last_synced: '2025-11-05'
tags:
- governance
- ssot
- documentation
summary: Defines canonical documentation surfaces, ownership, and update workflows
  for MAGSAG.
description: Defines canonical documentation surfaces, ownership, and update workflows
  for MAGSAG.
authors: []
sources:
- id: R1
  title: MAGSAG Agent Playbook
  url: AGENTS.md
  accessed: '2025-11-01'
- id: R2
  title: Contributing to MAGSAG
  url: CONTRIBUTING.md
  accessed: '2025-11-01'
---

# Single Source of Truth

> **For Humans**: Use this reference to locate authoritative documents, understand governance expectations, and coordinate updates across the repo.
>
> **For AI Agents**: Always update the SSOT location before touching downstream copies. Resolve conflicts by deferring to the canonical surface listed here.

## Canonical Document Map

| Domain | SSOT Location | Purpose |
|--------|---------------|---------|
| Agent operations | `AGENTS.md` | Day-one setup, validation, and delivery rules |
| Governance policies | `docs/policies/` | Security, conduct, and approval requirements |
| Documentation standards | `docs/governance/` | Frontmatter schema, style, taxonomy |
| Documentation workflows | `docs/workflows/` | Changelog, ExecPlan, and operational runbooks |
| Architecture overview | `docs/architecture/` | System design, workflows, skill conventions |
| TypeScript packages | `packages/` | CLI, governance, runners, observability, MCP utilities |
| Sandbox execution | `policy/default.policy.yaml`, `scripts/preflight.ts`, `scripts/sandbox-entry.sh`, `.github/workflows/sandbox-check.yml` | Codex sandbox policy, entrypoint hardening, preflight guardrails, CI enforcement |
| Demo surfaces | `apps/` | CLI / API shells demonstrating package usage |
| Development process | `docs/development/` | Roadmap, plans, contributing guides |
| Catalog assets | `catalog/` | Agent, skill, and policy definitions |
| Changelog | `CHANGELOG.md`, `docs/development/changelog.md` | Release notes and historical changes |

- Treat catalog templates (`catalog/agents/_template/`, `catalog/skills/_template/`) as authoritative for new entries.
- Store complex plans under `docs/development/plans/<slug>.md` and reference them from the summary list in `docs/architecture/plans.md`.

## Glossary

- **Single Source of Truth (SSOT)** — The one location that owns a definition, policy, or dataset. Downstream copies must reference it.
- **Canonical Definition** — Official description of a term or interface maintained in the SSOT.
- **Data Contract** — Schema and behavioural expectations agreed between producers and consumers (agents, skills, external services).
- **Governance Model** — Policies and validation gates that keep documentation, code, and catalog assets in sync.

## Update Workflow

1. **Identify** the SSOT location for the domain you are changing.
2. **Draft** changes in the canonical file, applying the style and frontmatter rules.
3. **Propagate** updates to dependent documents (e.g., README excerpts, guides).
4. **Validate** with current tooling (run `pnpm -r lint`, `pnpm -r typecheck`, `pnpm --filter docs lint || uv run python ops/tools/check_docs.py`, `npm run preflight`) and log outputs in delivery notes.
5. **Record** outcomes in the change log or plan update log.

Document skipped steps or deferred updates in delivery notes so follow-up actions remain visible.

## Data Contracts

- Author new schemas under `catalog/contracts/` using JSON Schema.
- Keep catalog registry entries (`catalog/registry/`) aligned with schema versions and MCP permissions.
- Update corresponding docs (`docs/architecture/ssot.md`) when introducing new contract terminology or enumerations.
- Record backward-incompatible changes in `CHANGELOG.md` and include migration notes.

### Key Contracts

| Contract | Location | Consumers |
|----------|----------|-----------|
| Candidate Profile | `catalog/contracts/candidate_profile.schema.json` | Offer orchestrators, compensation skills |
| Offer Packet | `catalog/contracts/offer_packet.schema.json` | Result aggregation, doc generation |
| Salary Band | `catalog/contracts/salary_band.schema.json` | Compensation advisor, governance checks |
| Flow Summary | `catalog/contracts/flow_summary.schema.json` | Governance gate, flow metrics tooling |

## MCP Standard Support

- **Canonical presets** – `ops/adk/servers/*.yaml` store editable MCP definitions. Regenerated artefacts will ship with the TypeScript sync tool; record manual JSON generation steps in delivery notes until available.
- **Transports** – Streamable HTTP is primary, Server-Sent Events provide backward compatibility, and stdio (`mcp-remote` / `mcp-obsidian`) remains a fallback.
- **CLI workflow** – `pnpm --filter @magsag/cli exec magsag mcp <command>` bootstraps configs, diagnoses connectivity, and documents authentication flows.
- **Observability** – MCP calls emit events through the TypeScript observability layer; attach manual context when automated summaries are missing.
- **Policies** – Agent YAML files may declare `policies.tools` overrides (`allow`, `require-approval`, `deny`) which are enforced before MCP execution.

## Conflict Resolution

When multiple sources disagree:

1. Gather all conflicting references and their `last_updated` metadata.
2. Confirm the correct canonical file from the table above.
3. Update the canonical surface with the verified information.
4. Align downstream references and note the reconciliation in the decision log or PR body.
5. Add regression safeguards (tests, validations) if discrepancies could recur.

Escalate governance or security ambiguities to maintainers before merging.

## Policies

### Change Management

1. Open a pull request describing the change, affected assets, and validation steps.
2. Update the canonical surface first, then adjust dependent docs.
3. Run documentation validators and domain-specific tests (schemas, catalog checks).
4. Obtain maintainer review; breaking changes require confirmation from governance owners.

### Versioning

- **Major** — Breaking schema changes, renamed files, or governance policy shifts.
- **Minor** — Backward-compatible additions (new optional fields, extra guidance).
- **Patch** — Typos, clarifications, or metadata tweaks.

Document release impact in `CHANGELOG.md` alongside the appropriate version.

### Deprecation

- Announce deprecation in the canonical doc and changelog.
- Provide migration steps (or pointers to plans) whenever behaviour changes.
- Maintain compatibility shims until the sunset date agreed with maintainers.

## Workflows

### Locating Canonical Sources

```bash
# List SSOT directories
ls docs/architecture/        # Architecture reference
ls docs/policies/            # Governance policies
ls catalog/                  # Agent and skill definitions

# Search for canonical markers
rg "source_of_truth" -g"*.md"
```

### Updating Canonical Docs

```bash
git checkout -b docs/refresh-<topic>
# Edit canonical file first
$EDITOR docs/architecture/ssot.md
# Propagate references
rg "old-term" -g"*.md" | xargs sed -i '' 's/old-term/new-term/g'
# Manual doc validation (tooling pending Workstream E)
git commit -am "docs(ssot): refresh <topic>"
```

Record validation commands and outcomes in the PR description or plan updates.

## Anti-patterns

- **Multiple sources** — Avoid duplicating definitions across README, wiki, and inline comments.
- **Silent drift** — Never change downstream docs without updating the SSOT first.
- **Implicit knowledge** — Replace “tribal memory” with documented policies or schemas.
- **Missing metadata** — Ensure canonical docs include frontmatter and update logs for auditability.

## Evaluation

Track SSOT health using the following indicators:

- **Uniqueness** — Each fact has exactly one canonical source.
- **Discoverability** — Canonical docs are reachable within two clicks or commands.
- **Consistency** — Downstream references match the SSOT version and terminology.
- **Currency** — `last_updated` fields and update logs reflect recent changes.
- **Compliance** — Documentation validators and governance gates pass before merging.

## Compliance Checklist

- [ ] Every Markdown document (except `README.md`) includes compliant frontmatter.
- [ ] Update logs in living documents reflect the latest change.
- [ ] Changelog entries cover user-facing or API-impacting changes.
- [ ] Catalog definitions remain consistent with code changes.
- [ ] Tests, lint, and documentation checks pass locally.

Use this checklist during review to prevent drift and retain SSOT integrity.

## See Also

- `docs/architecture/ssot.md` – Detailed terminology, schema tables, and governance contracts.
- `docs/policies/` – Security, conduct, and approval policies.
- `docs/governance/` – Frontmatter, style, and taxonomy specifications.
- `docs/development/plans/` – Active ExecPlans capturing multi-phase work.

## Update Log

- 2025-11-06: Added sandbox execution SSOT entries and folded preflight validation into the canonical workflow.
- 2025-11-05: Updated canonical surfaces for the TypeScript monorepo and aligned validation commands with pnpm workflows.
- 2025-11-03: Migrated MCP workflow to JSON runtime artefacts with YAML sources under `ops/adk/servers/`.
- 2025-11-03: Documented external SDK drivers, ADK sync pipeline, and CLI touchpoints.
- 2025-11-02: Added documentation workflows to the canonical map.
- 2025-11-01: Expanded SSOT guidance with glossary, data contracts, policies, and workflows aligned to ssot reference.
