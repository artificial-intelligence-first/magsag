"""Global settings for engine selection and runtime defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from magsag.agent.spec import EngineName, RunMode


DEFAULT_MAG_BY_MODE: dict[RunMode, EngineName] = {
    "subscription": "codex-cli",
    "api": "openai-api",
    "oss": "noop",
}

DEFAULT_SAG_BY_MODE: dict[RunMode, EngineName] = {
    "subscription": "claude-cli",
    "api": "anthropic-api",
    "oss": "noop",
}


class EngineSettings(BaseSettings):
    """Environment-driven configuration for MAG/SAG engines."""

    model_config = SettingsConfigDict(
        env_prefix="MAGSAG_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENGINE_MODE: str = Field(
        default="auto",
        description="Preferred engine mode (auto|subscription|api|oss).",
    )
    ENGINE_MAG: str | None = Field(
        default=None,
        description="Override engine for MAG role (codex-cli|openai-api|...).",
    )
    ENGINE_SAG: str | None = Field(
        default=None,
        description="Override engine for SAG role (claude-cli|anthropic-api|...).",
    )
    ENGINE_NOTES_DIR: str = Field(
        default=".magsag/sessions",
        description="Directory for storing session metadata JSON files.",
    )
    ENGINE_TIMEOUT_SEC: int = Field(
        default=1800,
        description="Default execution timeout for engine subprocesses.",
    )
    ENGINE_APPROVAL_MODE: str = Field(
        default="on-failure",
        description="Codex approval default (--ask-for-approval value).",
    )
    ENGINE_SANDBOX_MODE: str = Field(
        default="workspace-write",
        description="Codex sandbox default (--sandbox value).",
    )
    CODEX_BINARY: str = Field(
        default="codex",
        description="Codex CLI binary used for subscription mode.",
    )
    CLAUDE_BINARY: str = Field(
        default="claude",
        description="Claude Code CLI binary used for subscription mode.",
    )
    CLAUDE_ALLOWED_TOOLS: str = Field(
        default="Read,Bash,Edit",
        description="Comma-separated tool list for Claude CLI (--allowedTools).",
    )
    CLAUDE_PERMISSION_MODE: str = Field(
        default="acceptEdits",
        description="Claude CLI permission mode (--permission-mode).",
    )
    CLAUDE_PERMISSION_PROMPT_TOOL: str | None = Field(
        default=None,
        description="Claude CLI permission prompt tool for auto-approval (--permission-prompt-tool).",
    )
    OPENAI_MODEL: str = Field(
        default="o4-mini",
        description="OpenAI Responses model identifier used in API mode.",
    )
    OPENAI_TEMPERATURE: float = Field(
        default=0.3,
        description="Sampling temperature for OpenAI Responses API.",
    )
    OPENAI_MAX_OUTPUT_TOKENS: int = Field(
        default=2048,
        description="Maximum output tokens for OpenAI Responses API.",
    )
    ANTHROPIC_MODEL: str = Field(
        default="claude-3-5-sonnet-20241022",
        description="Anthropic messages model identifier used in API mode.",
    )
    ANTHROPIC_TEMPERATURE: float = Field(
        default=0.2,
        description="Sampling temperature for Anthropic API.",
    )
    ANTHROPIC_MAX_OUTPUT_TOKENS: int = Field(
        default=2048,
        description="Maximum output tokens for Anthropic API responses.",
    )

    @model_validator(mode="after")
    def validate_mode(self) -> "EngineSettings":
        """Normalize ENGINE_MODE to expected literals."""
        normalized = self.ENGINE_MODE.strip().lower()
        if normalized not in {"auto", "subscription", "api", "oss"}:
            raise ValueError(
                "MAGSAG_ENGINE_MODE must be one of auto, subscription, api, oss"
            )
        object.__setattr__(self, "ENGINE_MODE", normalized)
        return self


@dataclass(slots=True)
class ResolvedEngineConfig:
    """Resolved engine configuration after applying environment overrides."""

    mode: RunMode
    engine_mag: EngineName
    engine_sag: EngineName
    settings: EngineSettings

    @property
    def is_subscription(self) -> bool:
        return self.mode == "subscription"

    @property
    def is_api(self) -> bool:
        return self.mode == "api"


def _normalize_mode(value: str | None, settings: EngineSettings) -> RunMode:
    if value is None:
        return _resolve_mode(settings.ENGINE_MODE, settings)
    normalized = value.strip().lower()
    if normalized == "auto":
        return _resolve_mode("auto", settings)
    if normalized in {"subscription", "api", "oss"}:
        return normalized  # type: ignore[return-value]
    raise ValueError(f"Unsupported engine mode '{value}'")


def _resolve_mode(raw_mode: str, settings: EngineSettings) -> RunMode:
    if raw_mode in {"subscription", "api", "oss"}:
        return raw_mode  # type: ignore[return-value]

    # auto mode - infer from available credentials
    has_openai = bool(os.getenv("OPENAI_API_KEY"))
    has_anthropic = bool(os.getenv("ANTHROPIC_API_KEY"))

    if has_openai and has_anthropic:
        return "api"

    return "subscription"


def _normalize_engine(value: str | None, default: EngineName) -> EngineName:
    if value is None:
        return default

    normalized = value.strip().lower()
    known: tuple[EngineName, ...] = (
        "codex-cli",
        "claude-cli",
        "openai-api",
        "anthropic-api",
        "noop",
    )
    if normalized not in known:
        raise ValueError(
            f"Unknown engine '{value}'. Expected one of: {', '.join(known)}"
        )
    return normalized  # type: ignore[return-value]


@lru_cache
def get_engine_settings() -> EngineSettings:
    """Return cached engine settings."""
    return EngineSettings()


@lru_cache
def _resolve_engine_config_cached(
    mode_override: str | None,
    mag_override: str | None,
    sag_override: str | None,
) -> ResolvedEngineConfig:
    settings = get_engine_settings()
    mode = _normalize_mode(mode_override, settings)

    default_mag = DEFAULT_MAG_BY_MODE[mode]
    default_sag = DEFAULT_SAG_BY_MODE[mode]

    mag_source = mag_override if mag_override not in (None, "") else settings.ENGINE_MAG
    sag_source = sag_override if sag_override not in (None, "") else settings.ENGINE_SAG

    resolved_mag = _normalize_engine(mag_source, default_mag)
    resolved_sag = _normalize_engine(sag_source, default_sag)

    return ResolvedEngineConfig(
        mode=mode,
        engine_mag=resolved_mag,
        engine_sag=resolved_sag,
        settings=settings,
    )


def resolve_engine_config(
    *,
    mode: str | None = None,
    mag: str | None = None,
    sag: str | None = None,
) -> ResolvedEngineConfig:
    """Resolve effective engine configuration with optional overrides."""
    return _resolve_engine_config_cached(mode, mag, sag)


__all__ = [
    "EngineSettings",
    "ResolvedEngineConfig",
    "get_engine_settings",
    "resolve_engine_config",
]
