---
title: ExecPlan Workflow
slug: workflows-plans
status: living
last_updated: 2025-11-04
last_synced: '2025-11-04'
tags:
- documentation
- workflow
- plans
summary: Governance workflow for creating, maintaining, and closing ExecPlans that span multiple work sessions.
description: Describes when to author ExecPlans, required sections, review expectations, and maintenance cadence for long-running initiatives.
authors: []
sources:
- id: R1
  title: ExecPlan Quick Reference
  url: ../architecture/plans.md
  accessed: '2025-11-02'
---

# ExecPlan Workflow

> **For Humans**: Rely on this workflow to keep cross-session initiatives traceable, auditable, and aligned with governance policies.
>
> **For AI Agents**: Create or update ExecPlans whenever work spans sessions or stakeholders. Record validation evidence and timestamps in UTC.

## Overview

ExecPlans capture multi-session delivery work that needs explicit ownership, validation steps, and decision history. Treat the plan as the operational playbook that complements issues, PRs, and changelog entries.

## When to Create an ExecPlan

- Feature or refactor work that spans multiple subsystems (CLI, API, catalog, docs).
- Changes requiring staged rollout, migration steps, or external approvals.
- Incident response, remediation, or governance-policy updates.
- Any task paused and resumed across working sessions or contributors.

## Canonical Structure

Store plans under `docs/development/plans/<slug>.md` using this outline:

```markdown
# <Action Title>

## Purpose
- One-sentence statement of success and why the work matters.

## Context
- Links to SSOT entries, issues, diagrams, or prior plans.

## Plan of Work
1. Ordered steps with owners and dependencies.

## Validation
- Commands, expected outputs, rollback strategy.

## Status
- [YYYY-MM-DD HH:MM UTC] Progress notes and decisions.

## Follow-up
- Remaining tasks, PRs, monitoring dashboards, or scheduled reviews.
```

## Update Workflow

1. **Draft** the plan file and add it to `docs/architecture/plans.md` under “Active Plans.”
2. **Trace** progress by appending timestamped status entries in UTC as work evolves.
3. **Validate** each deliverable. Until doc tooling returns, rely on manual review and note outcomes in the `Validation` section.
4. **Decide**: document approvals, blockers, or scope changes in the decision log.
5. **Close** after completion: finalise validation evidence, move the plan to “Completed Plans” in the index, and link related changelog entries.

## Review Expectations

- Keep plans lightweight but current; avoid more than three days without a status update when work is active.
- Request maintainer feedback when scope changes, risks emerge, or validation fails.
- Store supporting assets (scripts, diagrams) alongside the plan under the same slug.

## Maintenance Cadence

- **Weekly**: Project owner reviews active plans for stale status updates or missing validation logs.
- **Monthly**: Archive completed plans and ensure they point to changelog entries or delivery notes.
- **Quarterly**: Audit plan structure for consistency and update this workflow if new sections or metadata are required.

## Validation Commands

Document validation evidence manually (frontmatter, timestamps, links, MCP artefacts) until the TypeScript doc tooling is available. Record findings and remediation notes in delivery updates or the plan’s `Validation` section.

## Update Log

- 2025-11-04: Switched to manual documentation validation notes while TypeScript tooling is in-flight.
- 2025-11-03: Added MCP sync dry-run to validation checklist.
- 2025-11-02: Established workflow outlining plan triggers, canonical structure, review cadence, and validation commands.
