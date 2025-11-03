from magsag.sdks.google_adk import (
    ADKRegistry,
    ADKServer,
    ADKSource,
    ADKTool,
    ADKSyncError,
    GeneratedArtifact,
    filter_tools,
    render_catalog_tools,
    render_mcp_server,
    sync_adk_catalog,
)


def test_google_adk_package_exports() -> None:
    # Smoke-test that package provides expected symbols
    assert ADKRegistry is not None
    assert ADKServer is not None
    assert ADKSource is not None
    assert ADKTool is not None
    assert ADKSyncError is not None
    assert GeneratedArtifact is not None
    assert callable(filter_tools)
    assert callable(sync_adk_catalog)
    assert callable(render_catalog_tools)
    assert callable(render_mcp_server)
