---
title: MCP Server Presets
status: living
last_updated: 2025-11-03
tags:
  - mcp
  - presets
summary: Workspace guidance for managing MCP server configurations shipped with MAGSAG.
---

# Model Context Protocol Presets

This directory stores MCP server configurations that the MAGSAG runtime discovers at start-up. Use the Typer CLI (`magsag mcp bootstrap`) to copy bundled presets into `.mcp/servers/` and keep them up to date.

## Bundled Remote Presets

| Provider | Transport Chain | Notes |
|----------|-----------------|-------|
| `notion` | HTTP → SSE → stdio (`mcp-remote -y`) | Streamable HTTP is primary; SSE keeps backwards compatibility; stdio is the rescue path. |
| `supabase` | HTTP | OAuth is the default; CI/headless runs may pass a PAT and `project_ref`. |
| `github` | HTTP | Requires GitHub Copilot license for some tools; write operations require explicit approval. |
| `obsidian` | stdio (`uvx mcp-obsidian`) | Targets the Obsidian Local REST API plugin with vault-scoped keys. |

Run `magsag mcp bootstrap --provider all` to refresh all four presets or specify a provider to update a single file.

## Local Reference Servers

Additional sample configs (filesystem, fetch via `@pulsemcp/pulse-fetch`, memory, pg-readonly) may live in this directory for development and regression testing. These servers are not part of the bundled preset set—maintainers curate them manually as needed. Keep their paths repository-relative and pin npm package versions to avoid drift.

## CLI Workflow

```bash
magsag mcp bootstrap        # Copy bundled presets into .mcp/servers/
magsag mcp ls               # Inspect available providers and transports
magsag mcp doctor           # Probe HTTP → SSE → stdio connectivity
magsag mcp login github     # Launch provider-specific auth flows
magsag mcp inspect notion   # Render the resolved YAML with environment expansion
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `MAGSAG_MCP_SUPABASE_PROJECT_REF` | Optional project reference appended to Supabase HTTP URLs (CI only). |
| `MAGSAG_MCP_SUPABASE_ACCESS_TOKEN` | Supabase OAuth token or CI PAT (used when present). |
| `MAGSAG_MCP_SUPABASE_READONLY` | Controls read-only behaviour exposed to Supabase tools (`true` by default). |
| `MAGSAG_MCP_GITHUB_PAT` | Least-privilege GitHub PAT for headless scenarios; OAuth remains the preferred path. |
| `OBSIDIAN_API_KEY` / `OBSIDIAN_HOST` / `OBSIDIAN_PORT` | Obsidian Local REST API credentials for the stdio bridge. |
| `PG_RO_URL` | Connection string for optional `pg-readonly.yaml` PostgreSQL server definitions. |

Store long-lived secrets in the OS keychain when possible and export them to the shell only for ephemeral sessions.

## Observability

MCP calls log to `.runs/agents/<run_id>/mcp_calls.jsonl` and attach transport metadata (including `mcp.session_id`, `mcp.protocol_version`, and HTTP status) to OpenTelemetry spans. Use these artefacts when diagnosing connectivity or policy issues.

## Maintenance

1. Update presets in `src/magsag/mcp/presets/servers/` when publishing changes.  
2. Run `magsag mcp bootstrap --force` to regenerate local copies.  
3. Record user-facing changes in `CHANGELOG.md` under `## [Unreleased]`.  
4. Keep this README aligned with `docs/guides/mcp-integration.md` and the SSOT.
