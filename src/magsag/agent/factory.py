"""Factory helpers for building RunSpec instances from user input."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, MutableMapping

from magsag.agent.spec import RunSpec
from magsag.settings import resolve_engine_config


def create_spec(
    prompt: str,
    *,
    repo_root: str | Path | None = None,
    mode: str | None = None,
    mag: str | None = None,
    sag: str | None = None,
    resume: str | None = None,
    session_hint: str | None = None,
    metadata: Mapping[str, object] | None = None,
    extra: Mapping[str, object] | None = None,
) -> RunSpec:
    """Create a RunSpec applying environment defaults and overrides."""
    resolved = resolve_engine_config(mode=mode, mag=mag, sag=sag)
    root = Path(repo_root or Path.cwd()).resolve()

    run_metadata: MutableMapping[str, Any] = dict(metadata or {})
    run_metadata.setdefault("engine_mode", resolved.mode)

    run_extra: MutableMapping[str, Any] = dict(extra or {})

    return RunSpec(
        prompt=prompt,
        repo_root=root,
        mode=resolved.mode,
        engine_mag=resolved.engine_mag,
        engine_sag=resolved.engine_sag,
        resume=resume,
        session_hint=session_hint,
        metadata=run_metadata,
        extra=run_extra,
    )


__all__ = ["create_spec"]
