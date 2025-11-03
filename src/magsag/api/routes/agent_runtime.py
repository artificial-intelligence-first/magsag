"""Unified agent runtime endpoint for MAG/SAG execution."""

from __future__ import annotations

import time
import uuid
from functools import partial
from pathlib import Path

import anyio
from fastapi import APIRouter, Depends, HTTPException, status

from magsag.agent.factory import create_spec
from magsag.agent.runner import execute_run
from magsag.api.config import Settings, get_settings
from magsag.api.models import (
    AgentExecuteRequest,
    AgentExecuteResponse,
    EngineExecutionModel,
)
from magsag.observability.logger import ObservabilityLogger

router = APIRouter(tags=["agent-runtime"])


@router.post(
    "/agent/run",
    response_model=AgentExecuteResponse,
    status_code=status.HTTP_200_OK,
)
async def agent_execute(
    req: AgentExecuteRequest,
    settings: Settings = Depends(get_settings),
) -> AgentExecuteResponse:
    """Execute MAG/SAG engines based on the provided request."""
    repo_root = Path(req.repo or ".").resolve()
    if not repo_root.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_repo", "message": f"Repository path not found: {repo_root}"},
        )

    run_id = f"run-{uuid.uuid4().hex[:12]}"
    metadata = dict(req.metadata or {})
    if req.notes:
        metadata["notes"] = req.notes

    spec = create_spec(
        req.prompt,
        repo_root=repo_root,
        mode=req.mode,
        mag=req.mag,
        sag=req.sag,
        resume=req.resume,
        session_hint=req.session_id,
        metadata=metadata,
        extra=req.extra or {},
    )
    spec.metadata["run_id"] = run_id

    observer = ObservabilityLogger(
        run_id=run_id,
        slug="magsag-agent",
        base_dir=Path(settings.RUNS_BASE_DIR),
    )

    start_wall = time.time()
    try:
        outcome = await anyio.to_thread.run_sync(partial(execute_run, spec, observer=observer))
    except Exception as exc:  # noqa: BLE001
        observer.log(
            "engine.execution_failed",
            {
                "run_id": run_id,
                "error": str(exc),
                "mode": spec.mode,
                "repo": str(repo_root),
            },
        )
        observer.finalize()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "execution_failed", "message": str(exc)},
        ) from exc
    else:
        observer.metric("runtime_ms", (time.time() - start_wall) * 1000)
        observer.finalize()

    duration_ms = (outcome.ended_at - outcome.started_at) * 1000
    results = [
        EngineExecutionModel(
            role=result.role,
            engine=result.engine,
            ok=result.ok,
            returncode=result.returncode,
            duration_ms=result.duration_ms,
            session_id=result.session_id,
            resume_token=result.resume_token,
            cost_usd=result.cost_usd,
            approvals_used=result.approvals_used,
            token_usage=dict(result.token_usage),
            stdout=result.stdout,
            stderr=result.stderr,
            error=result.error,
            events=[
                event if isinstance(event, dict) else {"value": event}
                for event in result.events
            ],
            metadata=dict(result.metadata),
        )
        for result in outcome.results
    ]

    return AgentExecuteResponse(
        run_id=run_id,
        mode=outcome.spec.mode,
        engines={
            "mag": outcome.spec.engine_mag,
            "sag": outcome.spec.engine_sag,
        },
        started_at=outcome.started_at,
        ended_at=outcome.ended_at,
        duration_ms=duration_ms,
        prompt=outcome.spec.prompt,
        results=results,
        errors=outcome.errors,
    )
