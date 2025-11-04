---
title: Changelog Workflow
slug: workflows-changelog
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- documentation
- workflow
- changelog
summary: Process for drafting, reviewing, and synchronizing changelog entries across canonical surfaces.
description: Defines the lifecycle, responsibilities, and maintenance cadence for changelog updates anchored on the canonical CHANGELOG.md.
authors: []
sources:
- id: R1
  title: MAGSAG Single Source of Truth
  url: ../../SSOT.md
  accessed: '2025-11-02'
---

# Changelog Workflow

> **For Humans**: Follow this workflow to keep the canonical changelog accurate, auditable, and synchronised with downstream references.
>
> **For AI Agents**: Update canonical surfaces first, propagate changes downstream, and record validation results. Pause when scope or approvals are unclear.

## Overview

This document codifies how changelog entries are authored, reviewed, published, and maintained. Treat `CHANGELOG.md` as the single source of truth and mirror its content to secondary surfaces only after it is updated.

## Canonical Surfaces

| Surface | Purpose | Update Order |
|---------|---------|--------------|
| `CHANGELOG.md` | Canonical release notes for user-visible behavior changes. | 1 |
| `docs/development/changelog.md` | Redirect and lightweight summary; update when paths or metadata change. | 2 |
| `docs/workflows/changelog.md` | Workflow reference; update when the process itself changes. | 3 |

## Entry Structure

1. Organise sections as `## [Unreleased]` followed by dated releases in descending order.
2. Group items under headings such as `### Added`, `### Changed`, `### Fixed`, `### Deprecated`.
3. Lead each bullet with the observable outcome, then optional context or links (PRs, ExecPlans).
4. Attach migration guidance for breaking changes and cross-reference relevant docs.

## Update Workflow

1. **Assess** whether a change is user-facing or impacts public APIs, schemas, or governance policies.
2. **Draft** the entry under `## [Unreleased]` in `CHANGELOG.md`, using controlled headings and concise bullets.
3. **Propagate** references to ExecPlans, delivery notes, or documentation that quote the change.
4. **Validate** with current tooling (`pnpm docs:lint`, `pnpm -r lint`, `pnpm catalog:validate`) and capture results in delivery notes or `docs/development/validation-memo.md`.
5. **Review** the PR with at least one maintainer; secure two approvals for breaking changes.
6. **Release** by duplicating the `## [Unreleased]` block into a tagged section, stamping the release date in ISO 8601, and resetting `## [Unreleased]` for the next cycle.

## Maintenance Cadence

- **Monthly**: Reconcile outstanding Unreleased entries with tracking issues and ExecPlans; ensure links remain valid.
- **Quarterly**: Audit completed releases for unresolved follow-ups and roll them into active plans if needed.
- **Annually**: Revisit headings, categories, and formatting; reflect process changes here and in `docs/development/changelog.md`.

## Validation Commands

```bash
pnpm docs:lint
pnpm catalog:validate
pnpm -r lint
```

Log pass/fail status and remediation steps in delivery notes or `docs/development/validation-memo.md`.

## Update Log

- 2025-11-06: Swapped the Python fallback for TypeScript tooling (`pnpm docs:lint`, `pnpm catalog:validate`) and aligned validation guidance.
- 2025-11-05: Restored automated doc validation using pnpm with a Python fallback (historical; superseded on 2025-11-06).
- 2025-11-03: Added MCP sync dry-run to validation guidance.
- 2025-11-02: Adopted American English spelling throughout the workflow.
- 2025-11-02: Added initial workflow covering canonical surfaces, entry structure, maintenance cadence, and validation.
