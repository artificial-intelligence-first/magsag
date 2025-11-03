"""Execution specification primitives shared by CLI and API surfaces."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Mapping, MutableMapping, Optional

RunMode = Literal["subscription", "api", "oss"]
EngineName = Literal["codex-cli", "claude-cli", "openai-api", "anthropic-api", "noop"]
AgentRole = Literal["mag", "sag"]


@dataclass(slots=True)
class RunSpec:
    """Complete specification for executing a MAG/SAG run."""

    prompt: str
    repo_root: Path
    mode: RunMode
    engine_mag: EngineName
    engine_sag: EngineName
    resume: Optional[str] = None
    session_hint: Optional[str] = None
    metadata: MutableMapping[str, Any] = field(default_factory=dict)
    extra: MutableMapping[str, Any] = field(default_factory=dict)

    def engine_for(self, role: AgentRole) -> EngineName:
        """Return engine name for a given role."""
        if role == "mag":
            return self.engine_mag
        if role == "sag":
            return self.engine_sag
        raise ValueError(f"Unknown agent role: {role}")


@dataclass(slots=True)
class EngineExecutionResult:
    """Run artefacts produced by executing an engine."""

    engine: EngineName
    role: AgentRole
    prompt: str
    returncode: int
    duration_ms: float
    events: list[dict[str, Any]] = field(default_factory=list)
    stdout: str = ""
    stderr: str = ""
    session_id: Optional[str] = None
    resume_token: Optional[str] = None
    cost_usd: Optional[float] = None
    token_usage: Mapping[str, Any] = field(default_factory=dict)
    approvals_used: int = 0
    sandbox_mode: Optional[str] = None
    error: Optional[str] = None
    metadata: MutableMapping[str, Any] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        """Convenience flag for success."""
        return self.returncode == 0 and self.error is None


@dataclass(slots=True)
class RunOutcome:
    """Aggregate result for a full MAG/SAG execution."""

    spec: RunSpec
    started_at: float
    ended_at: float
    results: list[EngineExecutionResult] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(result.ok for result in self.results) and not self.errors


@dataclass(slots=True)
class SessionMeta:
    """Persisted session metadata for resume and auditing."""

    engine: EngineName
    repo_root: Path
    session_id: str
    created_at: float
    last_used: float
    mode: RunMode
    notes: str | None = None
    extra: MutableMapping[str, Any] = field(default_factory=dict)
