"""High-level orchestration for MAG/SAG engine execution."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Mapping, MutableMapping, Optional, Protocol

from magsag.agent.spec import AgentRole, EngineExecutionResult, RunOutcome, RunSpec
from magsag.observability.logger import ObservabilityLogger
from magsag.observability.metrics import get_metrics_registry
from magsag.runners.anthropic_api import (
    AnthropicAPIConfig,
    AnthropicAPIRunner,
)
from magsag.runners.claude_cli import ClaudeCLIConfig, ClaudeCLIRunner
from magsag.runners.codex_cli import CodexCLIConfig, CodexCLIRunner
from magsag.runners.openai_api import OpenAIAPIConfig, OpenAIAPIRunner
from magsag.settings import resolve_engine_config
from magsag.storage.session_store import SessionStore, create_session_meta


class EngineRunnerProtocol(Protocol):
    """Protocol shared by engine runner implementations."""

    name: str
    mode: str

    def run(
        self,
        spec: RunSpec,
        role: AgentRole,
        *,
        env: Optional[Mapping[str, str]] = None,
        observer_metadata: Optional[MutableMapping[str, Any]] = None,
    ) -> EngineExecutionResult:
        ...


@dataclass(slots=True)
class NoopRunner:
    """Fallback runner used in OSS mode until engines are implemented."""

    name: str = "noop"
    mode: str = "oss"

    def run(
        self,
        spec: RunSpec,
        role: AgentRole,
        *,
        env: Optional[Mapping[str, str]] = None,
        observer_metadata: Optional[MutableMapping[str, Any]] = None,
    ) -> EngineExecutionResult:
        return EngineExecutionResult(
            engine="noop",
            role=role,
            prompt=spec.prompt,
            returncode=0,
            duration_ms=0.0,
            events=[{"message": "Noop runner executed", "role": role}],
            stdout="",
            stderr="",
            metadata=observer_metadata or {},
        )


_PROVIDER_BY_ENGINE: dict[str, str] = {
    "codex-cli": "codex-cli",
    "claude-cli": "claude-cli",
    "openai-api": "openai",
    "anthropic-api": "anthropic",
    "noop": "noop",
}


def _coerce_int(value: Any) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value))
        except ValueError:
            return None
    return None


def _token_value(usage: Mapping[str, Any], *keys: str) -> Optional[int]:
    for key in keys:
        if key in usage:
            tokens = _coerce_int(usage[key])
            if tokens is not None:
                return tokens
    return None


def _derive_token_metrics(
    token_usage: Mapping[str, Any],
) -> tuple[int, Optional[int], Optional[int]]:
    if not isinstance(token_usage, Mapping) or not token_usage:
        return 0, None, None

    input_tokens = _token_value(token_usage, "input_tokens", "prompt_tokens", "input")
    output_tokens = _token_value(token_usage, "output_tokens", "completion_tokens", "output")
    total_tokens = _token_value(token_usage, "total_tokens", "tokens")

    if total_tokens is None:
        numeric_filtered: list[int] = []
        for key, value in token_usage.items():
            if "token" not in key:
                continue
            coerced = _coerce_int(value)
            if coerced is not None:
                numeric_filtered.append(coerced)
        if numeric_filtered:
            total_tokens = sum(numeric_filtered)

    if total_tokens is None:
        parts = [token for token in (input_tokens, output_tokens) if token is not None]
        if parts:
            total_tokens = sum(parts)

    return (total_tokens or 0), input_tokens, output_tokens


def _build_runner(engine_name: str) -> EngineRunnerProtocol:
    """Instantiate runner based on engine name."""
    config = resolve_engine_config()
    settings = config.settings

    if engine_name == "codex-cli":
        return CodexCLIRunner(
            CodexCLIConfig(
                binary=settings.CODEX_BINARY,
                ask_for_approval=settings.ENGINE_APPROVAL_MODE,
                sandbox=settings.ENGINE_SANDBOX_MODE,
                timeout_sec=settings.ENGINE_TIMEOUT_SEC,
            )
        )

    if engine_name == "claude-cli":
        return ClaudeCLIRunner(
            ClaudeCLIConfig(
                binary=settings.CLAUDE_BINARY,
                allowed_tools=settings.CLAUDE_ALLOWED_TOOLS,
                permission_mode=settings.CLAUDE_PERMISSION_MODE,
                permission_prompt_tool=settings.CLAUDE_PERMISSION_PROMPT_TOOL,
                timeout_sec=settings.ENGINE_TIMEOUT_SEC,
            )
        )

    if engine_name == "openai-api":
        return OpenAIAPIRunner(
            OpenAIAPIConfig(
                model=settings.OPENAI_MODEL,
                temperature=settings.OPENAI_TEMPERATURE,
                max_output_tokens=settings.OPENAI_MAX_OUTPUT_TOKENS,
            )
        )

    if engine_name == "anthropic-api":
        return AnthropicAPIRunner(
            AnthropicAPIConfig(
                model=settings.ANTHROPIC_MODEL,
                temperature=settings.ANTHROPIC_TEMPERATURE,
                max_output_tokens=settings.ANTHROPIC_MAX_OUTPUT_TOKENS,
            )
        )

    if engine_name == "noop":
        return NoopRunner()

    raise ValueError(f"Unsupported engine '{engine_name}'")


def execute_run(
    spec: RunSpec,
    *,
    env: Optional[Mapping[str, str]] = None,
    observer: Optional[ObservabilityLogger] = None,
    session_store: Optional[SessionStore] = None,
) -> RunOutcome:
    """Execute MAG and SAG engines according to the provided specification."""

    started_at = time.time()
    results: list[EngineExecutionResult] = []
    errors: list[str] = []
    store = session_store or SessionStore()
    notes_value = spec.metadata.get("notes") if isinstance(spec.metadata, MutableMapping) else None
    note_text = notes_value if isinstance(notes_value, str) else None

    role_sequence: tuple[AgentRole, AgentRole] = ("mag", "sag")

    for role in role_sequence:
        engine_name = spec.engine_for(role)
        runner = _build_runner(engine_name)
        role_started = time.perf_counter()

        observer_metadata: MutableMapping[str, Any] = {
            "engine": engine_name,
            "role": role,
            "mode": runner.mode,
        }

        if observer:
            observer.log(
                "engine.start",
                {
                    "engine": engine_name,
                    "role": role,
                    "mode": runner.mode,
                    "prompt_preview": spec.prompt[:120],
                },
            )

        try:
            result = runner.run(
                spec,
                role=role,
                env=env,
                observer_metadata=observer_metadata,
            )
        except Exception as exc:  # noqa: BLE001
            duration_ms = (time.perf_counter() - role_started) * 1000
            error_message = str(exc)
            errors.append(error_message)
            result = EngineExecutionResult(
                engine=engine_name,
                role=role,
                prompt=spec.prompt,
                returncode=-1,
                duration_ms=duration_ms,
                events=[],
                stdout="",
                stderr="",
                error=error_message,
                metadata=observer_metadata,
            )

        results.append(result)

        if observer:
            token_usage_map = dict(result.token_usage) if isinstance(result.token_usage, Mapping) else {}
            has_cost_data = result.cost_usd is not None
            has_token_data = bool(token_usage_map)

            if has_cost_data or has_token_data:
                total_tokens, input_tokens, output_tokens = _derive_token_metrics(token_usage_map)
                if isinstance(result.metadata, Mapping):
                    metadata_payload = dict(result.metadata)
                else:
                    metadata_payload = {}

                metadata_payload.setdefault("engine", engine_name)
                metadata_payload.setdefault("role", role)
                metadata_payload.setdefault("mode", runner.mode)

                cost_value = float(result.cost_usd) if result.cost_usd is not None else 0.0

                observer.record_cost(
                    cost_value,
                    tokens=total_tokens,
                    model=metadata_payload.get("model"),
                    provider=_PROVIDER_BY_ENGINE.get(engine_name, engine_name),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    step=f"{role}.engine",
                    metadata=dict(metadata_payload),
                )

        if result.session_id:
            extra: MutableMapping[str, Any] = dict(result.metadata)
            if result.resume_token:
                extra.setdefault("resume_token", result.resume_token)
            extra.setdefault("role", role)
            run_id_meta = spec.metadata.get("run_id") if isinstance(spec.metadata, MutableMapping) else None
            if isinstance(run_id_meta, str):
                extra.setdefault("run_id", run_id_meta)

            store.upsert(
                create_session_meta(
                    engine=result.engine,
                    repo_root=spec.repo_root,
                    session_id=result.session_id,
                    mode=spec.mode,
                    notes=note_text,
                    extra=dict(extra),
                )
            )

        if observer:
            for event in result.events:
                observer.log(
                    "engine.event",
                    {
                        "engine": engine_name,
                        "role": role,
                        "event": event,
                    },
                )
            observer.log(
                "engine.finish",
                {
                    "engine": engine_name,
                    "role": role,
                    "mode": runner.mode,
                    "ok": result.ok,
                    "duration_ms": result.duration_ms,
                    "session_id": result.session_id,
                    "resume_token": result.resume_token,
                    "error": result.error,
                },
            )

    ended_at = time.time()

    outcome = RunOutcome(
        spec=spec,
        started_at=started_at,
        ended_at=ended_at,
        results=results,
        errors=errors,
    )

    registry = get_metrics_registry()
    registry.record(outcome)

    return outcome


__all__ = ["execute_run"]
