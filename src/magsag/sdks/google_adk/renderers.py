"""Render ADK registry entries into MCP server and catalog tool documents."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Iterator, Mapping

from magsag.sdks.google_adk.registry import ADKSource, ADKTool


def render_mcp_server(source: ADKSource) -> Mapping[str, Any]:
    """Render MCP server configuration for a source."""
    return {
        "name": source.id,
        "title": source.title,
        "description": source.description,
        "version": source.version,
        "generated_at": _timestamp(),
        "server": {
            "type": source.server.type,
            "entrypoint": source.server.entrypoint,
            "healthcheck": source.server.healthcheck,
            "scopes": list(source.server.scopes),
            "capabilities": list(source.server.capabilities),
        },
        "metadata": {
            "tags": list(source.tags),
        },
    }


def render_catalog_tools(source: ADKSource) -> Iterator[tuple[str, Mapping[str, Any]]]:
    """Yield tool documents for catalog ingestion."""
    for tool in source.tools:
        yield tool.name, _render_tool_document(source, tool)


def _render_tool_document(source: ADKSource, tool: ADKTool) -> Mapping[str, Any]:
    return {
        "package": source.id,
        "name": tool.name,
        "description": tool.description,
        "schema": tool.schema,
        "metadata": {
            "source": source.id,
            "generated_at": _timestamp(),
            "tags": list(tool.metadata.get("tags", [])),
            "operationId": tool.metadata.get("operationId"),
        },
    }


def _timestamp() -> str:
    return datetime.now(UTC).isoformat()


__all__ = ["render_catalog_tools", "render_mcp_server"]
