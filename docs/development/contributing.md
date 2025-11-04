---
title: Development Contribution Guide
slug: dev-contributing
status: living
last_updated: 2025-11-04
tags:
- contributing
- development
summary: Developer-focused setup, validation, and delivery workflow for contributing
  to MAGSAG.
authors: []
sources:
- id: R1
  title: Repository Contribution Guide
  url: ../../CONTRIBUTING.md
  accessed: '2025-11-01'
last_synced: '2025-11-04'
description: Developer-focused setup, validation, and delivery workflow for contributing
  to MAGSAG.
---

# Development Contribution Guide

> **For Humans**: Follow this handbook for daily development tasks—environment setup, validation commands, and delivery expectations.
>
> **For AI Agents**: Apply every checklist exactly. Update metadata, documentation, and changelog entries as part of each change.

## Project Status

MAGSAG is primarily maintained for internal use, but external contributions aligned with the roadmap are welcome. Proposals, bug reports, and doc improvements help maintainers prioritise work.

## Environment Setup

### Prerequisites

- Node.js 18.18+ (22.x LTS recommended).
- [pnpm 9](https://pnpm.io/installation).
- Codex CLI / Claude CLI signed in for subscription mode (optional).

### Initial Steps

```bash
git clone https://github.com/artificial-intelligence-first/magsag.git
cd magsag
pnpm install
```

Explore tooling:

```bash
pnpm --filter @magsag/cli exec magsag --help
pnpm --filter @magsag/cli exec magsag agent run --repo . "Smoke test prompt"
```

## Validation Checklist

Run these commands before creating a pull request. Record pass/fail results in the delivery note.

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
```

- Narrow scope with `pnpm --filter @magsag/<pkg> lint|typecheck|test` for focused changes.
- Document manuals: until doc tooling returns, perform frontmatter/tag review by hand and log results in delivery notes.
- Add or update tests alongside code modifications.

## Branching & Workflow

1. Branch from `main` using `feature/<slug>` or `fix/<issue>`.
2. Keep commits focused; use Conventional Commit-friendly messages (`feat`, `fix`, `docs`, etc.).
3. Maintain an ExecPlan (`docs/development/plans/<slug>.md`) for multi-session efforts and keep status timestamps in UTC.
4. Update `CHANGELOG.md` under `## [Unreleased]` for user-visible changes.

### Changelog Snippet

```markdown
## [Unreleased]
### Added
- Describe new capability.

### Changed
- Explain behavioural changes.

### Fixed
- Document bug fixes.
```

## Code Quality Standards

### TypeScript & Tooling

- Target ECMAScript 2022; modules ship as ESM.
- Formatting/Linting: follow `eslint.config.js` (`pnpm --filter @magsag/<pkg> lint`).
- Type checking: `pnpm --filter @magsag/<pkg> typecheck`.
- Use explicit types; avoid `any` unless justified with comments.
- Keep `packages/shared-logging` light—prefer dependency injection over ad-hoc logging.

### Testing

- Vitest is the default test runner (`pnpm --filter @magsag/<pkg> test`).
- Group tests per package (`packages/*/src/*.test.ts`).
- For integration coverage (CLI, runners), add dedicated suites under `packages/cli` or the relevant runner package.

### Documentation

- Update `AGENTS.md`, `SSOT.md`, and surface-specific docs when behaviours change.
- Ensure every Markdown file (except `README.md`) includes compliant frontmatter.
- Use the style guide in `docs/governance/style.md`.
- Start new docs from `docs/_templates/` and validate tags against `docs/governance/taxonomy.md`.

## Pull Request Process

Before submitting:

- Ensure quality gates pass locally.
- Rebase on the latest `main`.
- Stage only related files.
- Include changelog and documentation updates.

PR expectations:

- Title uses Conventional Commit style.
- Description summarises changes, testing, and follow-up work.
- Attach logs or output from validation commands when relevant.
- Request review from maintainers or codeowners.

## Resources

- Repository: https://github.com/artificial-intelligence-first/magsag
- Issues: https://github.com/artificial-intelligence-first/magsag/issues
- Pull Requests: https://github.com/artificial-intelligence-first/magsag/pulls

## Update Log

- 2025-11-04: Migrated the contribution workflow to the TypeScript + pnpm toolchain and documented manual doc validation.
- 2025-11-02: Linked documentation templates and taxonomy usage.
- 2025-11-01: Rebuilt guide using the unified documentation standard.
- 2025-10-24: Added structured contribution guidelines and setup notes.
