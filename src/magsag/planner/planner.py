"""Planner facade that wraps Router and returns PlanIR."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, Optional, Tuple, Type

from magsag.routing import RoutingPolicy
from magsag.routing.router import Plan, get_plan

if TYPE_CHECKING:  # pragma: no cover - typing aid
    from magsag.core.types import PlanIR, PlanStep
else:
    PlanIR = Any  # type: ignore
    PlanStep = Any  # type: ignore

_PLAN_TYPES: Tuple[Type["PlanIR"], Type["PlanStep"]] | None = None


def _get_plan_types() -> Tuple[Type["PlanIR"], Type["PlanStep"]]:
    """Lazily import PlanIR and PlanStep to avoid circular imports."""
    global _PLAN_TYPES
    if _PLAN_TYPES is None:
        from magsag.core.types import PlanIR as PlanIRModel, PlanStep as PlanStepModel

        _PLAN_TYPES = (PlanIRModel, PlanStepModel)
    return _PLAN_TYPES


class Planner:
    """
    Planner facade that wraps the existing Router functionality.

    This class provides a higher-level interface for generating execution plans,
    returning PlanIR objects that can be used by other components in the system.

    Attributes:
        _policy: Optional routing policy to use for plan generation
    """

    def __init__(self, policy: Optional[RoutingPolicy] = None):
        """
        Initialize Planner with optional routing policy.

        Args:
            policy: Optional routing policy to use. If None, uses default policy.
        """
        self._policy = policy

    def plan(
        self,
        task_type: str,
        overrides: Optional[dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Optional["PlanIR"]:
        """
        Generate execution plan for given task type.

        This method wraps the existing Router functionality and converts
        the result to PlanIR format for consumption by other components.

        Args:
            task_type: Task type identifier (e.g., "offer-orchestration")
            overrides: Optional overrides for plan attributes
            **kwargs: Additional keyword arguments for future extensibility

        Returns:
            PlanIR instance or None if no matching route found

        Examples:
            >>> planner = Planner()
            >>> plan_ir = planner.plan("offer-orchestration")
            >>> if plan_ir:
            ...     print(f"Generated plan for {plan_ir.task_type}")

            >>> # With overrides
            >>> plan_ir = planner.plan(
            ...     "offer-orchestration",
            ...     overrides={"use_batch": True}
            ... )
        """
        # Use existing router logic
        route_result = get_plan(
            task_type=task_type,
            overrides=overrides,
            policy=self._policy,
        )

        if route_result is None:
            return None

        # Convert to PlanIR format
        return self._convert_to_plan_ir(route_result)

    def _convert_to_plan_ir(self, plan: Plan) -> "PlanIR":
        """
        Convert Router Plan to PlanIR format.

        This method ensures compatibility between the Router's Plan format
        and the PlanIR format expected by other components per PLANS.md spec.

        Args:
            plan: Plan instance from Router

        Returns:
            PlanIR instance with equivalent data

        Note:
            PlanIR structure per PLANS.md includes chain, sla_ms, cost_budget
            which are not present in router Plan. These are extracted from
            metadata or provided as reasonable defaults.
        """
        metadata = plan.metadata or {}
        plan_id = metadata.get("plan_id") or f"{plan.task_type}-{uuid.uuid4().hex[:8]}"
        version = metadata.get("plan_version") or "1.0.0"
        goal = metadata.get("goal") or plan.task_type
        constraints = list(metadata.get("constraints", []))
        stop_conditions = list(metadata.get("stop_conditions", []))
        trace_group_id = metadata.get("trace_group_id")
        metadata_extra = {
            key: value
            for key, value in metadata.items()
            if key
            not in {
                "plan_id",
                "plan_version",
                "goal",
                "constraints",
                "stop_conditions",
                "trace_group_id",
                "step_id",
                "step_description",
                "step_role",
                "step_skill",
                "step_inputs",
                "step_outputs",
                "depends_on",
                "retry_policy",
                "timeout_sec",
                "budget_cents",
                "capabilities_required",
                "audit_tags",
            }
        }

        PlanIRModel, PlanStepModel = _get_plan_types()

        step = PlanStepModel(
            id=metadata.get("step_id") or f"{plan.task_type}-step-1",
            role=metadata.get("step_role") or "MAG",
            description=metadata.get("step_description")
            or f"Execute {plan.task_type} via {plan.provider}/{plan.model}",
            skill=metadata.get("step_skill"),
            inputs={
                "provider": plan.provider,
                "model": plan.model,
                "use_batch": plan.use_batch,
                "use_cache": plan.use_cache,
                "structured_output": plan.structured_output,
                "moderation": plan.moderation,
                **metadata.get("step_inputs", {}),
            },
            outputs=dict(metadata.get("step_outputs", {})),
            depends_on=list(metadata.get("depends_on", [])),
            retry_policy=dict(metadata.get("retry_policy", {})),
            timeout_sec=metadata.get("timeout_sec"),
            budget_cents=metadata.get("budget_cents"),
            capabilities_required=list(metadata.get("capabilities_required", [])),
            audit_tags=dict(metadata.get("audit_tags", {})),
        )

        return PlanIRModel(
            plan_id=plan_id,
            version=version,
            goal=goal,
            constraints=constraints,
            steps=[step],
            stop_conditions=stop_conditions,
            trace_group_id=trace_group_id,
            metadata=metadata_extra,
        )
