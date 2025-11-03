"""Registry loader for Google ADK source definitions."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, List, Mapping, Sequence

import yaml


@dataclass(frozen=True)
class ADKTool:
    """Tool definition derived from ADK metadata."""

    name: str
    description: str
    schema: Mapping[str, Any]
    metadata: Mapping[str, Any]


@dataclass(frozen=True)
class ADKServer:
    """Server definition for MCP transport generation."""

    type: str
    entrypoint: str
    healthcheck: str | None
    scopes: Sequence[str]
    capabilities: Sequence[str]


@dataclass(frozen=True)
class ADKSource:
    """Single ADK source containing server metadata and tools."""

    id: str
    title: str
    description: str
    version: str
    tags: Sequence[str]
    server: ADKServer
    tools: Sequence[ADKTool]


@dataclass(frozen=True)
class ADKRegistry:
    """Collection of ADK sources loaded from configuration."""

    sources: Sequence[ADKSource]
    version: str | int

    @classmethod
    def load(cls, path: Path) -> ADKRegistry:
        """Load registry data from a YAML file."""
        if not path.exists():
            raise FileNotFoundError(f"ADK registry not found: {path}")

        with open(path, "r", encoding="utf-8") as handle:
            raw = yaml.safe_load(handle) or {}

        version = raw.get("version", "unknown")
        raw_sources = raw.get("sources", [])
        sources = [cls._parse_source(item) for item in raw_sources]
        return cls(sources=tuple(sources), version=str(version))

    @staticmethod
    def _parse_source(raw: Mapping[str, Any]) -> ADKSource:
        server_raw = raw.get("server", {})
        server = ADKServer(
            type=str(server_raw.get("type", "http")),
            entrypoint=str(server_raw.get("entrypoint", "")),
            healthcheck=(
                str(server_raw.get("healthcheck"))
                if server_raw.get("healthcheck") is not None
                else None
            ),
            scopes=_as_list(server_raw.get("scopes")),
            capabilities=_as_list(server_raw.get("capabilities")),
        )

        tools_raw = raw.get("tools", [])
        tools = [
            ADKTool(
                name=str(tool.get("name")),
                description=str(tool.get("description", "")),
                schema=dict(tool.get("schema", {})),
                metadata=dict(tool.get("metadata", {})),
            )
            for tool in tools_raw
        ]

        return ADKSource(
            id=str(raw.get("id")),
            title=str(raw.get("title", "")),
            description=str(raw.get("description", "")),
            version=str(raw.get("version", "")),
            tags=_as_list(raw.get("tags")),
            server=server,
            tools=tuple(tools),
        )


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set, frozenset)):
        return [str(item) for item in value]
    return [str(value)]


def filter_tools(sources: Iterable[ADKSource], tag: str) -> List[ADKTool]:
    """Return tools that contain the specified metadata tag."""
    results: list[ADKTool] = []
    for source in sources:
        for tool in source.tools:
            tags = tool.metadata.get("tags", [])
            if tag in tags:
                results.append(tool)
    return results


__all__ = ["ADKRegistry", "ADKServer", "ADKSource", "ADKTool", "filter_tools"]
