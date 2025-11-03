---
title: MCP Client Migration Guide
slug: guide-mcp-migration
status: living
last_updated: '2025-11-02'
last_synced: '2025-11-02'
tags:
- mcp
- migration
summary: Upgrade skills to enforce MCP client integration with governed runtime requirements.
description: Upgrade skills to enforce MCP client integration with governed runtime requirements.
authors: []
sources: []
---

# MCP Client Migration Guide

> **For Humans**: Use this walkthrough to retrofit skills with MCP client support under the Phase 3 baseline where MCP runtime is required.
>
> **For AI Agents**: Ensure permissions, contracts, and tests align with migration steps. Document any deviations in SSOT.

This guide covers migrating existing skills to support MCP (Model Context Protocol) client integration, enabling skills to access external data sources, tools, and services through standardized MCP servers.

## Overview


### What This Guide Covers

- Updating skill signatures to accept MCP runtime
- Implementing MCP tool invocation logic
- Handling optional MCP parameters while keeping the runtime governed
- Troubleshooting common migration issues

### Who Should Read This

- Skill developers adding MCP integration to existing skills
- Developers creating new skills that require external data access
- Teams migrating from direct database/API calls to MCP abstraction

### Prerequisites

Before migrating skills to MCP:

1. **Understand MCP Basics**: Review [mcp-integration.md](./mcp-integration.md) for MCP fundamentals
2. **MCP Servers Configured**: Ensure YAML sources exist in `ops/adk/servers/` and generate `.mcp/servers/<server-id>.json` via `uv run magsag mcp sync`
3. **Python Environment**: Python 3.12+ with `magsag[mcp-server]` installed
4. **Skill Structure**: Existing skill with proper contracts and tests

**Required Knowledge:**
- Python async/await syntax
- JSON Schema validation
- MAGSAG skill structure (see [agent-development.md](./agent-development.md))

**Installation:**
```bash
# Install MCP support
uv sync --extra mcp-server

# Verify MCP servers are discoverable
ls .mcp/servers/*.json
```

## Migration Steps

### Step 1: Update Skill Signature

Skills need to accept an optional `mcp` parameter to access MCP tools.

#### Before (pre-MCP signature)

```python
# catalog/skills/salary-band-lookup/impl/salary_band_lookup.py

def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Lookup salary band for a candidate profile."""
    role = payload.get("role", "")
    level = payload.get("level", "")

    # Hardcoded fallback data
    return {
        "currency": "USD",
        "min": 100000,
        "max": 180000,
        "source": "internal-table"
    }
```

**Issues with the pre-MCP approach:**
- Hardcoded data
- No access to real-time data sources
- Difficult to update data without code changes

#### After (MCP-Enabled Signature)

```python
# catalog/skills/salary-band-lookup/impl/salary_band_lookup.py
from __future__ import annotations
from typing import Any, Dict, Optional

# Import MCP types
from magsag.mcp import MCPRuntime

def run(
    payload: Dict[str, Any],
    *,
    mcp: Optional[MCPRuntime] = None
) -> Dict[str, Any]:
    """Lookup salary band with MCP support.

    Args:
        payload: Input data with role, level, location
        mcp: Optional MCP runtime for database access

    Returns:
        Salary band with currency, min, max, source
    """
    # Implementation with MCP support (see Step 2)
    pass
```

**Key Changes:**
- Import `MCPRuntime` from `magsag.mcp`
- Add `mcp` as keyword-only optional parameter (`*, mcp: Optional[MCPRuntime] = None`)
- Type hint properly for IDE support
- Document the new parameter in docstring

**Signature Rules:**
1. `mcp` must be keyword-only (after `*`)
2. Must have `Optional[MCPRuntime]` type hint
3. Default value must be `None` for backward compatibility

### Step 2: Implement MCP Logic

Add MCP tool invocation logic while maintaining backward compatibility.

#### Pattern 1: Graceful Fallback (Recommended)

Skills work with or without MCP, falling back to reasonable defaults when MCP is unavailable.

