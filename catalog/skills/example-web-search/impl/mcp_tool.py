"""
Example Web Search MCP Tool

Demonstrates integration with the fetch MCP server for web content retrieval.
Phase 3 removes the mock fallback so the skill now requires a configured
MCP runtime with access to the `fetch` server.

MCP Integration Pattern:
- Invokes the fetch MCP server for every request
- Surfaces MCP errors back to the caller for observability
- Demonstrates async/await patterns for MCP tool execution
- Shows proper error handling and result extraction

Note: This is a simplified example. Production implementations should:
- Use proper MCP client libraries (shown here with MCPRuntime)
- Implement robust error handling (demonstrated with try/except)
- Add caching mechanisms
- Handle more content types
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, Optional

import jsonschema
import yaml

# MCP integration imports
try:
    from magsag.mcp.runtime import MCPRuntime
except ImportError:
    # Graceful degradation if MCP runtime not available
    MCPRuntime = None  # type: ignore

logger = logging.getLogger(__name__)


def _find_repo_root(start_path: Path) -> Path:
    """
    Find repository root by looking for pyproject.toml or .git directory.

    This is more robust than using a fixed parent level, which can break
    when the skill is nested at different depths.

    Args:
        start_path: Starting path (typically __file__)

    Returns:
        Path to repository root

    Raises:
        RuntimeError: If repository root cannot be found
    """
    current = start_path.resolve()
    # Walk up the directory tree
    for parent in [current] + list(current.parents):
        # Check for repository markers
        if (parent / "pyproject.toml").exists() or (parent / ".git").exists():
            return parent
    # Fallback: assume we're in catalog/skills/<name>/impl/ and go up 4 levels
    # This works for standard skill structure: impl -> skill -> skills -> catalog -> root
    return start_path.resolve().parents[4]


ROOT = _find_repo_root(Path(__file__))
INPUT_CONTRACT = ROOT / "catalog" / "contracts" / "web_search_query.schema.json"
OUTPUT_CONTRACT = ROOT / "catalog" / "contracts" / "web_search_result.schema.json"


def _load_schema(path: Path) -> Dict[str, Any]:
    """
    Load and parse JSON Schema from a YAML or JSON file.

    Args:
        path: Path to the schema file

    Returns:
        Parsed schema as a dictionary

    Raises:
        ValueError: If the schema is not a valid JSON object
    """
    if not path.exists():
        # Return minimal schema if contract doesn't exist yet
        return {"type": "object"}

    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Schema at {path} must be a JSON object")
    return data


INPUT_SCHEMA = _load_schema(INPUT_CONTRACT)
OUTPUT_SCHEMA = _load_schema(OUTPUT_CONTRACT)


def _validate(payload: Dict[str, Any], schema: Dict[str, Any], name: str) -> None:
    """
    Validate payload against JSON Schema.

    Args:
        payload: Data to validate
        schema: JSON Schema to validate against
        name: Human-readable name for error messages

    Raises:
        ValueError: If validation fails
    """
    try:
        jsonschema.validate(payload, schema)
    except jsonschema.ValidationError as exc:
        raise ValueError(f"{name} schema validation failed: {exc.message}") from exc


def _validate_url(url: str) -> None:
    """
    Basic URL validation.

    Args:
        url: URL string to validate

    Raises:
        ValueError: If URL is invalid
    """
    if not url or not isinstance(url, str):
        raise ValueError("URL must be a non-empty string")

    if not url.startswith(("http://", "https://")):
        raise ValueError("URL must start with http:// or https://")


async def _fetch_url_via_mcp(
    url: str,
    extract_text: bool = True,
    mcp: Optional[MCPRuntime] = None,
) -> Dict[str, Any]:
    """
    Fetch URL content using the fetch MCP server.

    Attempts to use the MCP runtime if provided, otherwise falls back to mock data.
    This demonstrates the recommended pattern for MCP integration with graceful degradation.

    Args:
        url: URL to fetch
        extract_text: Whether to extract text content from HTML
        mcp: Optional MCPRuntime instance for calling the fetch server

    Returns:
        Response from MCP server or mock data

    Raises:
        RuntimeError: If MCP server call fails critically
    """
    if mcp is None:
        raise RuntimeError("example-web-search requires an MCP runtime with the 'fetch' server.")

    try:
        logger.info("Attempting to fetch %s via MCP fetch server", url)

        result = await mcp.execute_tool(
            server_id="fetch",
            tool_name="fetch",
            arguments={"url": url},
        )
    except Exception as exc:  # pragma: no cover - MCP wrapper defensive guard
        raise RuntimeError(f"MCP fetch invocation failed: {exc}") from exc

    if not result.success:
        raise RuntimeError(f"MCP fetch failed: {result.error or 'unknown error'}")

    output = result.output
    content: str
    if isinstance(output, list):
        content_chunks: list[str] = []
        for item in output:
            if isinstance(item, dict) and "text" in item:
                content_chunks.append(str(item["text"]))
            elif isinstance(item, str):
                content_chunks.append(item)
        content = "\n".join(content_chunks)
    elif isinstance(output, dict):
        content = str(output.get("content") or output.get("text") or output)
    else:
        content = str(output)

    return {
        "url": url,
        "status_code": result.metadata.get("status_code", 200),
        "content_type": result.metadata.get("content_type", "text/html"),
        "content": content,
        "title": result.metadata.get("title", ""),
    }


def _extract_text_content(html_content: str) -> str:
    """
    Extract plain text from HTML content.

    This is a simplified implementation. Production code should use
    proper HTML parsing libraries like BeautifulSoup or lxml.

    Args:
        html_content: Raw HTML content

    Returns:
        Extracted text content
    """
    # Simplified text extraction
    # In production, use BeautifulSoup or similar
    import re

    # Remove script and style elements
    text = re.sub(r"<script[^>]*>.*?</script>", "", html_content, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", "", text, flags=re.DOTALL | re.IGNORECASE)

    # Remove HTML tags
    text = re.sub(r"<[^>]+>", " ", text)

    # Clean up whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


async def run(
    payload: Dict[str, Any],
    *,
    mcp: Optional[MCPRuntime] = None,
) -> Dict[str, Any]:
    """
    Execute web search/fetch operation with MCP integration.

    This async function demonstrates the recommended pattern for MCP-enabled skills:
    - Accepts optional MCPRuntime via keyword-only parameter
    - Passes MCP runtime to underlying async functions
    - Propagates MCP errors cleanly when runtime is unavailable
    - Validates input/output contracts
    - Provides comprehensive error handling

    Args:
        payload: Input data with 'url' and optional 'extract_text' fields
        mcp: Optional MCPRuntime instance for calling MCP servers

    Returns:
        Output data with URL content and metadata

    Raises:
        ValueError: If input validation fails
        RuntimeError: If MCP runtime is unavailable or fetch fails
    """
    # Validate input
    _validate(payload, INPUT_SCHEMA, "web_search_query")

    # Extract parameters
    url = payload.get("url")
    if not url:
        raise ValueError("Missing required field: url")

    extract_text = payload.get("extract_text", True)

    # Validate URL
    _validate_url(url)

    # Fetch content via MCP
    try:
        mcp_response = await _fetch_url_via_mcp(url, extract_text, mcp=mcp)
    except Exception as exc:
        # Fallback: return error result
        logger.error(f"Fetch failed for {url}: {exc}", exc_info=True)
        return {
            "url": url,
            "success": False,
            "error": str(exc),
            "metadata": {"status_code": 0, "content_type": ""},
        }

    # Process response
    content = mcp_response.get("content", "")
    if extract_text and mcp_response.get("content_type", "").startswith("text/html"):
        content = _extract_text_content(content)

    result: Dict[str, Any] = {
        "url": url,
        "success": True,
        "title": mcp_response.get("title", ""),
        "content": content,
        "metadata": {
            "status_code": mcp_response.get("status_code", 200),
            "content_type": mcp_response.get("content_type", ""),
            "extracted_text": extract_text,
        },
    }

    # Validate output
    _validate(result, OUTPUT_SCHEMA, "web_search_result")

    return result
