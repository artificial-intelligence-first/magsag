"""Deterministic CompensationAdvisorSAG used by the test harness."""

from __future__ import annotations

from typing import Any, Dict, List


async def run(payload: Dict[str, Any], *, skills=None, obs=None) -> Dict[str, Any]:
    """Generate a deterministic compensation offer with lightweight analytics."""
    profile = payload.get("candidate_profile")
    if not isinstance(profile, dict):
        profile = payload

    role = str(profile.get("role", "Engineer"))
    level = str(profile.get("level", "")).strip() or "Mid"
    location = str(profile.get("location", "Remote"))
    experience_years = int(profile.get("experience_years", 0) or 0)

    level_key = level.lower()
    level_bases = {
        "junior": 90000,
        "mid": 120000,
        "senior": 150000,
        "staff": 190000,
        "principal": 220000,
    }
    base_salary = level_bases.get(level_key, 110000)

    # Experience contributes linearly.
    base_salary += experience_years * 3000

    # Location adjustments.
    location_lower = location.lower()
    if "san francisco" in location_lower:
        base_salary += 20000
    elif "new york" in location_lower:
        base_salary += 15000
    elif "austin" in location_lower:
        base_salary += 7000
    elif "remote" in location_lower:
        base_salary -= 5000

    sign_on_map = {
        "junior": 5000,
        "mid": 10000,
        "senior": 20000,
        "staff": 30000,
        "principal": 50000,
    }
    sign_on_bonus = sign_on_map.get(level_key, 10000)

    band_min = max(60000, int(base_salary * 0.9))
    band_max = int(base_salary * 1.1)

    numbers_for_skill: List[int] = [
        experience_years,
        base_salary // 1000,
        len(level),
    ]

    if obs:
        obs.log(
            "sag.start",
            {
                "agent": "compensation-advisor-sag",
                "level": level,
                "experience_years": experience_years,
            },
        )

    transform_result: Dict[str, Any] = {
        "upper_text": role.upper(),
        "value_squared": experience_years * experience_years,
        "numbers_doubled": [n * 2 for n in numbers_for_skill],
        "numbers_total": sum(numbers_for_skill),
        "source": "fallback",
    }

    if skills and skills.exists("skill.test-helper-transform"):
        try:
            transform_result = await skills.invoke_async(
                "skill.test-helper-transform",
                {"text": role, "value": experience_years, "numbers": numbers_for_skill},
            )
            if obs:
                obs.log(
                    "skill_invoked",
                    {
                        "skill": "skill.test-helper-transform",
                        "numbers_total": transform_result.get("numbers_total", 0),
                    },
                )
        except Exception as exc:  # pragma: no cover - defensive fallback
            if obs:
                obs.log("sag.skill_error", {"error": str(exc)})

    if obs:
        obs.metric("base_salary", base_salary)
        obs.log("sag.end", {"agent": "compensation-advisor-sag", "status": "success"})

    offer = {
        "role": role,
        "level": level,
        "experience_years": experience_years,
        "location": location,
        "base_salary": {"currency": "USD", "amount": int(base_salary)},
        "band": {"currency": "USD", "min": band_min, "max": band_max},
        "sign_on_bonus": {"currency": "USD", "amount": sign_on_bonus},
        "notes": f"Deterministic offer generated for {role} ({level}).",
    }

    analysis = {
        "transform": transform_result,
        "summary": {
            "level": level,
            "location": location,
            "experience_years": experience_years,
            "base_salary": int(base_salary),
            "numbers_total": transform_result.get("numbers_total", sum(numbers_for_skill)),
        },
    }

    return {
        "offer": offer,
        "analysis": analysis,
        "metadata": {
            "agent": "compensation-advisor-sag",
            "observability_enabled": bool(obs),
        },
    }
