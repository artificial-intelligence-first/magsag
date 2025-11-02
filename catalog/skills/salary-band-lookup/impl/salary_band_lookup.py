"""
Salary Band Lookup Skill - Phase 3 MCP Integration

This skill now requires a functioning MCP runtime and the `pg-readonly` server.
Salary band data is retrieved exclusively from the PostgreSQL catalog; the
Phase 2 mock fallback has been removed to guarantee production parity with
governed compensation data.
"""

import logging
from typing import Any, Dict, Optional

from magsag.mcp.runtime import MCPRuntime

logger = logging.getLogger(__name__)


async def run(payload: Dict[str, Any], mcp: Optional[MCPRuntime] = None) -> Dict[str, Any]:
    """
    Lookup salary band for a candidate profile.

    This Phase 3 implementation requires MCP and queries the governed
    `salary_bands` table. Missing MCP runtime or empty query results now
    raise runtime errors so orchestration can escalate appropriately.

    Args:
        payload: Candidate profile with 'role', 'level', 'location' fields
        mcp: Optional MCP runtime for database access (requires mcp:pg-readonly permission)

    Returns:
        Salary band dictionary with:
        - currency: Currency code (e.g., "USD")
        - min: Minimum salary in the band
        - max: Maximum salary in the band
        - source: Data source ("database")

    Raises:
        RuntimeError: When MCP runtime is unavailable or the database query fails
    """
    role = payload.get("role", "")
    level = payload.get("level", "")
    location = payload.get("location", "")

    if mcp is None:
        raise RuntimeError(
            "salary-band-lookup requires an MCP runtime with access to the 'pg-readonly' server."
        )

    logger.info(
        "Querying salary band (role=%s, level=%s, location=%s)",
        role,
        level,
        location,
    )

    result = await mcp.query_postgres(
        server_id="pg-readonly",
        sql=(
            "SELECT currency, min_salary, max_salary "
            "FROM salary_bands "
            "WHERE role = $1 AND level = $2 AND location = $3 "
            "LIMIT 1"
        ),
        params=[role, level, location],
    )

    if not result.success:
        raise RuntimeError(f"PostgreSQL query failed: {result.error}")

    rows = (result.output or {}).get("rows", []) if isinstance(result.output, dict) else []
    if not rows:
        raise RuntimeError(
            "No salary band found for the supplied role/level/location in the salary_bands table."
        )

    db_row = rows[0]
    currency = db_row.get("currency", "USD")
    min_salary = db_row.get("min_salary")
    max_salary = db_row.get("max_salary")

    if min_salary is None or max_salary is None:
        raise RuntimeError("Salary band record is missing min_salary or max_salary fields.")

    logger.info("Returning database-backed salary band for role=%s level=%s", role, level)
    return {
        "currency": currency,
        "min": min_salary,
        "max": max_salary,
        "source": "database",
    }
