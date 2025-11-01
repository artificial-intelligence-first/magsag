---
title: Development Contribution Guide
slug: dev-contributing
status: living
last_updated: 2025-11-01
tags:
- magsag
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
last_synced: '2025-11-01'
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

- Python 3.12 or later.
- [`uv`](https://docs.astral.sh/uv/) for dependency management.

### Initial Steps

```bash
git clone https://github.com/artificial-intelligence-first/magsag.git
cd magsag
cp .env.example .env  # Populate credentials if required
uv sync              # Install runtime dependencies
uv sync --extra dev  # Install development extras (recommended)
```

Verify tooling:

```bash
uv run python --version
uv run magsag --help
```

## Validation Checklist

Run these commands before creating a pull request. Record pass/fail results in the delivery note.

```bash
uv run ruff check .
uv run mypy src tests
uv run pytest -q
uv run python ops/tools/check_docs.py
```

- Use `uv run pytest -m slow` for changes affecting flows, storage, or MCP integrations.
- Update or add tests alongside code modifications.

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

### Python

- Line length: 100 characters (configured in `pyproject.toml`).
- Formatting: `uv run ruff format .`
- Linting: `uv run ruff check .`
- Type hints: Strict `mypy` coverage; avoid `Any` when possible.
- Document public APIs with concise docstrings.

### Testing

- Use pytest with async fixtures (`pytest-asyncio`) where needed.
- Group tests by surface (`tests/unit`, `tests/agents`, `tests/mcp`, etc.).
- Provide descriptive assertions and fixtures instead of duplicating setup logic.

### Documentation

- Update `AGENTS.md`, `SSOT.md`, and surface-specific docs when behaviours change.
- Ensure every Markdown file (except `README.md`) includes compliant frontmatter.
- Use the style guide in `docs/governance/style.md`.

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

- 2025-11-01: Rebuilt guide using the unified documentation standard.
- 2025-10-24: Added structured contribution guidelines and setup notes.
