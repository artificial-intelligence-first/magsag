from __future__ import annotations

from pathlib import Path

from magsag.mcp.registry import bootstrap_presets, list_local_servers


def test_bootstrap_presets_create_and_update(tmp_path: Path) -> None:
    results = bootstrap_presets(provider="notion", target_dir=tmp_path)
    assert results == {"notion": "created"}
    assert (tmp_path / "notion.yaml").exists()

    second = bootstrap_presets(provider="notion", target_dir=tmp_path)
    assert second == {"notion": "skipped"}

    forced = bootstrap_presets(provider="notion", target_dir=tmp_path, force=True)
    assert forced == {"notion": "updated"}


def test_list_local_servers(tmp_path: Path) -> None:
    bootstrap_presets(provider="notion", target_dir=tmp_path)
    notion_yaml = tmp_path / "notion.yaml"
    assert notion_yaml.exists()

    servers = list_local_servers(tmp_path)
    assert notion_yaml in servers
    assert all(path.suffix in {".yaml", ".yml"} for path in servers)
