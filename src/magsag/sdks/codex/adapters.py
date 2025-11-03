"""Utility helpers for Codex SDK integrations."""

from __future__ import annotations

import json
from typing import Any, Mapping, MutableMapping, Sequence


def build_cli_payload(
    skill_name: str,
    payload: Mapping[str, Any],
    files: Sequence[str],
    traceparent: str,
    audit_tags: Mapping[str, str],
    metadata: Mapping[str, Any],
) -> str:
    """Serialize CLI input payload as a JSON string."""
    envelope: MutableMapping[str, Any] = {
        "skill": skill_name,
        "payload": dict(payload),
        "files": list(files),
        "traceparent": traceparent,
        "audit_tags": dict(audit_tags),
        "metadata": dict(metadata),
    }
    return json.dumps(envelope, ensure_ascii=False)


def parse_cli_output(stdout: str) -> dict[str, Any]:
    """Parse Codex CLI output, falling back to wrapping stdout."""
    try:
        parsed = json.loads(stdout)
    except json.JSONDecodeError:
        return {"stdout": stdout}

    if isinstance(parsed, dict):
        return parsed

    return {"output": parsed}


def serialize_api_prompt(
    skill_name: str,
    payload: Mapping[str, Any],
    files: Sequence[str],
) -> str:
    """Create a structured prompt for the Responses API."""
    envelope = {
        "skill": skill_name,
        "payload": dict(payload),
        "files": list(files),
    }
    return json.dumps(envelope, ensure_ascii=False)
