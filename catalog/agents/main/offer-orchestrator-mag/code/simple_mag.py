"""Deterministic OfferOrchestratorMAG used by the test harness."""

from __future__ import annotations

from datetime import datetime, timezone
import uuid
from typing import Any, Dict, List

try:
    from magsag.runners.agent_runner import Delegation
except ImportError:  # pragma: no cover - fallback when package not installed
    from dataclasses import dataclass, field

    @dataclass
    class Delegation:
        task_id: str
        sag_id: str
        input: Dict[str, Any]
        context: Dict[str, Any] = field(default_factory=dict)


async def run(payload: Dict[str, Any], *, runner=None, obs=None, **_: Any) -> Dict[str, Any]:
    """Delegate to compensation-advisor-sag and assemble deterministic offer output."""
    if runner is None:
        raise RuntimeError("Runner interface is required for offer-orchestrator-mag")

    if obs and getattr(obs, "run_id", None):
        run_id = obs.run_id  # type: ignore[attr-defined]
    else:
        run_id = payload.get("run_id") or f"mag-{uuid.uuid4().hex[:6]}"

    if obs:
        obs.log("mag.start", {"agent": "offer-orchestrator-mag", "run_id": run_id})

    tasks = payload.get("tasks")
    candidate_tasks: List[Dict[str, Any]]
    if isinstance(tasks, list) and tasks:
        candidate_tasks = tasks
    else:
        candidate_tasks = [payload]

    results = []
    success_count = 0
    for index, task in enumerate(candidate_tasks):
        raw_input = task.get("input")
        candidate_profile = None
        if isinstance(raw_input, dict):
            candidate_profile = raw_input.get("candidate_profile")

        if not isinstance(candidate_profile, dict):
            candidate_profile = task.get("candidate_profile")

        if not isinstance(candidate_profile, dict):
            candidate_profile = {
                key: task.get(key)
                for key in ("role", "level", "location", "experience_years", "notes")
                if key in task
            }
        if not isinstance(candidate_profile, dict):
            candidate_profile = {
                key: payload.get(key)
                for key in ("role", "level", "location", "experience_years", "notes")
                if payload.get(key) is not None
            }

        task_input = raw_input if isinstance(raw_input, dict) else {}
        merged_input = dict(task_input)
        merged_input["candidate_profile"] = candidate_profile

        delegation = Delegation(
            task_id=task.get("task_id") or f"task-{index}-{uuid.uuid4().hex[:4]}",
            sag_id=task.get("sag_id", "compensation-advisor-sag"),
            input=merged_input,
            context={
                "requested_by": "offer-orchestrator-mag",
                "task_index": index,
                "total_tasks": len(candidate_tasks),
                "parent_run_id": run_id,
            },
        )

        sag_result = await runner.invoke_sag_async(delegation)

        results.append({"task_id": sag_result.task_id, "status": sag_result.status, "output": sag_result.output})
        if sag_result.status == "success":
            success_count += 1

    first_success = next((item for item in results if item["status"] == "success"), None)
    offer_output = first_success["output"]["offer"] if first_success else {}

    if success_count == 0:
        if obs:
            obs.log(
                "mag.error",
                {
                    "agent": "offer-orchestrator-mag",
                    "run_id": run_id,
                    "tasks_attempted": len(candidate_tasks),
                    "failures": [item["task_id"] for item in results],
                },
            )
        raise RuntimeError("All delegations failed; no offer generated.")

    if obs:
        obs.metric("latency_ms", max(1, len(candidate_tasks) * 5))
        obs.log(
            "mag.end",
            {
                "agent": "offer-orchestrator-mag",
                "run_id": run_id,
                "tasks_processed": len(candidate_tasks),
            },
        )

    metadata = {
        "generated_by": "OfferOrchestratorMAG",
        "run_id": run_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "0.1.0",
        "task_count": len(candidate_tasks),
        "successful_tasks": success_count,
    }

    aggregates = {
        "numbers_total": sum(
            item["output"]["analysis"]["summary"]["numbers_total"]
            for item in results
            if item["status"] == "success"
        ),
        "tasks_processed": len(candidate_tasks),
    }

    return {
        "offer": offer_output,
        "metadata": metadata,
        "mag": "offer-orchestrator-mag",
        "results": results,
        "aggregates": aggregates,
    }
