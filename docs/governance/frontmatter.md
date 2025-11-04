---
title: Markdown Frontmatter Specification
slug: frontmatter
status: living
last_updated: 2025-11-05
last_synced: '2025-11-05'
tags:
- documentation
- governance
- metadata
summary: Required YAML metadata schema for every Markdown file maintained in MAGSAG.
description: Required YAML metadata schema for every Markdown file maintained in MAGSAG.
authors: []
sources:
- id: R1
  title: Documentation as Code - Write the Docs
  url: https://www.writethedocs.org/guide/docs-as-code/
  accessed: '2025-11-01'
---

# Markdown Frontmatter Specification

> **For Humans**: Apply this schema when creating or editing Markdown so automated tooling can index, validate, and audit documentation.
>
> **For AI Agents**: Refuse to create or modify Markdown that does not follow this specification unless the user explicitly overrides the requirement.

## Core Schema (v1)

 every Markdown file **except** `README.md` must start with YAML frontmatter containing these fields:

```yaml
---
title: Document Title             # 1–100 characters
slug: url-safe-slug               # ^[a-z0-9]+(-[a-z0-9]+)*$
status: living                    # draft|living|stable|deprecated
last_updated: 2025-11-01          # ISO 8601 date
last_synced: 2025-11-01           # ISO 8601 date; mirrors upstream SSOT when applicable
tags: [tag1, tag2]                # ≤7 lowercase tags
summary: "Description < 160 chars"
description: "Longer sentence or two for searchability"
authors: []                       # Optional list of contributors
sources: []                       # Optional references
---
```

### Field Rules

| Field | Type | Required | Constraints | Example |
|-------|------|----------|-------------|---------|
| `title` | string | ✅ | 1–100 chars | "Agent Runner Overview" |
| `slug` | string | ✅ | lowercase kebab-case, 3–64 chars | "agent-runner-overview" |
| `status` | enum | ✅ | draft, living, stable, deprecated | "living" |
| `last_updated` | date | ✅ | ISO 8601 (`YYYY-MM-DD`) | "2025-11-01" |
| `last_synced` | date | ✅ | ISO 8601 (`YYYY-MM-DD`) | "2025-11-01" |
| `tags` | array | ✅ | 1–7 lowercase items, ≤20 chars each | ["magsag", "governance"] |
| `summary` | string | ✅ | ≤160 chars, single line | "Lifecycle and rollout playbook." |
| `description` | string | ✅ | ≤240 chars, may span multiple sentences | "Detailed playbook for maintaining ExecPlans." |
| `authors` | array | ⚪ | Optional display names | ["Maintainer", "AI Assistant"] |
| `sources` | array | ⚪ | ≤10 entries, see format below | See example |

Sources follow this structure:

```yaml
sources:
  - id: R1
    title: "Source Title"
    url: "https://example.com/resource"
    accessed: "2025-11-01"
```

### Synced Metadata

- `last_updated` reflects the date this document was most recently changed.
- `last_synced` indicates when the content was last reconciled with its upstream SSOT reference (if applicable). Use the same date as `last_updated` when no external source exists.
- `description` provides a longer search-friendly summary (one or two sentences) and complements the shorter `summary` field used in navigation menus.

## Syntax Conventions

- Use spaces (no tabs) for indentation.
- Quote strings with special characters (`:`, `#`, `,`, leading/trailing spaces).
- Arrays may use flow style (`[a, b]`) or block style (each item on its own line); remain consistent within a document.
- Booleans must be lowercase `true` or `false`.

## Validation

Run the validator before pushing:

```bash
pnpm --filter docs lint || uv run python ops/tools/check_docs.py
```

The script enforces required fields, slug patterns, tag casing, summary limits, and ISO 8601 dates. Record command results in delivery notes.

## Status Lifecycle

```
draft → living → stable → deprecated
```

- **draft**: Early iterations or proposals.
- **living**: Actively maintained content (default for most guides).
- **stable**: Mature docs that change rarely.
- **deprecated**: Superseded docs retained for reference; include replacement links.

## Tag Taxonomy

Use tags from the controlled vocabulary in `docs/governance/taxonomy.md`. Update that file before applying new tags elsewhere and keep usage consistent across related docs.

## Change Log

Record frontmatter schema updates here:

- 2025-11-05: Restored scripted validation using pnpm with Python fallback during the TypeScript migration.
- 2025-11-04: Documented manual frontmatter review while TypeScript doc tooling is in-flight.
- 2025-11-02: Redirected tag guidance to the dedicated taxonomy document.
- 2025-11-02: Restored `last_synced` and `description` as required fields to align with `ops/tools/check_docs.py`.
- 2025-11-01: Introduced v1 schema and validation requirements for the MAGSAG repository.
