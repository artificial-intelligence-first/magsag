---
title: Documentation Style Guide
slug: documentation-style
status: living
last_updated: 2025-11-05
last_synced: '2025-11-05'
tags:
- documentation
- governance
- standards
summary: Writing, formatting, and structural rules that keep MAGSAG documentation
  consistent and machine-friendly.
description: Writing, formatting, and structural rules that keep MAGSAG documentation
  consistent and machine-friendly.
authors: []
sources: []
---

# Documentation Style Guide

> **For Humans**: Follow these rules to produce clear, consistent, and maintainable documentation across the repository.
>
> **For AI Agents**: Enforce this style when editing Markdown. Flag violations instead of guessing.

## Writing Principles

### Clarity

- Prefer concrete language and active voice (“Run the command”).
- Lead with the outcome before diving into implementation detail.
- Replace vague references (“it”, “that”) with explicit nouns.
- Provide short examples when a concept may be ambiguous.

### Conciseness

- Keep paragraphs to 3–5 sentences; use lists for multi-step workflows.
- Remove redundancy and avoid hedging phrases (“just”, “maybe”, “probably”).
- Keep sentences focused on a single idea; split long sentences when needed.

### Consistency

- Reuse terminology defined in `SSOT.md` and catalog schemas.
- Mirror naming conventions used in code, policies, and templates.
- Maintain the same heading order and labelling across related documents.

### Actionability

- Focus on what to do and how to validate it; move rationale into references.
- Provide command blocks, sample payloads, and acceptance criteria where possible.
- Highlight escalation triggers so AI assistants know when to pause.

## Document Structure

All Markdown documents follow this order:

1. **Frontmatter** — YAML metadata as defined in `docs/governance/frontmatter.md`.
2. **Title (H1)** — Matches the `title` field.
3. **Dual-audience statement** — “For Humans” and “For AI Agents” paragraphs.
4. **Overview** — Context or summary in one short section.
5. **Core content** — Organised with predictable H2/H3 headings.
6. **Examples / Validation** — Commands, scenarios, or checklists.
7. **See also / References** — Related documents and external citations.

### Heading Hierarchy

```markdown
# Document Title (H1, one per file)

## Major Section (H2, Title Case)

### Subsection (H3, sentence case)

#### Detail (H4, sparingly)
```

- Do not skip levels (H1 → H3).
- Avoid H5+ unless strictly necessary; prefer reorganising content instead.

## Formatting Conventions

### Text Emphasis

- Use **bold** on the first mention of important terms.
- Use *italics* sparingly for emphasis or introduced terminology.
- Reserve blockquotes for notes, warnings, or dual-audience statements.

### Lists

- Use `-` for unordered lists and `1.` for ordered lists; keep phrasing parallel.
- Start each list item with a capital letter and end with a period only when the item is a full sentence.

### Code Blocks

```bash
# Manual doc validation (tooling pending Workstream E)
```

- Always include a language identifier.
- Keep examples runnable or provide expected output alongside the command.
- Annotate non-trivial code snippets with brief comments explaining intent.

### Tables

- Include a header row and align pipes for readability.
- Keep cell content concise; use references to point to longer explanations.

## Language Usage

- Introduce abbreviations in full on first use (e.g., “Single Source of Truth (SSOT)”).
- Use American English spelling.
- Avoid marketing language or unverified claims; prefer neutral, factual tone.
- Link to glossary entries or canonical definitions when introducing new terms.

## Code Documentation

- Inline comments should explain *why* rather than restating *what* the code does.
- Provide docstrings for public APIs, including arguments, return values, and error conditions.
- When demonstrating patterns, supply complete, runnable examples that mirror repository conventions.

## Markdown Hygiene

- Wrap text around 100 characters where feasible to keep diffs reviewable.
- Ensure Unix line endings and strip trailing whitespace.
- Update the `last_updated` field and append to the document’s update log after substantive changes.
- Embed relative links instead of absolute URLs for repository resources.

## Validation

```bash
pnpm --filter docs lint || uv run python ops/tools/check_docs.py
pnpm -r lint
```

Capture command results (pass/fail plus remediation) in PR descriptions or delivery notes so reviewers can audit coverage.

## Taxonomy

Use the controlled vocabulary maintained in `docs/governance/taxonomy.md`; extend cautiously and update that file before applying new tags elsewhere. Common tags include:

| Tag | Usage |
|-----|-------|
| `magsag` | Repository-wide context |
| `governance` | Policies, approvals, SSOT |
| `workflow` | Execution or delivery steps |
| `architecture` | System design references |
| `catalog` | Agent, skill, or policy definitions |
| `documentation` | Meta-documentation guidance |
| `testing` | Quality gates, validation |

## Change Log

- 2025-11-05: Restored scripted validation using pnpm with Python fallback.
- 2025-11-02: Redirected tag guidance to the dedicated taxonomy reference.
- 2025-11-01: Established and expanded documentation style rules with detailed structures, formatting, and hygiene guidance.
