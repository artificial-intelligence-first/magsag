from __future__ import annotations

import pytest

pytest.importorskip("mcp", reason="MCP SDK not installed")

from magsag.mcp.config import MCPServerConfig, TransportDefinition
from magsag.mcp.doctor import ProbeResult, diagnose


@pytest.mark.asyncio
async def test_diagnose_uses_first_reachable_transport(monkeypatch: pytest.MonkeyPatch) -> None:
    transport = TransportDefinition(type="http", url="https://example.com")
    config = MCPServerConfig(server_id="notion", transport=transport)

    async def fake_probe(cfg: MCPServerConfig, transport_def: TransportDefinition) -> ProbeResult:
        return ProbeResult(
            transport=transport_def,
            status="reachable",
            message=None,
            tool_names=["retrieve_page"],
            session_id="session-123",
            protocol_version="1.0",
            http_status=200,
    )

    monkeypatch.setattr("magsag.mcp.doctor.probe_transport", fake_probe)
    monkeypatch.setattr("magsag.mcp.doctor.HAS_MCP_SDK", True)

    report = await diagnose(config)

    assert report.status == "reachable"
    assert report.probes[0].tool_names == ["retrieve_page"]
