---
title: ExecPlan Template
slug: plans-template
status: living
last_updated: 2025-11-01
last_synced: '2025-11-01'
tags:
- magsag
- plans
- workflow
summary: Standard template for planning, tracking, and closing multi-session MAGSAG
  work.
description: Standard template for planning, tracking, and closing multi-session MAGSAG
  work.
authors: []
sources: []
---

# ExecPlan Template

> **For Humans**: Copy this template into `docs/development/plans/<slug>.md` whenever you coordinate multi-session work.
>
> **For AI Agents**: Populate every section while you work. Keep timestamps in UTC and update validation results as you execute commands.

## Usage

- Place plan files under `docs/development/plans/`.
- Reference active plans from `docs/architecture/plans.md` and mark status changes immediately.
- Keep sections concise; link to supporting artefacts instead of duplicating details.

## Template

```markdown
# ExecPlan: <Title>

## Purpose / Big Picture
- Single sentence describing the desired outcome.

## To-do
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Progress
- 2025-11-01T12:00:00Z — Status update

## Decision Log
- 2025-11-01T12:00:00Z — Decision recorded here

## Surprises & Discoveries
- Unexpected findings or issues

## Outcomes & Retrospective
- Summary of results and learnings

## Context and Orientation
- Relevant documents
- Reference materials

## Plan of Work
1. Step outline 1
2. Step outline 2
3. Step outline 3

## Concrete Steps
1. [ ] Concrete step 1
2. [ ] Concrete step 2
3. [ ] Concrete step 3

## Validation and Acceptance
- Acceptance criteria
- Validation checkpoints

## Idempotence and Recovery
- How to re-run safely
- Recovery steps

## Artifacts and Notes
- Deliverables and notes

## Interfaces and Dependencies
- Interfaces touched
- Dependencies to monitor
```

## Update Log

- 2025-11-01: Converted template to the unified documentation format.
