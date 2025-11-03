"""Codex dispatcher supporting CLI and Responses API execution paths."""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
from typing import Any, Mapping, Optional, Sequence, TYPE_CHECKING, cast

from magsag.sdks.base import (
    ExternalDispatchRequest,
    ExternalDispatchResult,
    ExternalSkillDispatcher,
    register_external_dispatcher,
)
from magsag.sdks.codex.adapters import build_cli_payload, parse_cli_output, serialize_api_prompt

RuntimeAsyncOpenAI: Any = None

try:
    from openai import AsyncOpenAI as _AsyncOpenAI
except ImportError:  # pragma: no cover - optional dependency
    OPENAI_AVAILABLE = False
else:
    RuntimeAsyncOpenAI = _AsyncOpenAI
    OPENAI_AVAILABLE = True

if TYPE_CHECKING:  # pragma: no cover - type checking only
    from openai import AsyncOpenAI as AsyncOpenAIType
else:
    AsyncOpenAIType = Any


class CodexDriver(ExternalSkillDispatcher):
    """Adapter delegating Codex execution via CLI or Responses API."""

    target = "codex"

    def __init__(
        self,
        *,
        mode: str = "auto",
        cli_binary: str = "codex",
        api_model: str = "codex-mini-latest",
        default_timeout: int = 900,
    ) -> None:
        self.mode = mode
        self.cli_binary = cli_binary
        self.api_model = api_model
        self.default_timeout = default_timeout
        self._client: Optional[AsyncOpenAIType] = None

    def capabilities(self) -> Sequence[str]:
        return ("cloud_coding_agent", "tests:run")

    async def dispatch(self, request: ExternalDispatchRequest) -> ExternalDispatchResult:
        resolved_mode = self._resolve_mode(request)
        if resolved_mode == "cli":
            return await self._dispatch_cli(request)
        return await self._dispatch_api(request)

    def _resolve_mode(self, request: ExternalDispatchRequest) -> str:
        metadata_mode = str(request.metadata.get("driver_mode", "")).lower()
        if metadata_mode in {"cli", "api"}:
            return metadata_mode
        return self.mode

    async def _dispatch_cli(self, request: ExternalDispatchRequest) -> ExternalDispatchResult:
        if shutil.which(self.cli_binary) is None:
            return ExternalDispatchResult(
                status="error",
                output={},
                metadata={"mode": "cli"},
                error=f"Codex CLI '{self.cli_binary}' not found in PATH",
            )

        payload_json = build_cli_payload(
            request.skill_name,
            request.payload,
            request.files,
            request.trace_context.traceparent,
            request.audit_tags,
            request.metadata,
        )

        command = [
            self.cli_binary,
            "run",
            "--skill",
            request.skill_name,
            "--input-format",
            "json",
        ]

        timeout = request.timeout_sec or self.default_timeout

        def _run_cli() -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                command,
                input=payload_json,
                text=True,
                capture_output=True,
                check=False,
                timeout=timeout,
            )

        try:
            completed = await asyncio.to_thread(_run_cli)
        except subprocess.TimeoutExpired as exc:
            return ExternalDispatchResult(
                status="timeout",
                output={"stdout": exc.stdout or "", "stderr": exc.stderr or ""},
                metadata={"mode": "cli", "timeout_sec": timeout},
                error=f"Codex CLI timed out after {timeout}s",
            )

        metadata = {
            "mode": "cli",
            "returncode": completed.returncode,
            "stdout_bytes": len(completed.stdout or ""),
            "stderr_bytes": len(completed.stderr or ""),
        }

        if completed.returncode != 0:
            return ExternalDispatchResult(
                status="error",
                output={"stdout": completed.stdout, "stderr": completed.stderr},
                metadata=metadata,
                error=f"Codex CLI exited with status {completed.returncode}",
            )

        output_payload = parse_cli_output(completed.stdout)
        return ExternalDispatchResult(
            status="success",
            output=output_payload,
            metadata=metadata,
        )

    async def _dispatch_api(self, request: ExternalDispatchRequest) -> ExternalDispatchResult:
        if not OPENAI_AVAILABLE or RuntimeAsyncOpenAI is None:
            return ExternalDispatchResult(
                status="error",
                output={},
                metadata={"mode": "api"},
                error="openai package is not installed; install magsag[codex]",
            )

        client: Optional[AsyncOpenAIType] = self._client
        if client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                return ExternalDispatchResult(
                    status="error",
                    output={},
                    metadata={"mode": "api"},
                    error="OPENAI_API_KEY is not set; Codex API cannot be used",
                )
            runtime_cls = cast(Any, RuntimeAsyncOpenAI)
            client = runtime_cls(api_key=api_key)
            self._client = client

        prompt = serialize_api_prompt(request.skill_name, request.payload, request.files)
        metadata = {
            "mode": "api",
            "model": self.api_model,
            "traceparent": request.trace_context.traceparent,
        }

        try:
            response = await client.responses.create(
                model=self.api_model,
                input=[
                    cast(
                        Any,
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                            ],
                        },
                    )
                ],
                metadata={
                    "traceparent": request.trace_context.traceparent,
                    "skill": request.skill_name,
                },
            )
        except Exception as exc:  # pragma: no cover - API failures
            return ExternalDispatchResult(
                status="error",
                output={},
                metadata=metadata,
                error=f"Codex API invocation failed: {exc}",
            )

        output_payload: Mapping[str, Any] = {
            "response_id": response.id,
            "output": getattr(response, "output", None),
            "usage": getattr(response, "usage", None),
        }

        return ExternalDispatchResult(
            status="success",
            output=output_payload,
            metadata=metadata,
        )


# Register default driver
register_external_dispatcher(CodexDriver())

__all__ = ["CodexDriver"]
