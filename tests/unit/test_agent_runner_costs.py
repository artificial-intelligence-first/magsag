from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import pytest

from magsag.agent.runner import execute_run
from magsag.agent.spec import AgentRole, EngineExecutionResult, EngineName, RunSpec
from magsag.observability.logger import ObservabilityLogger
from magsag.storage.session_store import SessionStore


class _DummyRunner:
    def __init__(self, engine_name: EngineName) -> None:
        self.name: EngineName = engine_name
        self.mode: str = "subscription"

    def run(
        self,
        spec: RunSpec,
        role: AgentRole,
        *,
        env: Dict[str, str] | None = None,
        observer_metadata: Dict[str, Any] | None = None,
    ) -> EngineExecutionResult:
        if self.name == "codex-cli":
            cost_usd = 1.23
            usage: dict[str, Any] = {"input_tokens": 10, "output_tokens": 4}
        else:
            cost_usd = 0.57
            usage = {"total_tokens": 9}

        return EngineExecutionResult(
            engine=self.name,
            role=role,
            prompt=spec.prompt,
            returncode=0,
            duration_ms=42.0,
            events=[],
            stdout="",
            stderr="",
            cost_usd=cost_usd,
            token_usage=usage,
            metadata=observer_metadata or {},
        )


class _RecordingObserver(ObservabilityLogger):
    def __init__(self, base_dir: Path) -> None:
        super().__init__(run_id="test-run", slug="unit-test", base_dir=base_dir)
        self.cost_calls: list[dict[str, Any]] = []

    def record_cost(
        self,
        cost_usd: float,
        tokens: int = 0,
        *,
        model: str | None = None,
        provider: str | None = None,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        step: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.cost_calls.append(
            {
                "cost_usd": cost_usd,
                "tokens": tokens,
                "provider": provider,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "step": step,
                "metadata": dict(metadata or {}),
            }
        )
        super().record_cost(
            cost_usd,
            tokens,
            model=model,
            provider=provider,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            step=step,
            metadata=metadata,
        )


@pytest.mark.usefixtures("reset_engine_caches")
def test_execute_run_records_costs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    def fake_builder(engine_name: EngineName) -> _DummyRunner:
        return _DummyRunner(engine_name)

    monkeypatch.setattr("magsag.agent.runner._build_runner", fake_builder)

    spec = RunSpec(
        prompt="Collect metrics",
        repo_root=tmp_path,
        mode="subscription",
        engine_mag="codex-cli",
        engine_sag="claude-cli",
    )

    observer = _RecordingObserver(base_dir=tmp_path)
    store = SessionStore(base_dir=tmp_path)

    execute_run(spec, observer=observer, session_store=store)

    assert len(observer.cost_calls) == 2

    mag_call = observer.cost_calls[0]
    assert mag_call["cost_usd"] == pytest.approx(1.23)
    assert mag_call["tokens"] == 14
    assert mag_call["input_tokens"] == 10
    assert mag_call["output_tokens"] == 4
    assert mag_call["provider"] == "codex-cli"
    assert mag_call["step"] == "mag.engine"
    assert mag_call["metadata"]["engine"] == "codex-cli"

    sag_call = observer.cost_calls[1]
    assert sag_call["cost_usd"] == pytest.approx(0.57)
    assert sag_call["tokens"] == 9
    assert sag_call["provider"] == "claude-cli"
    assert sag_call["step"] == "sag.engine"
