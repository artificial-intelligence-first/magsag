"""
Doc generation skill.

Constructs an offer packet from a candidate profile and optional compensation
context with JSON Schema validation. This Phase 2 implementation already uses
the async skill signature and accepts an optional MCP runtime, but it currently
relies on local data transformation only.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import jsonschema
import yaml

from magsag.mcp import MCPRuntime

TEMPLATE_QUERY = """
SELECT
    summary_template,
    talking_points_template,
    default_warnings,
    provenance_inputs,
    provenance_schemas
FROM offer_templates
WHERE slug = $1 OR slug = 'default'
ORDER BY CASE WHEN slug = $1 THEN 0 ELSE 1 END
LIMIT 1
"""

ROOT = Path(__file__).resolve().parents[4]  # Point to repo root
INPUT_CONTRACT = ROOT / "catalog" / "contracts" / "candidate_profile.schema.json"
OUTPUT_CONTRACT = ROOT / "catalog" / "contracts" / "offer_packet.schema.json"


def _load_schema(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Schema at {path} must be a JSON object")
    return data


def _relative_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:  # pragma: no cover - defensive
        return str(path)


INPUT_SCHEMA = _load_schema(INPUT_CONTRACT)
OUTPUT_SCHEMA = _load_schema(OUTPUT_CONTRACT)


def _validate(payload: dict[str, Any], schema: dict[str, Any], name: str) -> None:
    try:
        jsonschema.validate(payload, schema)
    except jsonschema.ValidationError as exc:  # pragma: no cover - defensive
        raise ValueError(f"{name} schema validation failed: {exc.message}") from exc


def _normalized_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    identifier = str(payload.get("id", "")).strip()
    if not identifier:
        raise ValueError("Candidate profile requires an 'id' field")

    candidate = {
        "id": identifier,
        "name": payload.get("name") or "Unknown Candidate",
        "role": payload.get("role") or payload.get("title") or "Unknown Role",
        "level": payload.get("level") or payload.get("seniority"),
        "location": payload.get("location"),
    }
    return candidate


def _compensation_section(payload: dict[str, Any]) -> dict[str, Any]:
    raw_band = payload.get("salary_band")
    band = raw_band if isinstance(raw_band, dict) else {}
    base = payload.get("base_salary") or band.get("base") or band.get("min")
    maximum = payload.get("max_salary") or band.get("max")
    currency = band.get("currency") or "USD"
    components: dict[str, Any] = {}
    if base is not None:
        components["base"] = {"amount": base, "currency": currency}
    if maximum is not None:
        components["ceiling"] = {"amount": maximum, "currency": currency}

    variable = payload.get("variable_comp")
    if variable:
        components["variable"] = variable

    equity = payload.get("equity")
    if equity:
        components["equity"] = equity

    recommendation = payload.get("compensation_recommendation")
    if recommendation:
        components["recommendation"] = recommendation

    source = payload.get("salary_band_source") or band.get("source")
    return {
        "components": components,
        "source": source,
    }


def _build_narrative(candidate: dict[str, Any], compensation: dict[str, Any]) -> dict[str, str]:
    name = candidate.get("name") or candidate["id"]
    role = candidate.get("role") or "the target role"
    base_component = compensation["components"].get("base")
    if base_component:
        comp_phrase = f"a base salary of {base_component['amount']} {base_component['currency']}"
    else:
        comp_phrase = "a competitive base salary aligned with market data"

    highlights = [
        f"Recommend {comp_phrase} for {name} ({role}).",
        "Total compensation aligns with market benchmarks and advisor guidance.",
    ]

    if compensation.get("source"):
        highlights.append(f"Compensation source: {compensation['source']}.")

    return {
        "summary": " ".join(highlights),
        "talking_points": "\n".join(highlights),
    }


def _collect_warnings(payload: dict[str, Any], compensation: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    if not compensation["components"]:
        warnings.append("Salary band information is missing; confirm compensation details.")
    if payload.get("advisor_notes") is None:
        warnings.append("Advisor notes not supplied.")
    if payload.get("salary_band") is None:
        warnings.append("Salary band lookup result not attached.")
    return warnings


def _template_slug(candidate: dict[str, Any]) -> str:
    role = (candidate.get("role") or "").strip().lower() or "unknown-role"
    level = (candidate.get("level") or "").strip().lower() or "unknown-level"
    return f"{role}:{level}"


def _render_template(template: str, context: dict[str, Any]) -> str:
    class _Safe(dict):
        def __missing__(self, key: str) -> str:  # pragma: no cover - defensive
            return f"{{{key}}}"

    return template.format_map(_Safe(context))


async def _load_offer_template(slug: str, mcp: MCPRuntime) -> dict[str, Any]:
    result = await mcp.query_postgres(
        server_id="pg-readonly",
        sql=TEMPLATE_QUERY,
        params=[slug],
    )

    if not result.success:
        raise RuntimeError(f"Failed to load offer template via MCP: {result.error}")

    rows = (result.output or {}).get("rows", []) if isinstance(result.output, dict) else []
    if not rows:
        raise RuntimeError(f"No offer template found for slug '{slug}' (including default).")

    template_row = rows[0]
    summary_template = template_row.get("summary_template")
    talking_points_template = template_row.get("talking_points_template")
    default_warnings = template_row.get("default_warnings") or []

    if not isinstance(summary_template, str) or not summary_template.strip():
        raise RuntimeError(
            f"Offer template '{slug}' is missing a summary_template string in the database."
        )

    if isinstance(talking_points_template, str):
        talking_points = [line.strip() for line in talking_points_template.split("\n") if line.strip()]
    elif isinstance(talking_points_template, list):
        talking_points = [str(item) for item in talking_points_template]
    else:
        talking_points = []

    if not isinstance(default_warnings, list):
        default_warnings = [str(default_warnings)]

    provenance_inputs = template_row.get("provenance_inputs") or []
    if not isinstance(provenance_inputs, list):
        provenance_inputs = [str(provenance_inputs)]

    provenance_schemas = template_row.get("provenance_schemas") or {}
    if not isinstance(provenance_schemas, dict):
        provenance_schemas = {}

    return {
        "summary_template": summary_template,
        "talking_points": talking_points,
        "default_warnings": [str(item) for item in default_warnings],
        "provenance_inputs": [str(item) for item in provenance_inputs],
        "provenance_schemas": provenance_schemas,
    }


async def run(
    payload: dict[str, Any],
    *,
    mcp: Optional[MCPRuntime] = None,
) -> dict[str, Any]:
    """
    Generate a structured offer packet from a candidate profile.

    CURRENT IMPLEMENTATION: Pure local data transformation with optional MCP runtime
    parameter (unused). Future phases may leverage MCP for template retrieval.

    Args:
        payload: Candidate profile data matching the candidate_profile contract.
        mcp: Optional MCP runtime. Required for Phase 3 to load governed templates.

    Returns:
        Offer packet payload satisfying the offer_packet contract.

    NOTE: Offer templates and baseline warnings are stored in the governed
    PostgreSQL catalog. Missing MCP runtime now results in a runtime error.
    """
    _validate(payload, INPUT_SCHEMA, "candidate_profile")

    if mcp is None:
        raise RuntimeError(
            "doc-gen requires an MCP runtime with access to the 'pg-readonly' server."
        )

    candidate = _normalized_candidate(payload)
    compensation = _compensation_section(payload)
    template_slug = payload.get("template_slug") or _template_slug(candidate)
    offer_template = await _load_offer_template(template_slug, mcp)

    base_component = compensation["components"].get("base", {})
    base_phrase = "market-aligned base salary"
    base_amount = base_component.get("amount")
    base_currency = base_component.get("currency", "USD")
    if base_amount is not None:
        base_phrase = f"{base_amount} {base_currency}"

    context = {
        "candidate_name": candidate.get("name") or candidate["id"],
        "candidate_role": candidate.get("role") or "Unknown Role",
        "candidate_level": candidate.get("level") or "Unknown Level",
        "location": candidate.get("location") or "Unknown Location",
        "base_salary_amount": base_amount if base_amount is not None else "",
        "base_salary_currency": base_currency,
        "base_salary_phrase": base_phrase,
        "base_salary": base_amount if base_amount is not None else base_phrase,
        "advisor_notes": payload.get("advisor_notes", ""),
    }

    narrative = {
        "summary": _render_template(offer_template["summary_template"], context),
        "talking_points": "\n".join(
            [_render_template(point, context) for point in offer_template["talking_points"]]
        )
        or _build_narrative(candidate, compensation)["talking_points"],
    }

    warnings = list(
        dict.fromkeys(offer_template["default_warnings"] + _collect_warnings(payload, compensation))
    )

    offer_id = payload.get("offer_id") or f"offer-{candidate['id']}"

    salary_band_payload = payload.get("salary_band") or {}
    band_currency = salary_band_payload.get("currency") or base_currency
    band_min = (
        salary_band_payload.get("min")
        or salary_band_payload.get("base")
        or base_amount
        or 0
    )
    band_max = salary_band_payload.get("max") or salary_band_payload.get("ceiling") or band_min

    offer_block: dict[str, Any] = {
        "role": candidate.get("role") or "Unknown Role",
        "base_salary": {
            "currency": base_currency,
            "amount": float(base_amount) if base_amount is not None else float(band_min),
        },
        "band": {
            "currency": band_currency,
            "min": float(band_min),
            "max": float(band_max if band_max is not None else band_min),
        },
    }

    resolved_band_source = compensation.get("source") or salary_band_payload.get("source")
    if resolved_band_source:
        offer_block["band"]["source"] = resolved_band_source

    sign_on_bonus = payload.get("sign_on_bonus")
    if isinstance(sign_on_bonus, dict):
        offer_block["sign_on_bonus"] = sign_on_bonus

    equity = payload.get("equity")
    if isinstance(equity, dict):
        offer_block["equity"] = equity

    provenance_schemas = (
        {**offer_template["provenance_schemas"]}
        if offer_template["provenance_schemas"]
        else {}
    )
    provenance_schemas.setdefault("input", _relative_path(INPUT_CONTRACT))
    provenance_schemas.setdefault("output", _relative_path(OUTPUT_CONTRACT))

    timestamp = datetime.now(timezone.utc).isoformat()

    result: dict[str, Any] = {
        "offer_id": str(offer_id),
        "generated_at": timestamp,
        "offer": offer_block,
        "candidate": candidate,
        "compensation": compensation,
        "narrative": narrative,
        "warnings": warnings,
        "provenance": {
            "schemas": provenance_schemas,
            "inputs": offer_template["provenance_inputs"] or ["candidate_profile"],
        },
        "metadata": {
            "generated_by": "skill.doc-gen",
            "timestamp": timestamp,
            "version": "0.1.0",
        },
    }

    _validate(result, OUTPUT_SCHEMA, "offer_packet")
    return result
