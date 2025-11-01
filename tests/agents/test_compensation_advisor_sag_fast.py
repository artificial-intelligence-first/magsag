from magsag.runners.agent_runner import AgentRunner, Delegation


def test_compensation_advisor_generates_deterministic_offer() -> None:
    runner = AgentRunner()
    delegation = Delegation(
        task_id="test-helper-001",
        sag_id="compensation-advisor-sag",
        input={
            "candidate_profile": {
                "role": "Software Engineer",
                "level": "Mid",
                "location": "Remote",
                "experience_years": 4,
            }
        },
    )

    result = runner.invoke_sag(delegation)

    assert result.status == "success"
    offer = result.output["offer"]
    assert offer["role"] == "Software Engineer"
    assert offer["base_salary"]["amount"] > 100000
    assert offer["band"]["min"] <= offer["base_salary"]["amount"] <= offer["band"]["max"]

    analysis = result.output["analysis"]
    assert analysis["transform"]["source"] == "skill.test-helper-transform"
    assert analysis["summary"]["experience_years"] == 4

    assert result.output["metadata"]["agent"] == "compensation-advisor-sag"
