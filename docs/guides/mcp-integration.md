---
title: Model Context Protocol (MCP) Integration
slug: guide-mcp-integration
status: living
last_updated: 2025-11-04
last_synced: '2025-11-04'
tags:
  - mcp
  - integration
summary: TypeScript-first workflow for discovering MCP servers, authenticating providers, and observing HTTP-first tool calls with governance safeguards.
description: End-to-end reference for configuring MCP transports, diagnosing connectivity, enforcing approval policies, and wiring skills to the shared TypeScript runtime and CLI.
authors: []
sources: []
---

# Model Context Protocol (MCP) Integration

> **For Humans**: Use this guide to stand up MCP providers, authenticate safely, and keep observability plus approvals intact.  
> **For AI Agents**: Honour permissions and tool policies before executing MCP calls; surface missing configuration instead of silently degrading.

## Executive Summary

- Streamable HTTP is the primary transport for remote MCP servers.  
- Server-Sent Events (SSE) provides backward compatibility, and stdio (`mcp-remote -y` or `uvx mcp-obsidian`) is the last-resort fallback.  
- `magsag mcp ls|doctor` covers preset discovery, tool enumeration, and connectivity diagnostics.  Remaining automation (preset sync, auth helpers) will be reintroduced once the TypeScript CLI surface stabilises—track it in Workstream E.
- Catalog skills now publish MCP tools via `@magsag/catalog-mcp`, and the CLI auto-registers them for MAG/SAG runners.
- Supabase defaults to browser OAuth; CI runs may supply a PAT plus `project_ref`. GitHub tooling may require an active Copilot license.  
- Observability records `mcp.session_id`, `mcp.protocol_version`, HTTP status, retries, and policy outcomes for every invocation.

## Quick Start

```bash
# 1. Install workspace dependencies
pnpm install

# 2. List preset IDs sourced from ops/adk/servers/*.yaml
pnpm --filter @magsag/cli exec magsag mcp ls

# 3. Enumerate tools for a specific preset (HTTP → SSE → stdio fallback)
pnpm --filter @magsag/cli exec magsag mcp ls notion

# 4. Diagnose connectivity and authentication issues
pnpm --filter @magsag/cli exec magsag mcp doctor supabase --json
```

Edit `ops/adk/servers/<provider>.yaml` directly when presets change upstream, then capture the update in delivery notes plus `docs/development/plans/typescript-full-migration.md`. A TypeScript-based preset synchroniser will follow in Workstream E.

## Bundled Preset Reference

Each preset lives in `ops/adk/servers/<provider>.yaml`; the CLI reads these files at runtime and expands `${VAR}` placeholders using `process.env`.

### Notion (`notion.yaml`)

```yaml
id: notion
version: "1"
description: "Notion MCP (HTTP first; SSE/STDIO fallback)"
transport:
  type: http
  url: "https://mcp.notion.com/mcp"
fallback:
  - type: sse
    url: "https://mcp.notion.com/sse"
  - type: stdio
    command: "npx"
    args: ["-y", "mcp-remote", "https://mcp.notion.com/mcp"]
permissions:
  scope: ["read:pages", "read:databases"]
notes: "Streamable HTTP is primary. SSE/STDIO are compatibility and rescue fallbacks."
```

### Supabase (`supabase.yaml`)

```yaml
id: supabase
version: "1"
description: "Supabase MCP (HTTP; OAuth default, CI PAT optional)"
transport:
  type: http
  url: "https://mcp.supabase.com/mcp${MAGSAG_MCP_SUPABASE_PROJECT_REF:+?project_ref=${MAGSAG_MCP_SUPABASE_PROJECT_REF}}"
  headers:
    Authorization: "${MAGSAG_MCP_SUPABASE_ACCESS_TOKEN:+Bearer ${MAGSAG_MCP_SUPABASE_ACCESS_TOKEN}}"
options:
  read_only: "${MAGSAG_MCP_SUPABASE_READONLY:true}"
permissions:
  scope: ["db:select", "db:describe"]
notes: "Use browser OAuth by default. Reserve PAT + project_ref for CI or headless environments."
```

- **OAuth flow**: `pnpm --filter @magsag/cli exec magsag mcp login supabase` launches the browser-based flow.  
- **CI mode**: Set `MAGSAG_MCP_SUPABASE_ACCESS_TOKEN` and `MAGSAG_MCP_SUPABASE_PROJECT_REF` (optional) before invoking MCP clients.  
- **Read-only guard**: Honour `MAGSAG_MCP_SUPABASE_READONLY` when exposing SQL tooling.

### GitHub (`github.yaml`)

```yaml
id: github
version: "1"
description: "GitHub MCP (remote HTTP; OAuth recommended, PAT optional)"
transport:
  type: http
  url: "https://api.githubcopilot.com/mcp/"
  headers:
    Authorization: "${MAGSAG_MCP_GITHUB_PAT:+Bearer ${MAGSAG_MCP_GITHUB_PAT}}"
permissions:
  write_requires_approval: true
notes: "Some tools require a GitHub Copilot license. Use the least-privileged PAT when OAuth is unavailable."
```

- `magsag mcp login github` outlines both OAuth and PAT flows.  
- CI runners may export `MAGSAG_MCP_GITHUB_PAT`; local sessions should prefer `gh auth login` with Copilot entitlements.  
- GitHub tools marked as write-capable are blocked until human approval grants permission.

### Obsidian (`obsidian.yaml`)

