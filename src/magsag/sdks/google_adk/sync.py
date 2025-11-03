"""Synchronization driver for generating MCP servers and catalog tools."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, List, Sequence, Tuple, cast

import yaml

from magsag.mcp.config import MCPServerConfig
from magsag.sdks.google_adk.registry import ADKRegistry, ADKSource
from magsag.sdks.google_adk.renderers import render_catalog_tools, render_mcp_server


class ADKSyncError(RuntimeError):
    """Raised when ADK synchronization fails."""


@dataclass(frozen=True)
class GeneratedArtifact:
    """Representation of an artefact produced by ADK sync."""

    path: Path
    content: str


def sync_adk_catalog(
    registry_path: Path | None = None,
    *,
    output_root: Path | None = None,
    servers_dir: Path | None = None,
    dry_run: bool = False,
) -> List[GeneratedArtifact]:
    """
    Generate MCP server and catalog tool artefacts from ADK registry.

    Args:
        registry_path: Path to ADK registry YAML (defaults to ops/adk/catalog.yaml)
        output_root: Root directory to write outputs (defaults to repository root)
        servers_dir: Path containing authorable server YAML sources (defaults to ops/adk/servers/)
        dry_run: When True, skip writing files and return artefact previews

    Returns:
        List of artefacts (path and serialized JSON content).
    """
    registry_path = registry_path or Path("ops/adk/catalog.yaml")
    output_root = output_root or Path(".")
    servers_dir = servers_dir or Path("ops/adk/servers")

    registry = ADKRegistry.load(registry_path)

    yaml_configs = {
        config.server_id: (config, path)
        for config, path in _load_server_configs(servers_dir)
    }

    artefacts: list[GeneratedArtifact] = []
    for source in registry.sources:
        override = yaml_configs.pop(source.id, None)
        artefacts.extend(
            _render_source(
                source=source,
                registry_path=registry_path,
                output_root=output_root,
                yaml_override=override,
                servers_root=servers_dir,
            )
        )

    for config, source_path in yaml_configs.values():
        artefacts.extend(
            _render_server_config(
                config=config,
                source_path=source_path,
                output_root=output_root,
                servers_root=servers_dir,
            )
        )

    if not dry_run:
        for artefact in artefacts:
            _write_artifact(artefact)

    return artefacts


def _render_source(
    *,
    source: ADKSource,
    registry_path: Path,
    output_root: Path,
    yaml_override: tuple[MCPServerConfig, Path] | None = None,
    servers_root: Path | None = None,
) -> Sequence[GeneratedArtifact]:
    server_path = output_root / ".mcp" / "servers" / f"{source.id}.json"
    tool_dir = output_root / "catalog" / "tools" / source.id

    server_doc = dict(render_mcp_server(source))
    metadata = server_doc.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
        server_doc["metadata"] = metadata
    metadata["source"] = str(registry_path)

    if yaml_override and servers_root is not None:
        config, source_path = yaml_override
        server_doc = _merge_yaml_server(
            config=config,
            source_path=source_path,
            registry_doc=server_doc,
            registry_path=registry_path,
            servers_root=servers_root,
        )

    tool_docs = list(render_catalog_tools(source))

    artefacts: list[GeneratedArtifact] = [
        GeneratedArtifact(server_path, _serialize_json(server_doc))
    ]
    for tool_name, doc in tool_docs:
        target = tool_dir / f"{tool_name}.json"
        artefacts.append(GeneratedArtifact(target, _serialize_json(dict(doc))))

    return artefacts


def _load_server_configs(servers_dir: Path) -> Sequence[Tuple[MCPServerConfig, Path]]:
    if not servers_dir.exists():
        return []

    configs: list[Tuple[MCPServerConfig, Path]] = []
    for path in sorted(list(servers_dir.glob("*.yaml")) + list(servers_dir.glob("*.yml"))):
        try:
            raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            config = MCPServerConfig(**raw)
        except Exception as exc:  # noqa: BLE001
            raise ADKSyncError(f"Failed to load MCP server source '{path}': {exc}") from exc
        configs.append((config, path))
    return configs


def _render_server_config(
    *,
    config: MCPServerConfig,
    source_path: Path,
    output_root: Path,
    servers_root: Path,
) -> Sequence[GeneratedArtifact]:
    target_path = output_root / ".mcp" / "servers" / f"{config.server_id}.json"
    document = dict(config.model_dump(mode="json", exclude_none=True))
    document.pop("raw", None)
    metadata_raw = document.get("metadata")
    if isinstance(metadata_raw, dict):
        metadata = metadata_raw
    else:
        metadata = {}
        document["metadata"] = metadata
    metadata["source"] = _relative_string(source_path, servers_root)
    metadata["source_digest"] = _hash_source_file(source_path)
    metadata.pop("generated_at", None)

    return [GeneratedArtifact(target_path, _serialize_json(document))]


def _serialize_json(payload: object) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _write_artifact(artefact: GeneratedArtifact) -> None:
    artefact.path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = artefact.path.with_suffix(".json.tmp")
    tmp_path.write_text(artefact.content, encoding="utf-8")
    tmp_path.replace(artefact.path)


def _hash_source_file(path: Path) -> str:
    import hashlib

    data = path.read_bytes()
    return hashlib.sha256(data).hexdigest()


def _merge_yaml_server(
    *,
    config: MCPServerConfig,
    source_path: Path,
    registry_doc: dict[str, Any],
    registry_path: Path,
    servers_root: Path,
) -> dict[str, Any]:
    document = dict(config.model_dump(mode="json", exclude_none=True))
    document.pop("raw", None)

    metadata_raw = document.get("metadata")
    metadata: dict[str, Any]
    if isinstance(metadata_raw, dict):
        metadata = metadata_raw
    else:
        metadata = {}
        document["metadata"] = metadata

    metadata["source"] = _relative_string(source_path, servers_root)
    metadata["source_digest"] = _hash_source_file(source_path)
    metadata["registry_source"] = str(registry_path)
    metadata.pop("generated_at", None)

    registry_metadata = registry_doc.get("metadata") or {}
    tags = set(metadata.get("tags", []))
    tags.update(registry_metadata.get("tags") or [])
    if tags:
        metadata["tags"] = sorted(tags)
    if "title" not in metadata and registry_metadata.get("title"):
        metadata["title"] = registry_metadata["title"]

    for field in ("description", "notes", "version"):
        if not document.get(field) and registry_doc.get(field):
            document[field] = registry_doc[field]

    if registry_doc.get("options"):
        document["options"] = _merge_nested_dicts(
            document.get("options"),
            registry_doc["options"],
        )
    if registry_doc.get("permissions"):
        document["permissions"] = _merge_permissions(
            document.get("permissions"),
            registry_doc["permissions"],
        )

    return document


def _merge_nested_dicts(
    base: dict[str, Any] | None,
    extra: dict[str, Any],
) -> dict[str, Any]:
    result: dict[str, Any] = dict(base or {})
    for key, value in extra.items():
        if (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = _merge_nested_dicts(
                cast(dict[str, Any], result[key]),
                value,
            )
        elif key not in result or result[key] in ({}, [], None):
            result[key] = value
    return result


def _merge_permissions(
    base: dict[str, Any] | None,
    extra: dict[str, Any],
) -> dict[str, Any]:
    result: dict[str, Any] = dict(base or {})
    for key, value in extra.items():
        if key == "scope":
            scopes = set(result.get("scope", []))
            scopes.update(value or [])
            if scopes:
                result["scope"] = sorted(scopes)
        elif (
            key in result
            and isinstance(result[key], dict)
            and isinstance(value, dict)
        ):
            result[key] = _merge_nested_dicts(
                cast(dict[str, Any], result[key]),
                value,
            )
        elif key not in result or result[key] in ({}, [], None):
            result[key] = value
    return result


def _relative_string(path: Path, base: Path) -> str:
    try:
        relative = path.relative_to(base)
        base_str = base.as_posix().rstrip("/")
        if base_str:
            return f"{base_str}/{relative.as_posix()}"
        return relative.as_posix()
    except ValueError:
        return str(path)


__all__ = ["ADKSyncError", "GeneratedArtifact", "sync_adk_catalog"]
