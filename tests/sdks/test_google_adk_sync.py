from __future__ import annotations

import json
from pathlib import Path

from magsag.sdks.google_adk.sync import sync_adk_catalog


def test_sync_generates_json_only(tmp_path: Path) -> None:
    output_root = tmp_path
    registry = Path("ops/adk/catalog.yaml")
    servers_dir = Path("ops/adk/servers")

    artifacts = sync_adk_catalog(
        registry_path=registry,
        servers_dir=servers_dir,
        output_root=output_root,
        dry_run=False,
    )

    expected_servers = {
        output_root / ".mcp" / "servers" / name
        for name in (
            "notion.json",
            "github.json",
            "fetch.json",
            "filesystem.json",
            "memory.json",
            "obsidian.json",
            "pg-readonly.json",
            "supabase.json",
        )
    }

    generated_paths = {artifact.path for artifact in artifacts}
    assert expected_servers.issubset(generated_paths)

    # Server docs include deterministic metadata without generated_at
    for server_path in expected_servers:
        data = json.loads(server_path.read_text(encoding="utf-8"))
        assert data["server_id"]
        metadata = data.get("metadata", {})
        assert metadata.get("source")
        assert metadata.get("source_digest")
        if server_path.name == "notion.json":
            # Ensure YAML transport and fallbacks are preserved
            assert data["transport"]["url"] == "https://mcp.notion.com/mcp"
            fallback_types = {entry["type"] for entry in data.get("fallback", [])}
            assert fallback_types == {"sse", "stdio"}
            assert metadata.get("registry_source") == str(registry)
            assert "notion" in metadata.get("tags", [])
        assert "generated_at" not in data

    # Tool docs provide deterministic metadata
    for artifact in artifacts:
        if "catalog/tools" not in str(artifact.path):
            continue
        payload = json.loads(artifact.path.read_text(encoding="utf-8"))
        meta = payload.get("metadata", {})
        assert meta.get("source")
        assert meta.get("source_digest")
        assert "generated_at" not in meta

    json_only_dirs = [output_root / ".mcp" / "servers", output_root / "catalog" / "tools"]
    for directory in json_only_dirs:
        for path in directory.rglob("*"):
            if path.is_file():
                assert path.suffix == ".json", f"unexpected artefact: {path}"

    # Dry-run should match on-disk content exactly
    preview = sync_adk_catalog(
        registry_path=registry,
        servers_dir=servers_dir,
        output_root=output_root,
        dry_run=True,
    )

    for artefact in preview:
        disk_path = artefact.path
        assert disk_path.exists(), f"Missing artefact during dry-run: {disk_path}"
        assert disk_path.read_text(encoding="utf-8") == artefact.content
