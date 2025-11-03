"""Claude Code CLI runner powering subscription-mode SAG executions."""

from __future__ import annotations

import shutil
import subprocess
import time
from dataclasses import dataclass
from typing import Any, Mapping, MutableMapping, Optional

from magsag.agent.spec import AgentRole, EngineExecutionResult, RunSpec
from magsag.runners.json_stream import JsonStreamParser, strip_ansi


@dataclass(slots=True)
class ClaudeCLIConfig:
    """Configuration for invoking Claude Code CLI."""

    binary: str = "claude"
    allowed_tools: str = "Read,Bash,Edit"
    permission_mode: str = "acceptEdits"
    permission_prompt_tool: str | None = None
    timeout_sec: int = 1800


class ClaudeCLIRunner:
    """Execute claude CLI and normalize JSONL output."""

    name = "claude-cli"
    mode = "subscription"

    def __init__(self, config: ClaudeCLIConfig | None = None) -> None:
        self.config = config or ClaudeCLIConfig()

    def is_available(self) -> bool:
        """Check if Claude CLI is available on PATH."""
        return shutil.which(self.config.binary) is not None

    def _build_command(self, spec: RunSpec) -> list[str]:
        command: list[str] = [
            self.config.binary,
            "--output-format",
            "stream-json",
            "--allowedTools",
            self.config.allowed_tools,
            "--permission-mode",
            self.config.permission_mode,
        ]

        resume = spec.resume or spec.session_hint
        if resume:
            if resume == "last":
                command.append("--continue")
            else:
                command.extend(["--resume", resume])

        if self.config.permission_prompt_tool:
            command.extend(["--permission-prompt-tool", self.config.permission_prompt_tool])

        command.extend(["-p", spec.prompt])
        return command

    def run(
        self,
        spec: RunSpec,
        role: AgentRole,
        *,
        env: Optional[Mapping[str, str]] = None,
        observer_metadata: Optional[MutableMapping[str, Any]] = None,
    ) -> EngineExecutionResult:
        """Execute Claude CLI and return normalized execution result."""
        if not self.is_available():
            raise RuntimeError(
                f"Claude CLI binary '{self.config.binary}' not found in PATH."
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
                engine="claude-cli",
                role=role,
                prompt=spec.prompt,
                returncode=process.returncode or -1,
                duration_ms=duration_ms,
                stdout=stdout or "",
                stderr=stderr or "",
                error=f"Claude CLI timed out after {self.config.timeout_sec}s",
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
            engine="claude-cli",
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
            metadata=observer_metadata or {},
        )


__all__ = ["ClaudeCLIConfig", "ClaudeCLIRunner"]