```yaml
id: obsidian
version: "1"
description: "Obsidian via Local REST API (mcp-obsidian)"
transport:
  type: stdio
  command: "uvx"
  args: ["mcp-obsidian"]
  env:
    OBSIDIAN_API_KEY: "${OBSIDIAN_API_KEY}"
    OBSIDIAN_HOST: "${OBSIDIAN_HOST:-127.0.0.1}"
    OBSIDIAN_PORT: "${OBSIDIAN_PORT:-27124}"
permissions:
  scope: ["vault:read", "vault:write"]
notes: "Requires the Obsidian Local REST API plugin. Delete-style operations are denied or require approval via policy."
```

Run `uvx mcp-obsidian --help` to validate the local bridge before invoking agent workflows.

## Authentication & Secrets

| Provider | Preferred Path | Headless Alternative | Storage Guidance |
|----------|----------------|----------------------|------------------|
| Notion | Browser OAuth launch via `magsag mcp login notion` | Token exported as `NOTION_MCP_TOKEN` | Store in OS keychain; avoid committing to YAML. |
| Supabase | Browser OAuth | Project-scoped PAT + `MAGSAG_MCP_SUPABASE_PROJECT_REF` | Restrict PAT scope to read-only CI tasks. |
| GitHub | `gh auth login --scopes read:org,repo` (Copilot auto-included) | `MAGSAG_MCP_GITHUB_PAT` | Use least privilege; rotate PATs frequently. |
| Obsidian | Local REST API plugin key | n/a (local only) | Protect vault-specific keys; do not store in repo. |

Never embed secrets in catalog assets or tests. Prefer keychains or secret managers and export to the shell only for the current session.

## Diagnostics & Observability

### Doctor Status Codes

`magsag mcp doctor` iterates transports in order and returns the first decisive result:

| Status | Meaning | Next Step |
|--------|---------|-----------|
| `reachable` | Transport succeeded (`initialize` + `tools/list`) | Ready to use. |
| `needs-auth` | HTTP 401 | Refresh OAuth token or PAT. |
| `auth-failed` | HTTP 403/451 | Ensure scopes/licences are correct. |
| `unreachable` | All transports failed | Inspect network, fallback transport, or CLI output. |

Each probe logs session IDs (when exposed), protocol versions, HTTP codes, and attempted tool names. These attributes also populate `.runs/agents/<run_id>/mcp_calls.jsonl` and OpenTelemetry spans (`mcp.transport`, `mcp.session_id`, `mcp.protocol_version`, `mcp.http_status`, `mcp.retries`).

### CORS Considerations

Browser-based clients must configure `Access-Control-Expose-Headers` to include `Mcp-Session-Id` when leveraging the SDK’s automatic session tracking.

## Governance & Policies

- Declare MCP dependencies in catalog assets via `requires.mcp` (agents) or `permissions: [mcp:<server>]` (skills).  
- Tool-level controls live under `policies.tools` and support `allow`, `deny`, or `require-approval`.

```yaml
policies:
  tools:
    github.create_issue: require-approval
    obsidian.delete_file: deny
    supabase.sql_select: allow
```

The runtime blocks execution when a policy requires approval or denial and records the outcome in observability metadata.

## Skill Runtime Integration

The Python `magsag.mcp` runtime has been retired. Until the TypeScript skill runtime lands (Workstream B/D), treat MCP access as an explicit dependency inside each skill.

For Node/TypeScript skills import `McpClient` directly:

```ts
import { McpClient } from '@magsag/mcp-client';

const ensureMcp = async () => {
  const client = new McpClient({
    serverId: 'supabase',
    transport: { type: 'http', url: process.env.SUPABASE_MCP_URL! }
  });
  await client.initialize();
  return client;
};

export const run = async (payload: unknown) => {
  const client = await ensureMcp();
  try {
    const result = await client.invokeTool('sql.readonly', {
      statement: 'select now()'
    });
    if (result.isError) {
      throw new Error(result.content.at(0)?.text ?? 'MCP call failed');
    }
    return result.content;
  } finally {
    await client.close();
  }
};
```

Skills must fail loudly when MCP credentials or transports are missing—do not silently downgrade to local fallbacks. Catalog metadata should declare `permissions: ["mcp:<server>"]` so governance policies can block execution when approvals are outstanding.

## Catalog & Documentation Expectations

- Update `.env.example` when introducing new MCP environment variables.  
- Reflect user-visible changes under `## [Unreleased]` in `CHANGELOG.md`.  
- Ensure SSOT (`SSOT.md`) and templates (`catalog/agents/_template/mag-template/agent.yaml`) remain aligned with the permitted transports and policy patterns.  
- Document OAuth vs PAT guidance in provider-specific sections to reduce developer guesswork.

## Additional Servers

Local reference servers (filesystem, git, memory, fetch, pg-readonly) remain available for specialised workflows. Their maintenance guidelines live in `docs/guides/mcp-server.md`; update that surface (and `docs/mcp.md`) when changing server behaviour.

## Update Log

- **2025-11-04**: Replaced Python workflows with the TypeScript CLI (`mcp ls/doctor`), updated preset guidance, and documented interim skill integration patterns.  
- **2025-11-03**: Reframed guide around HTTP-first presets, Typer CLI workflow, Supabase/GitHub authentication strategy, and observability requirements.  
- **2025-11-02**: Refreshed metadata and aligned tags with the documentation taxonomy.  
- **2025-10-29**: Documented implementation status and migration preview.  
- **2025-10-24**: Introduced architecture overview and initial guidance.
