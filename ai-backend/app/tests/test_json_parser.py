import json

import pytest

from app.core.exceptions import LLMProviderError
from app.utils.json_parser import extract_json_block


def _assessment(**overrides):
    body = {
        "landmarks": [
            {"name": "hooks", "x": 640, "y": 260, "bin": "HOOKS_DEFINED_SMOOTH",
             "anchor": 3.0, "weight": 0.2},
            {"name": "brisket", "x": 120, "y": 700, "bin": "BRISKET_MODERATE",
             "anchor": 3.0, "weight": 0.06},
        ],
        "visible_weight": 0.26,
        "weighted_sum": 0.78,
        "recommendation": "Cow is in moderate condition.",
        "final_bcs": 3.0,
        "confidence": "High",
    }
    body.update(overrides)
    return body


def test_bare_json_returns_outer_object_not_trailing_landmark():
    """Gemini/OpenAI structured output returns bare JSON whose LAST brace opens a
    nested landmark. The parser must return the outer object."""
    raw = json.dumps(_assessment())
    assert extract_json_block(raw)["recommendation"] == "Cow is in moderate condition."


def test_bare_json_wrapped_in_assessments():
    raw = json.dumps({"assessments": [_assessment()]})
    parsed = extract_json_block(raw)
    assert parsed["assessments"][0]["final_bcs"] == 3.0


def test_fenced_json_with_nested_landmarks():
    raw = (
        "Landmark table\n\nhooks — rounded.\n\n"
        "FINAL BCS: 3.00 / 5 (Confidence: High)\n\n"
        "```json\n" + json.dumps({"assessments": [_assessment()]}) + "\n```"
    )
    assert extract_json_block(raw)["assessments"][0]["confidence"] == "High"


def test_narrative_braces_before_json_are_skipped():
    raw = (
        "The hollow reads as {deep} on the left side.\n"
        + json.dumps(_assessment())
    )
    assert extract_json_block(raw)["final_bcs"] == 3.0


def test_no_json_raises():
    with pytest.raises(LLMProviderError):
        extract_json_block("FINAL BCS: 3.00 / 5 — no JSON here at all.")
