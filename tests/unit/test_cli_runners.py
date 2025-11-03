from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from magsag.agent.spec import RunSpec
from magsag.runners.claude_cli import ClaudeCLIRunner
from magsag.runners.codex_cli import CodexCLIRunner


class _DummyProcess:
    def __init__(self, stdout: str, stderr: str) -> None:
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = 0

    def communicate(self, timeout: int) -> tuple[str, str]:
        return self._stdout, self._stderr

    def kill(self) -> None:  # pragma: no cover - harmless fallback
        pass


def _make_spec(tmp_path: Path) -> RunSpec:
    return RunSpec(
        prompt="Check colour sanitisation",
        repo_root=tmp_path,
        mode="subscription",
        engine_mag="codex-cli",
        engine_sag="claude-cli",
    )


@pytest.mark.usefixtures("reset_engine_caches")
def test_codex_cli_runner_strips_ansi(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    runner = CodexCLIRunner()
    monkeypatch.setattr(runner, "is_available", lambda: True)

    coloured_json = (
        "\u001b[32m"
        '{"data":{"session":{"id":"sess-mag"},"metrics":{"cost_usd":1.5,"token_usage":{"input_tokens":11,"output_tokens":5}}}}\n'
        "\u001b[0m"
    )
    coloured_stderr = "\u001b[31mwarning\u001b[0m"

    def fake_popen(*args: Any, **kwargs: Any) -> _DummyProcess:
        return _DummyProcess(coloured_json, coloured_stderr)

    monkeypatch.setattr("magsag.runners.codex_cli.subprocess.Popen", fake_popen)

    spec = _make_spec(tmp_path)
    result = runner.run(spec, role="mag", observer_metadata={"engine": "codex-cli"})

    assert "\u001b" not in result.stdout
    assert "\u001b" not in result.stderr
    assert result.stdout.strip().startswith('{"data":')
    assert result.session_id == "sess-mag"


@pytest.mark.usefixtures("reset_engine_caches")
def test_claude_cli_runner_strips_ansi(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    runner = ClaudeCLIRunner()
    monkeypatch.setattr(runner, "is_available", lambda: True)

    coloured_json = (
        "\u001b[36m"
        '{"data":{"session":{"id":"sess-sag"},"metrics":{"cost_usd":0.8,"token_usage":{"total_tokens":9}}}}\n'
        "\u001b[0m"
    )
    coloured_stderr = "\u001b[35mnote\u001b[0m"

    def fake_popen(*args: Any, **kwargs: Any) -> _DummyProcess:
        return _DummyProcess(coloured_json, coloured_stderr)

    monkeypatch.setattr("magsag.runners.claude_cli.subprocess.Popen", fake_popen)

    spec = _make_spec(tmp_path)
    result = runner.run(spec, role="sag", observer_metadata={"engine": "claude-cli"})

    assert "\u001b" not in result.stdout
    assert "\u001b" not in result.stderr
    assert result.stdout.strip().startswith('{"data":')
    assert result.session_id == "sess-sag"


@pytest.mark.usefixtures("reset_engine_caches")
def test_claude_cli_runner_positions_prompt_after_flag(tmp_path: Path) -> None:
    runner = ClaudeCLIRunner()

    spec = RunSpec(
        prompt="Plan rollout",
        repo_root=tmp_path,
        mode="subscription",
        engine_mag="codex-cli",
        engine_sag="claude-cli",
    )

    command = runner._build_command(spec)
    assert command[-2:] == ["-p", spec.prompt]
    assert "--output-format" in command
    assert command.index("--output-format") < command.index("-p")