```python
# catalog/skills/salary-band-lookup/impl/salary_band_lookup.py
from __future__ import annotations
import asyncio
from typing import Any, Dict, Optional

from magsag.mcp import MCPRuntime

def run(
    payload: Dict[str, Any],
    *,
    mcp: Optional[MCPRuntime] = None
) -> Dict[str, Any]:
    """Lookup salary band with graceful fallback."""

    # Extract input parameters
    role = payload.get("role", "")
    level = payload.get("level", "")
    location = payload.get("location", "US")

    # Try MCP first if available
    if mcp is not None:
        try:
            # Use asyncio.run for async MCP calls
            result = asyncio.run(_lookup_via_mcp(mcp, role, level, location))
            if result:
                return result
        except Exception as exc:
            # Log error but continue to fallback
            print(f"MCP lookup failed: {exc}, using fallback data")

    # Fallback to static data
    return _fallback_lookup(role, level, location)


async def _lookup_via_mcp(
    mcp: MCPRuntime,
    role: str,
    level: str,
    location: str,
) -> Optional[Dict[str, Any]]:
    """Query salary data via MCP PostgreSQL server."""

    sql = """
        SELECT currency, min_salary, max_salary
        FROM salary_bands
        WHERE role = $1 AND level = $2 AND location = $3
        LIMIT 1
    """

    result = await mcp.query_postgres(
        server_id="pg-readonly",
        sql=sql,
        params=[role, level, location],
    )

    if not result.success:
        raise RuntimeError(f"PostgreSQL query failed: {result.error}")

    # Parse result data
    rows = result.data or []
    if not rows:
        return None

    row = rows[0]
    return {
        "currency": row.get("currency", "USD"),
        "min": row.get("min_salary", 0),
        "max": row.get("max_salary", 0),
        "source": "postgres-via-mcp",
    }


def _fallback_lookup(role: str, level: str, location: str) -> Dict[str, Any]:
    """Static fallback when MCP is unavailable."""

    # Reasonable defaults based on level
    base_band = {"currency": "USD", "min": 100000, "max": 180000}

    if "Senior" in role or "Senior" in level:
        base_band.update(min=150000, max=220000)
    elif "Staff" in role or "Staff" in level:
        base_band.update(min=180000, max=280000)
    elif "Principal" in role or "Principal" in level:
        base_band.update(min=220000, max=350000)

    base_band["source"] = "fallback-static"
    return base_band
```

**Benefits:**
- Works in both MCP and non-MCP environments
- Degrades gracefully on errors
- Useful for development and testing
- Production-ready with real data when MCP is available

#### Pattern 2: Strict MCP Requirement

Some skills require MCP and should fail explicitly when it's unavailable.

```python
# catalog/skills/compliance-check/impl/compliance_check.py
from __future__ import annotations
import asyncio
from typing import Any, Dict, Optional

from magsag.mcp import MCPRuntime

def run(
    payload: Dict[str, Any],
    *,
    mcp: Optional[MCPRuntime] = None
) -> Dict[str, Any]:
    """Compliance check requiring MCP access."""

    # Strict requirement: fail if MCP is unavailable
    if mcp is None:
        raise RuntimeError(
            "Compliance check requires MCP runtime. "
            "Ensure skill declares 'mcp:pg-readonly' permission."
        )

    # Verify required permissions
    if not mcp.check_permission("pg-readonly"):
        raise RuntimeError(
            "Missing required permission: mcp:pg-readonly"
        )

    # Execute MCP-based logic
    return asyncio.run(_check_compliance(mcp, payload))


async def _check_compliance(
    mcp: MCPRuntime,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """Execute compliance checks via MCP."""

    candidate_id = payload["candidate_id"]

    # Query compliance database
    result = await mcp.query_postgres(
        server_id="pg-readonly",
        sql="SELECT * FROM compliance_records WHERE candidate_id = $1",
        params=[candidate_id],
    )

    if not result.success:
        raise RuntimeError(f"Compliance query failed: {result.error}")

    # Process compliance data
    records = result.data or []
    return {
        "candidate_id": candidate_id,
        "compliant": len(records) > 0,
        "records": records,
        "source": "compliance-db",
    }
```

**Use Cases:**
- Regulatory compliance checks (must have authoritative data)
- Security audits
- Financial calculations
- Legal documentation

### Step 3: Update Skill Metadata

Skills using MCP must declare required permissions in `catalog/registry/skills.yaml`.

