"""Agent execution API endpoints."""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import yaml
from anyio import to_thread
from fastapi import APIRouter, Depends, HTTPException, status

from magsag.registry import get_registry
from magsag.runners.agent_runner import AgentRunner, invoke_mag
from magsag.governance.approval_gate import ApprovalGateError
from magsag.governance.budget_controller import BudgetExceededError

from ..config import Settings, get_settings
from ..models import (
    AgentInfo,
    AgentRunRequest,
    AgentRunResponse,
    ExternalHandoffRequest,
    ExternalHandoffResponse,
)
from ..rate_limit import rate_limit_dependency
from ..run_tracker import find_new_run_id, snapshot_runs
from ..security import require_scope

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agents"])


@router.get(
    "/agents", response_model=list[AgentInfo], dependencies=[Depends(rate_limit_dependency)]
)
async def list_agents(
    _: str = Depends(require_scope(["agents:read"])),
    settings: Settings = Depends(get_settings),
) -> list[AgentInfo]:
    """
    List all registered agents by scanning catalog/agents/main/ and catalog/agents/sub/.

    Uses Registry's base_path to resolve agent directories relative to the package,
    ensuring the listing works regardless of CWD.

    Returns:
        List of agent metadata from agent.yaml files
    """
    items: list[AgentInfo] = []

    # Use Registry's base_path (same as Registry uses) to ensure consistency
    registry = get_registry()
    base_path = registry.base_path

    # Scan both main and sub agent directories
    for agent_type in ["main", "sub"]:
        agents_dir = base_path / "catalog" / "agents" / agent_type
        if not agents_dir.exists():
            continue

        for agent_dir in agents_dir.iterdir():
            if not agent_dir.is_dir() or agent_dir.name.startswith("_"):
                continue

            agent_yaml_path = agent_dir / "agent.yaml"
            if not agent_yaml_path.exists():
                continue

            try:
                agent_payload = agent_yaml_path.read_text(encoding="utf-8")
            except OSError as exc:
                logger.warning("Failed to read agent metadata at %s", agent_yaml_path, exc_info=exc)
                continue

            try:
                agent_data = yaml.safe_load(agent_payload) or {}
            except yaml.YAMLError as exc:
                logger.warning("Invalid YAML in %s", agent_yaml_path, exc_info=exc)
            else:
                items.append(
                    AgentInfo(
                        slug=agent_data.get("slug", agent_dir.name),
                        title=agent_data.get("name"),
                        description=agent_data.get("description"),
                    )
                )

    return items


@router.post(
    "/agents/{slug}/run",
    response_model=AgentRunResponse,
    dependencies=[Depends(rate_limit_dependency)],
)
async def run_agent(
    slug: str,
    req: AgentRunRequest,
    _: str = Depends(require_scope(["agents:run"])),
    settings: Settings = Depends(get_settings),
) -> AgentRunResponse:
    """
    Execute a MAG agent with given payload.

    Args:
        slug: Agent slug identifier
        req: Request containing payload and optional metadata

    Returns:
        Agent execution response with output and run_id

    Raises:
        HTTPException: 404 if agent not found, 400 for execution errors, 500 for internal errors
    """
    base = Path(settings.RUNS_BASE_DIR)
    before = snapshot_runs(base)
    started_at = time.time()

    # Create context to receive run_id from invoke_mag
    context: dict[str, Any] = {}

    # Execute agent in thread pool (invoke_mag is blocking)
    # Pass base_dir and context to ensure run_id is returned
    try:
        output: dict[str, Any] = await to_thread.run_sync(
            invoke_mag, slug, req.payload, base, context
        )
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "agent_not_found", "message": str(e)},
        ) from e
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_payload", "message": str(e)},
        ) from e
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "execution_failed", "message": str(e)},
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "Unexpected error during execution"},
        ) from e

    # Extract run_id from context (primary method)
    run_id: str | None = context.get("run_id")

    # Fallback: Try to extract run_id from output
    if run_id is None and isinstance(output, dict):
        possible_run_id = output.get("run_id")
        if isinstance(possible_run_id, str):
            run_id = possible_run_id

    # Secondary fallback: Find run_id from filesystem
    if run_id is None:
        run_id = find_new_run_id(base, before, slug, started_at)

    # Build artifacts URLs
    artifacts = None
    if run_id:
        artifacts = {
            "summary": f"{settings.API_PREFIX}/runs/{run_id}",
            "logs": f"{settings.API_PREFIX}/runs/{run_id}/logs",
        }

    return AgentRunResponse(
        run_id=run_id,
        slug=slug,
        output=output,
        artifacts=artifacts,
    )


@router.post(
    "/agents/handoff",
    response_model=ExternalHandoffResponse,
    dependencies=[Depends(rate_limit_dependency)],
)
async def delegate_external_handoff(
    req: ExternalHandoffRequest,
    _: str = Depends(require_scope(["agents:run"])),
) -> ExternalHandoffResponse:
    """Delegate execution to external SDK drivers (Claude or Codex)."""

    runner = AgentRunner()

    try:
        result = await runner.delegate_external_async(
            target=req.target,
            skill_name=req.skill_name,
            payload=req.payload,
            files=req.files,
            trace_id=req.trace_id,
            step_id=req.step_id,
            budget_cents=req.budget_cents,
            timeout_sec=req.timeout_sec,
            audit_tags=req.audit_tags or {},
            metadata=req.metadata or {},
            capabilities_required=req.capabilities_required,
            preferred_target=req.preferred_target,
        )
    except BudgetExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"code": "budget_exceeded", "message": str(exc)},
        ) from exc
    except ApprovalGateError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "approval_required", "message": str(exc)},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_payload", "message": str(exc)},
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "internal_error", "message": "External handoff failed"},
        ) from exc

    result_map = dict(result) if isinstance(result, dict) else {}

    return ExternalHandoffResponse(
        status=str(result_map.get("status", "unknown")),
        target=str(result_map.get("target", req.target)),
        skill=str(result_map.get("skill", req.skill_name)),
        output=dict(result_map.get("output", {})),
        metadata=dict(result_map.get("metadata", {})),
        traceparent=result_map.get("traceparent"),
        trace_id=result_map.get("trace_id"),
        span_id=result_map.get("span_id"),
        parent_span_id=result_map.get("parent_span_id"),
    )
