"""Codex CLI runner powering subscription-mode MAG executions."""

from __future__ import annotations

import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Any, Mapping, MutableMapping, Optional

from magsag.agent.spec import AgentRole, EngineExecutionResult, RunSpec
from magsag.runners.json_stream import JsonStreamParser, strip_ansi


@dataclass(slots=True)
class CodexCLIConfig:
    """Configuration for invoking the Codex CLI."""

    binary: str = "codex"
    ask_for_approval: str = "on-failure"
    sandbox: str = "workspace-write"
    timeout_sec: int = 1800


class CodexCLIRunner:
    """Execute codex exec via subprocess and normalize output."""

    name = "codex-cli"
    mode = "subscription"

    def __init__(self, config: CodexCLIConfig | None = None) -> None:
        self.config = config or CodexCLIConfig()

    def is_available(self) -> bool:
        """Check if Codex CLI is available on PATH."""
        return shutil.which(self.config.binary) is not None

    def _build_command(self, spec: RunSpec) -> list[str]:
        command: list[str] = [self.config.binary, "exec"]

        resume = spec.resume or spec.session_hint
        if resume:
            command.append("resume")
            if resume == "last":
                command.append("--last")
            else:
                command.append(resume)

        command.extend(
            [
                "--json",
                "--ask-for-approval",
                self.config.ask_for_approval,
                "--sandbox",
                self.config.sandbox,
                "--cd",
                str(spec.repo_root),
                spec.prompt,
            ]
        )
        return command

    def run(
        self,
        spec: RunSpec,
        role: AgentRole,
        *,
        env: Optional[Mapping[str, str]] = None,
        observer_metadata: Optional[MutableMapping[str, Any]] = None,
    ) -> EngineExecutionResult:
        """Execute Codex CLI and map output to EngineExecutionResult."""
        if not self.is_available():
            raise RuntimeError(
                f"Codex CLI binary '{self.config.binary}' not found in PATH."
            )

        command = self._build_command(spec)

        started = time.perf_counter()
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            cwd=str(spec.repo_root),
            env=None if env is None else dict(env),
        )

        parser = JsonStreamParser()
        stdout_chunks: list[str] = []
        stderr_chunks: list[str] = []
        events: list[dict[str, Any]] = []

        try:
            stdout, stderr = process.communicate(timeout=self.config.timeout_sec)
        except subprocess.TimeoutExpired:
            process.kill()
            stdout, stderr = process.communicate()
            duration_ms = (time.perf_counter() - started) * 1000
            return EngineExecutionResult(
                engine="codex-cli",
                role=role,
                prompt=spec.prompt,
                returncode=process.returncode or -1,
                duration_ms=duration_ms,
                stdout=stdout or "",
                stderr=stderr or "",
                error=f"Codex CLI timed out after {self.config.timeout_sec}s",
            )

        duration_ms = (time.perf_counter() - started) * 1000

        if stdout:
            stdout_chunks.append(stdout)
            for item in parser.feed(stdout):
                events.append(item)
        events.extend(parser.flush())

        if stderr:
            stderr_chunks.append(stderr)

        stdout_raw = "".join(stdout_chunks)
        stderr_raw = "".join(stderr_chunks)

        stdout_text = strip_ansi(stdout_raw)
        stderr_text = strip_ansi(stderr_raw)

        session_id: Optional[str] = None
        resume_token: Optional[str] = None
        cost_usd: Optional[float] = None
        approvals_used = 0
        token_usage: MutableMapping[str, Any] = {}

        for event in events:
            if not isinstance(event, dict):
                continue
            payload: dict[str, Any] = event
            nested = event.get("data")
            if isinstance(nested, dict):
                payload = nested

            if session_id is None:
                candidate = payload.get("session_id")
                if isinstance(candidate, str):
                    session_id = candidate
                else:
                    session_data = payload.get("session")
                    if isinstance(session_data, dict):
                        session_candidate = session_data.get("id")
                        if isinstance(session_candidate, str):
                            session_id = session_candidate

            if resume_token is None:
                candidate = payload.get("resume_id") or payload.get("session_resume_token")
                if isinstance(candidate, str):
                    resume_token = candidate

            metrics = payload.get("metrics")
            if isinstance(metrics, dict):
                metric_cost = metrics.get("cost_usd")
                if isinstance(metric_cost, (int, float)):
                    cost_usd = float(metric_cost)
                usage = metrics.get("token_usage")
                if isinstance(usage, dict):
                    token_usage.update(usage)

            approval_count = payload.get("approvals_used")
            if isinstance(approval_count, int):
                approvals_used += approval_count

        return EngineExecutionResult(
            engine="codex-cli",
            role=role,
            prompt=spec.prompt,
            returncode=process.returncode or 0,
            duration_ms=duration_ms,
            events=events,
            stdout=stdout_text,
            stderr=stderr_text,
            session_id=session_id,
            resume_token=resume_token,
            cost_usd=cost_usd,
            token_usage=token_usage,
            approvals_used=approvals_used,
            sandbox_mode=self.config.sandbox,
            metadata=observer_metadata or {},
        )


__all__ = ["CodexCLIConfig", "CodexCLIRunner"]
