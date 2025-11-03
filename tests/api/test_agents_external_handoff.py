from __future__ import annotations

from typing import Any, Dict
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    from magsag.api.server import app

    return TestClient(app)


def test_external_handoff_returns_budget_and_timeout(client: TestClient) -> None:
    with patch(
        "magsag.api.routes.agents.AgentRunner.delegate_external_async",
        new_callable=AsyncMock,
    ) as mock_delegate:
        mock_delegate.return_value = {
            "status": "success",
            "target": "codex",
            "skill": "code.exec",
            "output": {"result": "ok"},
            "metadata": {"mode": "api"},
            "traceparent": "00-trace-00000000000000000000000000000000-0000000000000000-01",
            "trace_id": "trace-123",
            "span_id": "span-abc",
            "parent_span_id": None,
            "budget_cents": 900,
            "timeout_sec": 45,
        }

        response = client.post(
            "/api/v1/agents/handoff",
            json={
                "target": "codex",
                "skill_name": "code.exec",
                "payload": {"input": "print('ok')"},
                "budget_cents": 900,
                "timeout_sec": 45,
            },
        )

        assert response.status_code == 200
        body: Dict[str, Any] = response.json()
        assert body["budget_cents"] == 900
        assert body["timeout_sec"] == 45
        assert body["target"] == "codex"

        mock_delegate.assert_awaited_once()
        call = mock_delegate.await_args
        assert call is not None
        _, kwargs = call
        assert kwargs["budget_cents"] == 900
        assert kwargs["timeout_sec"] == 45


def test_external_handoff_includes_trace_fields(client: TestClient) -> None:
    with patch(
        "magsag.api.routes.agents.AgentRunner.delegate_external_async",
        new_callable=AsyncMock,
    ) as mock_delegate:
        mock_delegate.return_value = {
            "status": "success",
            "target": "claude",
            "skill": "fs.scan",
            "output": {},
            "metadata": {},
            "traceparent": "00-trace-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01",
            "trace_id": "trace-abc",
            "span_id": "span-xyz",
            "parent_span_id": "parent-123",
            "budget_cents": None,
            "timeout_sec": None,
        }

        response = client.post(
            "/api/v1/agents/handoff",
            json={
                "target": "claude",
                "skill_name": "fs.scan",
                "payload": {},
                "trace_id": "trace-abc",
            },
        )

        assert response.status_code == 200
        body: Dict[str, Any] = response.json()
        assert body["trace_id"] == "trace-abc"
        assert body["traceparent"].startswith("00-")
        assert body["span_id"] == "span-xyz"
        assert body["parent_span_id"] == "parent-123"
