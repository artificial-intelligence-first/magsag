from __future__ import annotations

from importlib import resources
from importlib.resources.abc import Traversable
from typing import Iterable

PRESET_PACKAGE = "magsag.mcp.presets.servers"


def available_presets() -> list[str]:
    """Return a sorted list of bundled MCP server presets."""
    files = resources.files(PRESET_PACKAGE)
    return sorted(
        _stem(entry.name)
        for entry in files.iterdir()
        if _is_yaml_file(entry)
    )


def load_preset(provider: str) -> str:
    """Load preset YAML content for a provider."""
    normalized = provider.strip().lower()
    files = resources.files(PRESET_PACKAGE)

    for entry in files.iterdir():
        if not _is_yaml_file(entry):
            continue
        if _stem(entry.name) == normalized:
            return entry.read_text(encoding="utf-8")

    raise ValueError(f"Unknown MCP preset provider: {provider}")


def load_presets(providers: Iterable[str]) -> dict[str, str]:
    """Load multiple presets into a mapping provider -> YAML text."""
    mapping: dict[str, str] = {}
    for provider in providers:
        mapping[provider] = load_preset(provider)
    return mapping


def _is_yaml_file(entry: Traversable) -> bool:
    """Return True when traversable points to a YAML file."""
    if not entry.is_file():
        return False
    name = entry.name.lower()
    return name.endswith(".yaml") or name.endswith(".yml")


def _stem(name: str) -> str:
    """Return filename without extension."""
    idx = name.rfind(".")
    return name[:idx] if idx != -1 else name
