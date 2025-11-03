"""SDK integration helpers for external agent dispatchers."""

from magsag.sdks.base import (
    ExternalDispatchRequest,
    ExternalDispatchResult,
    ExternalDispatcherRegistry,
    ExternalSkillDispatcher,
    TraceContext,
    build_trace_context,
    get_external_dispatcher,
    get_external_dispatcher_registry,
    list_external_dispatchers,
    register_external_dispatcher,
    unregister_external_dispatcher,
)

__all__ = [
    "ExternalDispatchRequest",
    "ExternalDispatchResult",
    "ExternalDispatcherRegistry",
    "ExternalSkillDispatcher",
    "TraceContext",
    "build_trace_context",
    "get_external_dispatcher",
    "get_external_dispatcher_registry",
    "list_external_dispatchers",
    "register_external_dispatcher",
    "unregister_external_dispatcher",
]
