"""Claude Agent SDK dispatcher integrating with the external handoff tool."""

from __future__ import annotations

from typing import Mapping, Optional, Sequence

from magsag.sdks.base import (
    ExternalDispatchRequest,
    ExternalDispatchResult,
    ExternalSkillDispatcher,
    register_external_dispatcher,
)
from magsag.sdks.claude_agent.sandbox import ClaudeSandbox
from magsag.sdks.claude_agent.skills import SkillContext, execute_skill


class ClaudeSAGDriver(ExternalSkillDispatcher):
    """Adapter executing registered Claude skills within a sandbox."""

    target = "claude"

    def __init__(
        self,
        sandbox: Optional[ClaudeSandbox] = None,
        capabilities: Optional[Sequence[str]] = None,
    ) -> None:
        self.sandbox = sandbox or ClaudeSandbox()
        self._capabilities = tuple(capabilities or ("fs", "cli", "mcp"))

    def capabilities(self) -> Sequence[str]:
        return self._capabilities

    async def dispatch(self, request: ExternalDispatchRequest) -> ExternalDispatchResult:
        normalized_files = self.sandbox.normalize_files(request.files)
        context = SkillContext(
            sandbox=self.sandbox,
            traceparent=request.trace_context.traceparent,
            files=normalized_files,
            budget_cents=request.budget_cents,
            timeout_sec=request.timeout_sec,
            audit_tags=dict(request.audit_tags),
            metadata=dict(request.metadata),
        )

        result_payload = await execute_skill(request.skill_name, request.payload, context)

        metadata: Mapping[str, object] = {
            "sandbox": self.sandbox.describe(),
            "traceparent": request.trace_context.traceparent,
            "skill": request.skill_name,
        }

        return ExternalDispatchResult(
            status="success",
            output=result_payload,
            metadata=metadata,
        )


# Register default driver in the global registry
register_external_dispatcher(ClaudeSAGDriver())

__all__ = ["ClaudeSAGDriver"]
