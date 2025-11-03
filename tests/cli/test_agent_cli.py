from __future__ import annotations

import json
from typing import Any

from typer.testing import CliRunner

from pathlib import Path

import pytest

from magsag.agent.spec import EngineExecutionResult, RunOutcome
from magsag.cli import app


def test_agent_cli_subscription_mode(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    runner = CliRunner()

    class DummyObserver:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def log(self, *args: Any, **kwargs: Any) -> None:
            pass

        def metric(self, *args: Any, **kwargs: Any) -> None:
            pass

        def finalize(self) -> None:
            pass

    def fake_execute_run(*args: Any, **kwargs: Any) -> RunOutcome:
        spec = args[0]
        mag_result = EngineExecutionResult(
            engine="codex-cli",
            role="mag",
            prompt=spec.prompt,
            returncode=0,
            duration_ms=120.0,
            events=[{"event": "output"}],
            stdout="Plan created",
            stderr="",
        )
        sag_result = EngineExecutionResult(
            engine="claude-cli",
            role="sag",
            prompt=spec.prompt,
            returncode=0,
            duration_ms=150.0,
            events=[{"event": "output"}],
            stdout="Patch ready",
            stderr="",
        )
        return RunOutcome(
            spec=spec,
            started_at=0.0,
            ended_at=0.1,
            results=[mag_result, sag_result],
            errors=[],
        )

    monkeypatch.setattr("magsag.cli.ObservabilityLogger", DummyObserver)
    monkeypatch.setattr("magsag.cli.execute_run", fake_execute_run)

    result = runner.invoke(
        app,
        [
            "agent",
            "--repo",
            str(tmp_path),
            "--json",
            "Draft implementation plan",
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["mode"] == "subscription"
    assert payload["engines"]["mag"] == "codex-cli"
    assert len(payload["results"]) == 2
