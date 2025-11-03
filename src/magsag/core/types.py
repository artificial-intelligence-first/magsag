"""Core Intermediate Representation (IR) types for MAGSAG.

This module defines the foundational data structures for agent execution:
- CapabilityMatrix: Provider feature support matrix
- PolicySnapshot: Immutable policy version reference
- PlanIR: Execution plan with provider selection and configuration
- PlanStep: Individual step descriptor inside a plan
- RunIR: Complete agent run specification with tracing metadata
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class CapabilityMatrix(BaseModel):
    """Provider capability support matrix.

    Indicates which advanced features a provider implementation supports,
    enabling intelligent routing and fallback strategies.

    This model is frozen to ensure capability declarations remain consistent.
    """

    model_config = ConfigDict(frozen=True)

    tools: bool = Field(..., description="Support for function/tool calling")
    structured_output: bool = Field(..., description="Support for schema-constrained generation")
    vision: bool = Field(..., description="Support for image/visual input processing")
    audio: bool = Field(..., description="Support for audio input processing")


class PolicySnapshot(BaseModel):
    """Immutable reference to a policy configuration version.

    Captures the exact policy state at run submission time to ensure
    deterministic evaluation and audit trail consistency.
    """

    model_config = ConfigDict(frozen=True)

    id: str = Field(..., description="Unique policy identifier")
    version: str = Field(..., description="Semantic version string (e.g., '1.2.3')")
    content_hash: str = Field(
        ..., description="SHA256 hash of policy content for integrity verification"
    )


class PlanIR(BaseModel):
    """Execution plan intermediate representation.

    Describes how an agent run should be executed, including ordered steps,
    dependencies, budget constraints, and routing metadata.
    """

    model_config = ConfigDict(frozen=True)

    plan_id: str = Field(..., description="Unique identifier for this execution plan")
    version: str = Field(
        default="1.0.0", description="Semantic version of the PlanIR schema"
    )
    goal: str = Field(..., description="High-level goal this plan intends to achieve")
    constraints: list[str] = Field(
        default_factory=list, description="Explicit constraints to respect"
    )
    steps: list["PlanStep"] = Field(
        ..., description="Ordered collection of execution steps"
    )
    stop_conditions: list[str] = Field(
        default_factory=list, description="Conditions signalling plan termination"
    )
    trace_group_id: str | None = Field(
        default=None,
        description="Correlated trace group identifier shared across handoffs",
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Arbitrary metadata preserved for auditing and orchestration hints",
    )


class PlanStep(BaseModel):
    """Single execution step within a PlanIR."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(..., description="Step identifier unique within the plan")
    role: Literal["MAG", "SAG"] = Field(
        ..., description="Executing role for this step (MAG or SAG)"
    )
    description: str = Field(
        ..., description="Concise human-readable description of the step"
    )
    skill: str | None = Field(
        default=None,
        description="Optional skill or handler identifier responsible for the work",
    )
    inputs: dict[str, Any] = Field(
        default_factory=dict,
        description="Input payload or configuration for the step executor",
    )
    outputs: dict[str, Any] = Field(
        default_factory=dict,
        description="Expected output schema fragments or placeholders",
    )
    depends_on: list[str] = Field(
        default_factory=list,
        description="Identifiers of prerequisite steps that must complete first",
    )
    retry_policy: dict[str, Any] = Field(
        default_factory=dict,
        description="Retry configuration (e.g., max_retries, backoff, retry_on)",
    )
    timeout_sec: int | None = Field(
        default=None, description="Optional timeout budget for this step in seconds"
    )
    budget_cents: int | None = Field(
        default=None, description="Optional monetary budget reserved for this step"
    )
    capabilities_required: list[str] = Field(
        default_factory=list,
        description="Declared capabilities required by the executor (e.g., fs, cli)",
    )
    audit_tags: dict[str, str] = Field(
        default_factory=dict,
        description="Key-value tags for compliance and audit trails",
    )


class RunIR(BaseModel):
    """Complete agent run specification intermediate representation.

    Encapsulates all information needed to execute and trace an agent run,
    including input, execution plan, policy context, and observability metadata.

    This model is frozen to ensure audit trail integrity - once a run specification
    is created, it cannot be modified.
    """

    model_config = ConfigDict(frozen=True)

    run_id: str = Field(..., description="Unique run identifier (UUID)")
    agent: str = Field(..., description="Agent slug/identifier")
    input: dict[str, Any] = Field(..., description="Agent input payload")
    plan: PlanIR | None = Field(
        default=None, description="Execution plan (None if routing deferred)"
    )
    policy: PolicySnapshot = Field(
        ..., description="Immutable policy snapshot for this run"
    )
    capabilities: CapabilityMatrix = Field(
        ..., description="Required capabilities for this run"
    )
    idempotency_key: str | None = Field(
        default=None,
        description="Optional key for idempotent run deduplication",
    )
    trace_id: str = Field(
        ..., description="Distributed tracing identifier for observability"
    )
