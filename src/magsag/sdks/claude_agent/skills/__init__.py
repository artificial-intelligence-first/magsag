"""Skill registry for Claude Agent SDK dispatch."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Mapping, MutableMapping

from magsag.sdks.claude_agent.sandbox import ClaudeSandbox

SkillCallable = Callable[["SkillContext", Mapping[str, Any]], Awaitable[Mapping[str, Any]] | Mapping[str, Any]]


@dataclass(frozen=True)
class SkillContext:
    """Context passed to each skill during execution."""

    sandbox: ClaudeSandbox
    traceparent: str
    files: list[str]
    budget_cents: int | None
    timeout_sec: int | None
    audit_tags: Dict[str, str]
    metadata: Dict[str, Any]


_REGISTRY: MutableMapping[str, SkillCallable] = {}


def register_skill(name: str) -> Callable[[SkillCallable], SkillCallable]:
    """Decorator to register a callable skill."""

    def decorator(func: SkillCallable) -> SkillCallable:
        _REGISTRY[name] = func
        return func

    return decorator


def resolve_skill(name: str) -> SkillCallable:
    """Retrieve a registered skill."""
    try:
        return _REGISTRY[name]
    except KeyError as exc:
        available = ", ".join(sorted(_REGISTRY))
        raise KeyError(f"Unknown Claude skill '{name}'. Registered skills: {available}") from exc


async def execute_skill(
    name: str,
    payload: Mapping[str, Any],
    context: SkillContext,
) -> Dict[str, Any]:
    """Execute the named skill and normalize the result."""
    skill = resolve_skill(name)
    result = skill(context, payload)
    if asyncio.iscoroutine(result):
        result = await result
    if not isinstance(result, Mapping):
        raise TypeError(f"Skill '{name}' must return a mapping")
    return dict(result)


@register_skill("system.echo")
def system_echo(context: SkillContext, payload: Mapping[str, Any]) -> Mapping[str, Any]:
    """Simple echo skill useful for smoke tests."""
    message = str(payload.get("message", ""))
    return {
        "message": message,
        "traceparent": context.traceparent,
        "files": list(context.files),
        "audit_tags": context.audit_tags,
    }


__all__ = ["SkillContext", "execute_skill", "register_skill", "resolve_skill"]
