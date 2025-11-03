"""External handoff tool bridging OpenAI Agents with Claude/Codex dispatchers."""

from __future__ import annotations

import logging
from typing import Any, Mapping, MutableMapping, Optional, Sequence

from magsag.observability.tracing import trace_span
from magsag.sdks.base import (
    ExternalDispatchRequest,
    ExternalDispatchResult,
    ExternalDispatcherRegistry,
    build_trace_context,
    get_external_dispatcher_registry,
)


logger = logging.getLogger(__name__)


class ExternalHandoffTool:
    """
    Registerable tool for OpenAI Agents SDK to delegate work to external SAGs.

    The tool accepts Claude/Codex targets and forwards execution through the
    dispatcher registry with full trace context propagation.
    """

    name = "external_handoff"
    description = (
        "Delegate the current plan step to an external SDK (Claude or Codex) "
        "while preserving tracing, budgets, and audit metadata."
    )
    parameters = {
        "type": "object",
        "properties": {
            "target": {
                "type": "string",
                "enum": ["claude", "codex"],
                "description": "External SDK target to invoke.",
            },
            "skill_name": {
                "type": "string",
                "description": "Skill or task identifier to execute on the target SDK.",
            },
            "payload": {
                "type": "object",
                "description": "Input payload forwarded to the external skill.",
            },
            "files": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional file URIs or paths to attach to the request.",
            },
            "trace_id": {
                "type": "string",
                "description": "Optional W3C trace identifier to continue.",
            },
            "step_id": {
                "type": "string",
                "description": "PlanIR step identifier to attribute the handoff.",
            },
            "budget_cents": {
                "type": "integer",
                "description": "Maximum spend allowed for this external call (in cents).",
            },
            "timeout_sec": {
                "type": "integer",
                "description": "Timeout budget for the external execution (seconds).",
            },
            "audit_tags": {
                "type": "object",
                "additionalProperties": {"type": "string"},
                "description": "Audit tags passed to governance and logging systems.",
            },
            "metadata": {
                "type": "object",
                "description": "Opaque metadata forwarded to the external dispatcher.",
            },
        },
        "required": ["target", "skill_name", "payload"],
        "additionalProperties": False,
    }

    def __init__(self, registry: Optional[ExternalDispatcherRegistry] = None) -> None:
        self._registry = registry or get_external_dispatcher_registry()
        self._ensure_default_dispatchers()

    async def __call__(
        self,
        *,
        target: str,
        skill_name: str,
        payload: Mapping[str, Any],
        files: Optional[Sequence[str]] = None,
        trace_id: Optional[str] = None,
        step_id: Optional[str] = None,
        budget_cents: Optional[int] = None,
        timeout_sec: Optional[int] = None,
        audit_tags: Optional[Mapping[str, str]] = None,
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> MutableMapping[str, Any]:
        """
        Invoke the external dispatcher registered for the provided target.

        Raises:
            ValueError: When the requested target has no registered dispatcher.
        """
        dispatcher = self._registry.get(target)
        if dispatcher is None:
            available = ", ".join(self._registry.list_targets())
            raise ValueError(
                f"Unsupported external handoff target '{target}'. "
                f"Registered targets: {available or 'none'}."
            )

        trace_context = build_trace_context(trace_id=trace_id)
        request = ExternalDispatchRequest(
            skill_name=skill_name,
            payload=dict(payload),
            files=list(files or []),
            trace_context=trace_context,
            step_id=step_id,
            budget_cents=budget_cents,
            timeout_sec=timeout_sec,
            audit_tags=dict(audit_tags or {}),
            metadata=dict(metadata or {}),
        )

        with trace_span(
            "external_handoff",
            {
                "handoff.target": target,
                "handoff.skill": skill_name,
                "handoff.traceparent": trace_context.traceparent,
                "handoff.step_id": step_id or "",
            },
        ) as span:
            if budget_cents is not None:
                span.set_attribute("handoff.budget_cents", budget_cents)
            if timeout_sec is not None:
                span.set_attribute("handoff.timeout_sec", timeout_sec)

            result = await dispatcher.dispatch(request)

            self._annotate_span(span, result)

        return {
            "status": result.status,
            "target": target,
            "skill": skill_name,
            "output": dict(result.output),
            "metadata": dict(result.metadata),
            "traceparent": trace_context.traceparent,
            "trace_id": trace_context.trace_id,
            "span_id": trace_context.span_id,
            "parent_span_id": trace_context.parent_span_id,
            "budget_cents": budget_cents,
            "timeout_sec": timeout_sec,
        }

    @staticmethod
    def _annotate_span(span: Any, result: ExternalDispatchResult) -> None:
        """Attach execution outcome metadata to the tracing span."""
        try:
            span.set_attribute("handoff.status", result.status)
            if result.error:
                span.set_attribute("handoff.error", result.error)
            result_metadata = dict(result.metadata)
            if result_metadata:
                span.set_attribute("handoff.metadata_keys", ",".join(sorted(result_metadata.keys())))
        except AttributeError:
            # Span is a no-op stub; ignore annotation failures.
            return

    def _ensure_default_dispatchers(self) -> None:
        """Ensure built-in dispatchers (Claude, Codex) are registered."""
        targets = set(self._registry.list_targets())

        try:
            if "claude" not in targets:
                from magsag.sdks.claude_agent.driver import ClaudeSAGDriver

                self._registry.register(ClaudeSAGDriver())
        except Exception as exc:  # pragma: no cover - defensive guard
            logger.warning("Failed to register Claude dispatcher: %s", exc)

        try:
            if "codex" not in targets:
                from magsag.sdks.codex.driver import CodexDriver

                self._registry.register(CodexDriver())
        except Exception as exc:  # pragma: no cover - defensive guard
            logger.warning("Failed to register Codex dispatcher: %s", exc)
