---
title: ExecPlan Quick Reference
slug: architecture-plans
status: living
last_updated: 2025-11-01
tags:
- magsag
- plans
- workflow
summary: Lightweight framework for creating, maintaining, and closing ExecPlans.
authors: []
sources: []
last_synced: '2025-11-01'
description: Lightweight framework for creating, maintaining, and closing ExecPlans.
---

# ExecPlan Quick Reference

> **For Humans**: Use this checklist to capture intent, validation, and decisions for multi-session work without adding overhead.
>
> **For AI Agents**: Create or update ExecPlans whenever tasks span sessions. Keep status notes current.

## Overview

ExecPlans are lightweight documents that capture intent, validation, and handoff notes for work that spans multiple sessions or contributors. Keep them short, link to relevant assets, and update them while you work.

## When to Create One

- Feature work that spans CLI, API, and catalog changes.
- Infrastructure migrations (storage engines, observability backends).
- Governance or policy changes that affect more than one surface.
- Incident response efforts that require traceable decisions.

## Minimal Template

Store plans in `docs/development/plans/<slug>.md` and follow this structure:

```markdown
# <Action title>

## Purpose
- Why this is needed, success in one sentence.

## Context
- Links to issues, SSOT entries, diagrams, docs.

## Plan of Work
1. Ordered steps with owners.
2. Risks or dependencies.

## Validation
- Commands with expected outcomes.
- Rollback or recovery notes if something fails.

## Status
- [YYYY-MM-DD HH:MM UTC] Progress updates.
- Decision log with rationale.

## Follow-up
- Remaining tasks or references (PRs, dashboards).
```

## Workflow Checklist

1. Draft the file and add it to the “Active Plans” list in `PLANS.md`.
2. Update the `Status` and `Decision` sections in real time using UTC.
3. Record the exact validation commands you ran, including failures.
4. Close the plan once the work ships (checklist complete, outcomes noted).
5. Move the entry to “Completed Plans” and cross-link changelog or docs.

## Best Practices

- Keep language direct; use links instead of lengthy quotes.
- Prefer multiple small plans over one bloated document.
- Attach supporting scripts or diagrams next to the plan under the same slug.
- Reflect key learnings in `docs/architecture/ssot.md` or other canonical surfaces.

## Update Log

- 2025-11-01: Adopted the unified documentation format and clarified audience guidance.