```yaml
# catalog/registry/skills.yaml

skills:
  # Graceful fallback skill (permissions optional but recommended)
  - id: skill.salary-band-lookup
    name: Salary Band Lookup
    version: "0.2.0"
    location: catalog/skills/salary-band-lookup
    entrypoint: catalog/skills/salary-band-lookup/impl/salary_band_lookup.py:run
    permissions:
      - mcp:pg-readonly  # PostgreSQL read access
    contracts:
      input: catalog/contracts/salary_lookup_input.json
      output: catalog/contracts/salary_band.schema.json

  # Strict MCP requirement skill
  - id: skill.compliance-check
    name: Compliance Check
    version: "1.0.0"
    location: catalog/skills/compliance-check
    entrypoint: catalog/skills/compliance-check/impl/compliance_check.py:run
    permissions:
      - mcp:pg-readonly  # Required for compliance database
    contracts:
      input: catalog/contracts/compliance_input.json
      output: catalog/contracts/compliance_result.json
```

**Permission Format:**
- MCP permissions: `mcp:<server-id>` (e.g., `mcp:pg-readonly`, `mcp:filesystem`)
- Server ID must match `ops/adk/servers/<server-id>.yaml` and produce `.mcp/servers/<server-id>.json`

**Best Practices:**
1. Always declare MCP permissions explicitly
2. Use read-only servers when possible (`pg-readonly` vs `pg-readwrite`)
3. Document why each permission is needed
4. Update version when adding MCP support

### Step 4: Test Both Modes

Ensure skills work with and without MCP runtime.

#### Test Without MCP (Fallback Mode)

```python
# catalog/skills/salary-band-lookup/tests/test_salary_band_lookup.py
from catalog.skills.salary_band_lookup.impl.salary_band_lookup import run

def test_salary_lookup_without_mcp():
    """Test skill works without MCP runtime (fallback mode)."""

    payload = {
        "role": "Senior Engineer",
        "level": "Senior",
        "location": "US",
    }

    # Call without mcp parameter
    result = run(payload)

    # Verify fallback data is returned
    assert result["currency"] == "USD"
    assert result["min"] > 0
    assert result["max"] > result["min"]
    assert result["source"] == "fallback-static"


def test_fallback_level_adjustments():
    """Test fallback correctly adjusts for seniority levels."""

    junior_result = run({"role": "Junior Engineer", "level": "Junior"})
    senior_result = run({"role": "Senior Engineer", "level": "Senior"})

    # Senior should have higher salary range
    assert senior_result["min"] > junior_result["min"]
    assert senior_result["max"] > junior_result["max"]
```

#### Test With MCP (Database Mode)

```python
# catalog/skills/salary-band-lookup/tests/test_salary_band_lookup_mcp.py
import pytest
from unittest.mock import AsyncMock, patch
from magsag.mcp import MCPRegistry, MCPRuntime, MCPToolResult

from catalog.skills.salary_band_lookup.impl.salary_band_lookup import run


@pytest.fixture
def mock_mcp_runtime():
    """Create a mock MCP runtime with PostgreSQL access."""
    registry = MCPRegistry()
    runtime = MCPRuntime(registry)
    runtime.grant_permissions(["mcp:pg-readonly"])
    return runtime


def test_salary_lookup_with_mcp(mock_mcp_runtime):
    """Test skill uses MCP when runtime is provided."""

    # Mock PostgreSQL query response
    with patch.object(
        mock_mcp_runtime,
        'query_postgres',
        new_callable=AsyncMock,
    ) as mock_query:

        mock_query.return_value = MCPToolResult(
            success=True,
            data=[
                {
                    "currency": "USD",
                    "min_salary": 160000,
                    "max_salary": 220000,
                }
            ],
        )

        payload = {
            "role": "Senior Engineer",
            "level": "Senior",
            "location": "San Francisco",
        }

        # Call with mcp
        result = run(payload, mcp=mock_mcp_runtime)

        # Verify MCP data is returned
        assert result["currency"] == "USD"
        assert result["min"] == 160000
        assert result["max"] == 220000
        assert result["source"] == "postgres-via-mcp"

        # Verify PostgreSQL was called with correct parameters
        mock_query.assert_called_once_with(
            server_id="pg-readonly",
            sql=pytest.approx.ANY,  # Don't check exact SQL
            params=["Senior Engineer", "Senior", "San Francisco"],
        )


def test_mcp_error_fallback(mock_mcp_runtime):
    """Test skill falls back when MCP query fails."""

    # Mock PostgreSQL query failure
    with patch.object(
        mock_mcp_runtime,
        'query_postgres',
        new_callable=AsyncMock,
    ) as mock_query:

        mock_query.return_value = MCPToolResult(
            success=False,
            error="Connection timeout",
        )

        payload = {"role": "Engineer", "level": "Mid"}

        # Should not raise exception, should fallback
        result = run(payload, mcp=mock_mcp_runtime)

        # Verify fallback data is returned
        assert result["source"] == "fallback-static"
```

