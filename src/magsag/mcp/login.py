"""Login helpers for MCP providers."""

from __future__ import annotations

import os
import webbrowser
from dataclasses import dataclass


@dataclass(slots=True)
class LoginPlan:
    """Represents the recommended login flow for a provider."""

    provider: str
    summary: str
    steps: list[str]
    browser_url: str | None = None


OAUTH_URLS = {
    "notion": "https://mcp.notion.com/oauth/start",
    "supabase": "https://mcp.supabase.com/oauth/start",
}


def build_login_plan(provider: str) -> LoginPlan:
    normalized = provider.strip().lower()

    if normalized == "notion":
        return LoginPlan(
            provider=normalized,
            summary="Authenticate with Notion MCP via browser OAuth.",
            steps=[
                "Launch the Notion MCP OAuth flow in your default browser.",
                "Sign in with the workspace that grants read access to pages and databases.",
                "Copy the issued token into your secret store (OS keychain preferred).",
                "Export the token to the shell as NOTION_MCP_TOKEN before running agents.",
            ],
            browser_url=OAUTH_URLS[normalized],
        )

    if normalized == "supabase":
        return LoginPlan(
            provider=normalized,
            summary="Authenticate Supabase MCP via browser OAuth (PAT for CI only).",
            steps=[
                "Complete the Supabase MCP OAuth flow to authorize your dev project.",
                "Review the generated access token and store it securely (keychain preferred).",
                "Set MAGSAG_MCP_SUPABASE_ACCESS_TOKEN and optional project ref in your environment.",
                "In CI, supply a project-scoped PAT instead of interactive OAuth.",
            ],
            browser_url=OAUTH_URLS[normalized],
        )

    if normalized == "github":
        return LoginPlan(
            provider=normalized,
            summary="Authenticate GitHub MCP via OAuth or a least-privilege PAT.",
            steps=[
                "Preferred: run 'gh auth login --scopes read:org,repo' to authorize with GitHub Copilot.",
                "Alternatively generate a PAT with read-only scopes and store it in your keychain.",
                "Export the credential as MAGSAG_MCP_GITHUB_PAT only in non-interactive environments.",
                "Ensure your GitHub account has an active Copilot license for MCP tooling.",
            ],
            browser_url=OAUTH_URLS.get(normalized),
        )

    if normalized == "obsidian":
        return LoginPlan(
            provider=normalized,
            summary="Configure the Obsidian Local REST API plugin for MCP.",
            steps=[
                "Install and enable the Obsidian Local REST API community plugin.",
                "Generate an API key in Obsidian and copy it to your keychain.",
                "Expose OBSIDIAN_API_KEY, OBSIDIAN_HOST, and OBSIDIAN_PORT before running agents.",
                "Restrict vault access to read/write operations; destructive tools remain denied by policy.",
            ],
        )

    raise ValueError(f"Unsupported MCP provider: {provider}")


def launch_login_flow(plan: LoginPlan, open_browser: bool = True) -> None:
    """Launch browser-based login when applicable."""

    if not open_browser or not plan.browser_url:
        return

    # Avoid launching browsers in certain CI environments.
    if os.getenv("CI"):
        return

    try:
        webbrowser.open(plan.browser_url, new=2, autoraise=True)
    except webbrowser.Error:
        # Non-fatal; caller already has the URL in the plan.
        return
