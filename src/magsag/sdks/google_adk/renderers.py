"""Render ADK registry entries into MCP server and catalog tool documents."""

from __future__ import annotations

import dataclasses
import hashlib
import json
from typing import Any, Iterator, Mapping

from magsag.sdks.google_adk.registry import ADKSource, ADKTool


def render_mcp_server(source: ADKSource) -> Mapping[str, Any]:
    """Render MCP server configuration for a source."""
    transport: dict[str, Any] = {
        "type": source.server.type,
    }

    if source.server.type in {"http", "sse", "websocket"}:
        transport["url"] = source.server.entrypoint
    elif source.server.type == "stdio":
        transport["command"] = source.server.entrypoint

    document: dict[str, Any] = {
        "server_id": source.id,
        "version": source.version,
        "type": "mcp",
        "description": source.description,
        "transport": transport,
        "permissions": {
            "scope": list(source.server.scopes),
        },
        "metadata": {
            "tags": list(source.tags),
            "title": source.title,
            "source": source.id,
            "source_digest": _source_digest(source),
        },
    }

    if source.server.healthcheck:
        document.setdefault("options", {})["healthcheck"] = source.server.healthcheck
    if source.server.capabilities:
        document.setdefault("options", {})["capabilities"] = list(source.server.capabilities)

    return document


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
            "source_digest": _tool_digest(source, tool),
            "tags": list(tool.metadata.get("tags", [])),
            "operationId": tool.metadata.get("operationId"),
        },
    }


def _source_digest(source: ADKSource) -> str:
    payload = dataclasses.asdict(source)
    data = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _tool_digest(source: ADKSource, tool: ADKTool) -> str:
    payload = {
        "source": dataclasses.asdict(source),
        "tool": dataclasses.asdict(tool),
    }
    data = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


__all__ = ["render_catalog_tools", "render_mcp_server"]
