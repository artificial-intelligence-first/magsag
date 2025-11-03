"""Synchronization driver for generating MCP servers and catalog tools."""

from __future__ import annotations

import json
from pathlib import Path
from typing import List, Sequence

from magsag.sdks.google_adk.registry import ADKRegistry, ADKSource
from magsag.sdks.google_adk.renderers import render_catalog_tools, render_mcp_server


class ADKSyncError(RuntimeError):
    """Raised when ADK synchronization fails."""


def sync_adk_catalog(
    registry_path: Path | None = None,
    *,
    output_root: Path | None = None,
    dry_run: bool = False,
) -> List[Path]:
    """
    Generate MCP server and catalog tool artefacts from ADK registry.

    Args:
        registry_path: Path to ADK registry YAML (defaults to ops/adk/catalog.yaml)
        output_root: Root directory to write outputs (defaults to repository root)
        dry_run: When True, skip writing files and return intended paths

    Returns:
        List of generated file paths.
    """
    registry_path = registry_path or Path("ops/adk/catalog.yaml")
    output_root = output_root or Path(".")

    registry = ADKRegistry.load(registry_path)

    generated_paths: list[Path] = []
    for source in registry.sources:
        generated_paths.extend(
            _render_source(source=source, output_root=output_root, dry_run=dry_run)
        )
    return generated_paths


def _render_source(*, source: ADKSource, output_root: Path, dry_run: bool) -> Sequence[Path]:
    server_dir = output_root / ".mcp" / "servers" / source.id
    tool_dir = output_root / "catalog" / "tools" / source.id

    server_doc = render_mcp_server(source)
    tool_docs = list(render_catalog_tools(source))

    planned_paths = [server_dir.with_suffix(".json")]
    planned_paths.extend((tool_dir / f"{tool_name}.json" for tool_name, _ in tool_docs))

    if dry_run:
        return list(planned_paths)

    server_dir.parent.mkdir(parents=True, exist_ok=True)
    tool_dir.mkdir(parents=True, exist_ok=True)

    _write_json(server_dir.with_suffix(".json"), server_doc)
    for tool_name, doc in tool_docs:
        target = tool_dir / f"{tool_name}.json"
        _write_json(target, doc)

    return [server_dir.with_suffix(".json"), *[tool_dir / f"{name}.json" for name, _ in tool_docs]]


def _write_json(path: Path, payload: object) -> None:
    tmp_path = path.with_suffix(".json.tmp")
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    tmp_path.replace(path)


__all__ = ["ADKSyncError", "sync_adk_catalog"]
