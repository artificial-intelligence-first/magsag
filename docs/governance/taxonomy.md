---
title: Documentation Tag Taxonomy
slug: documentation-taxonomy
status: living
last_updated: 2025-11-02
last_synced: '2025-11-02'
tags:
- documentation
- governance
- metadata
summary: Controlled vocabulary for documentation tags and their intended usage.
description: Defines the canonical tag list, naming rules, and maintenance cadence for Markdown frontmatter across the repository.
authors: []
sources:
- id: R1
  title: Markdown Frontmatter Specification
  url: frontmatter.md
  accessed: '2025-11-02'
- id: R2
  title: Documentation Style Guide
  url: style.md
  accessed: '2025-11-02'
---

# Documentation Tag Taxonomy

> **For Humans**: Apply tags from this list to keep navigation, search, and automation consistent across the repository.
>
> **For AI Agents**: Use only the tags listed here unless you first update this document. Record tag changes in delivery notes and update logs.

## Tag Rules

- Tags are lowercase, kebab-case, and ≤20 characters.
- Assign 1–7 tags per document in descending order of relevance.
- Update `last_updated` and append to the document’s update log when changing tags.
- Introduce new tags only after documenting them here with description and typical surfaces.

## Controlled Vocabulary

| Tag | Description | Typical Surfaces |
|-----|-------------|------------------|
| `agents` | Agent-specific workflows, coordination patterns, and role definitions. | `docs/architecture/agents.md`, `docs/guides/a2a-communication.md` |
| `api` | API usage, endpoints, and HTTP client guidance. | `docs/guides/api-usage.md` |
| `approvals` | Approval workflows, governance gates, and permission policies. | `docs/approval.md` |
| `architecture` | System design, components, and runtime diagrams. | `docs/architecture/*.md` |
| `catalog` | Agent, skill, and policy registry references. | `catalog/`, `docs/architecture/skills.md` |
| `cache` | Caching strategies, semantic cache configuration, and eviction policies. | `docs/guides/semantic-cache.md` |
| `changelog` | Release notes, change tracking, and version history. | `CHANGELOG.md`, `docs/workflows/changelog.md` |
| `community` | Collaboration norms, conduct guidelines, and community policies. | `docs/policies/code-of-conduct.md` |
| `contributing` | Contributor onboarding, review expectations, and process guides. | `CONTRIBUTING.md`, `docs/development/contributing.md` |
| `cost` | Cost management, budgeting techniques, and optimisation strategies. | `docs/guides/cost-optimization.md` |
| `development` | Developer workflows, tooling setup, and local environment practices. | `docs/development/*.md` |
| `documentation` | Meta-documentation guidance, templates, and style rules. | `docs/governance/*.md`, `docs/_templates/*.md` |
| `durability` | Durable run management, persistence strategies, and recovery flows. | `docs/durable-run.md` |
| `governance` | Governance policies, compliance rules, and SSOT guidance. | `AGENTS.md`, `SSOT.md`, `docs/governance/*.md` |
| `github` | GitHub integration workflows, automation, and webhook usage. | `docs/guides/github-integration.md` |
| `integration` | Third-party integrations, MCP adapters, and bridge components. | `docs/guides/mcp-integration.md`, `docs/guides/runner-integration.md` |
| `mcp` | Model Context Protocol configuration, runtime, and server guidance. | `docs/mcp.md`, `docs/guides/mcp-*.md` |
| `memory` | Memory modules, state management, and retention policies. | `docs/memory.md` |
| `migration` | Migration plans, upgrade paths, and compatibility notes. | `docs/guides/migration.md`, `docs/guides/mcp-migration.md` |
| `moderation` | Content moderation workflows and policy enforcement. | `docs/guides/moderation.md` |
| `observability` | Logging, tracing, metrics, and monitoring practices. | `docs/architecture/observability.md`, `docs/guides/runner-integration.md` |
| `orchestration` | Agent orchestration, flow control, and coordination. | `docs/guides/a2a-communication.md`, `docs/architecture/agents.md` |
| `performance` | Performance tuning, benchmarks, and optimisation tactics. | `docs/guides/semantic-cache.md`, `benchmarks/` docs |
| `plans` | ExecPlans, multi-session work tracking, and roadmap items. | `docs/workflows/plans.md`, `docs/development/plans/*.md` |
| `policy` | Security and operational policies covering organisational requirements. | `docs/policies/*.md` |
| `providers` | External providers, platform adapters, and connector configuration. | `docs/guides/multi-provider.md` |
| `quality` | Quality assurance, linting, testing, and validation checklists. | `docs/development/issues/mypy-ruff-cleanup.md` |
| `reference` | Reference material, schemas, and API documentation. | `docs/architecture/ssot.md`, `docs/guides/api-usage.md` |
| `routing` | Routing strategies, request dispatch, and load management. | `docs/guides/multi-provider.md` |
| `runners` | Runner integrations, lifecycle hooks, and orchestration runners. | `docs/guides/runner-integration.md` |
| `security` | Security policies, threat models, and hardening steps. | `docs/policies/security.md` |
| `skills` | Skill authoring guidance, conventions, and templates. | `docs/architecture/skills.md`, `catalog/skills/` |
| `ssot` | Single Source of Truth definitions and canonical references. | `SSOT.md`, `docs/architecture/ssot.md` |
| `storage` | Storage backends, retention policies, and data persistence. | `docs/storage.md`, `docs/memory.md` |
| `template` | Reusable scaffolding and document templates. | `docs/_templates/*.md` |
| `testing` | Testing strategies, coverage goals, and validation tooling. | `docs/development/contributing.md`, `docs/development/issues/*.md` |
| `tooling` | Developer tooling, scripts, and automation support. | `docs/development/worktrees.md`, `ops/` docs |
| `tracking` | Issue tracking, status reporting, and audit notes. | `docs/development/issues/*.md`, ExecPlans |
| `upgrades` | Upgrade flows, version compatibility, and rollout planning. | `docs/guides/migration.md` |
| `workflow` | Operational workflows, delivery pathways, and automation procedures. | `AGENTS.md`, `docs/workflows/*.md` |

## Maintenance Cadence

- **Monthly**: Review new tags introduced in commits or PRs and reconcile them with this list.
- **Quarterly**: Audit tag usage for duplication or drift; consolidate or rename entries as needed.
- **Annually**: Re-evaluate coverage against product scope and update descriptions or examples.

## Requesting New Tags

1. Draft the proposed tag entry (name, description, typical surfaces) in this file.
2. Link the draft to an ExecPlan or issue describing the new scope.
3. Submit a PR including updates to impacted documents and validation evidence.
4. Obtain maintainer approval before applying the new tag elsewhere.

## Validation Commands

Automated validation is unavailable. When adjusting tag assignments, manually verify frontmatter tags and document the review in delivery notes.

## Update Log

- 2025-11-04: Documented manual validation flow during TypeScript tooling migration.
- 2025-11-02: Expanded the controlled vocabulary to cover all in-repo tags and refreshed metadata.