## Timeline and Status

### Phase 1: Infrastructure (Completed - v0.1.0)

**Status:** ✅ Complete

- [x] MCP Registry for server discovery
- [x] MCP Runtime for permission enforcement
- [x] MCP tool execution with asyncio support
- [x] PostgreSQL server adapter
- [x] Integration tests

### Phase 2: Skill Migration (Completed - v0.2.0)

**Status:** ✅ Complete

**Delivered:**
- Async skill signatures with optional `mcp` parameter across catalog templates
- Automatic MCP runtime injection via `SkillRuntime`
- Updated sample skills (`doc-gen`, `task-decomposition`, `result-aggregation`) prepared for Phase 2 dual-mode operation
- Legacy test patterns for dual-mode (MCP/non-MCP) execution retained for audit purposes
- This migration guide reflecting the new baseline

### Phase 3: Production Hardening (Completed - v0.3.0)

**Status:** ✅ Complete

- [x] Enforced MCP-only execution paths for catalog skills
- [x] Activated circuit breaker, retry, and caching helpers in production code paths
- [x] Propagated approval policy coverage for fetch/filesystem/PostgreSQL servers
- [x] Integrated FastMCP server with live AgentRunner/SkillRuntime pipeline
- [x] Updated documentation, tests, and governance artefacts for MCP-only operation

## Next Steps

### Checklist for Migration

Use this checklist when migrating a skill to MCP:

- [ ] **1. Review Skill Requirements**
  - [ ] Identify what external data/tools the skill needs
  - [ ] Determine which MCP servers provide required functionality
- [ ] Verify MCP servers are configured by checking `.mcp/servers/<server-id>.json`

- [ ] **2. Update Skill Code**
  - [ ] Add `mcp` parameter to `run()` function
  - [ ] Import `MCPRuntime` from `magsag.mcp`
  - [ ] Implement MCP logic that surfaces errors when MCP is unavailable
  - [ ] Add permission checks
  - [ ] Handle async execution properly

- [ ] **3. Update Skill Metadata**
  - [ ] Declare MCP permissions in `catalog/registry/skills.yaml`
  - [ ] Increment skill version
  - [ ] Update skill description

- [ ] **4. Write Tests**
  - [ ] Test with MCP (mock runtime or integration harness)
  - [ ] Test permission denied scenarios
  - [ ] Test error handling and recovery (including MCP startup failures)

- [ ] **5. Documentation**
  - [ ] Update skill README.md
  - [ ] Document MCP requirements and failure handling expectations
  - [ ] Add usage examples

- [ ] **6. Integration Testing**
  - [ ] Test with real MCP servers locally
  - [ ] Verify permissions are enforced
  - [ ] Check performance and latency
  - [ ] Test error scenarios

- [ ] **7. Deployment**
  - [ ] Update MCP server configurations in production
  - [ ] Set required environment variables
  - [ ] Deploy skill with new version
  - [ ] Monitor MCP call metrics

### Links to Related Documentation

**Core Documentation:**
- [MCP Integration Guide](./mcp-integration.md) - Overview of MCP in MAGSAG
- [Agent Development Guide](./agent-development.md) - Building agents and skills
- [MCP Server Guide](./mcp-server.md) - Exposing agents as MCP tools

**Advanced Topics:**
- [Multi-Provider Guide](./multi-provider.md) - LLM provider configuration
- [Cost Optimization](./cost-optimization.md) - Managing costs including MCP
- [Storage Layer](../storage.md) - Querying MCP usage data

**Reference:**
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [MAGSAG SSOT](../architecture/ssot.md) - Terminology and policies

## Update Log

- 2025-11-03: Removed legacy fallback patterns and documented JSON-only MCP artefact workflow.
- 2025-11-02: Refreshed metadata and aligned tags with the documentation taxonomy.
- 2025-11-01: Added unified frontmatter and audience guidance.
- 2025-10-29: Initial migration guide created.
