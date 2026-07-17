"""
Example test skeleton. Run with: pytest -q
Mock the LLM provider so tests don't hit real APIs / cost tokens.
"""
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

FAKE_MODEL_JSON_REPLY = """
Hooks: sharp and angular.
Pins: prominent.
Tailhead: deep hollow, ligament cords visible.
Ribs: not visible, smooth cover.
Spine: smooth ridge, no sharp vertebrae.

Caveats: cow standing square, good lighting, all 4 angles provided.

Recommendation: within healthy range, no action needed.

FINAL BCS: 3.00 / 5 (Confidence: High)

```json
{
  "assessments": [
    {
      "recommendation": "within healthy range, no action needed",
      "final_bcs": 3.0,
      "confidence": "High"
    }
  ]
}
```
"""


def fake_reply_with_score(score: float) -> str:
    return f"""
FINAL BCS: {score:.2f} / 5 (Confidence: High)

```json
{{
  "assessments": [
    {{
      "recommendation": "within healthy range, no action needed",
      "final_bcs": {score},
      "confidence": "High"
    }}
  ]
}}
```
"""


@pytest.mark.asyncio
async def test_assess_bcs_fans_out_to_all_providers():
    fake_bytes = b"fake-image-bytes"
    files = [("images", ("img1.jpg", fake_bytes, "image/jpeg")) for _ in range(4)]

    # Patch all three providers so no real API calls happen and the test
    # verifies the fan-out behavior (every model answers independently).
    # gemini and claude disagree slightly (3.0 vs 3.5) so the mean below
    # actually exercises averaging, not just echoing a single value.
    with (
        patch(
            "app.services.llm.gemini_provider.GeminiProvider.analyze_images",
            new=AsyncMock(return_value=FAKE_MODEL_JSON_REPLY),
        ),
        patch(
            "app.services.llm.claude_provider.ClaudeProvider.analyze_images",
            new=AsyncMock(return_value=fake_reply_with_score(3.5)),
        ),
        patch(
            "app.services.llm.openai_provider.OpenAIProvider.analyze_images",
            new=AsyncMock(side_effect=RuntimeError("simulated quota error")),
        ),
    ):
        response = client.post("/api/bcs/assess", files=files)

    assert response.status_code == 200
    body = response.json()

    # gemini + claude succeeded, openai failed - each provider is a top-level key
    assert body["gemini"]["status"] == "success"
    assert body["gemini"]["final_bcs"] == 3.0
    assert body["claude"]["status"] == "success"
    assert body["claude"]["final_bcs"] == 3.5
    assert body["openai"]["status"] == "error"
    assert body["openai"]["final_bcs"] is None
    assert body["openai"]["confidence"] is None
    assert "simulated quota error" in body["openai"]["error_message"]

    # mean of the 2 providers that actually succeeded: (3.0 + 3.5) / 2 = 3.25
    assert body["mean_bcs_score"] == 3.25


@pytest.mark.asyncio
async def test_assess_bcs_can_be_narrowed_to_a_subset():
    fake_bytes = b"fake-image-bytes"
    files = [("images", ("img1.jpg", fake_bytes, "image/jpeg")) for _ in range(4)]

    with (
        patch(
            "app.services.llm.gemini_provider.GeminiProvider.analyze_images",
            new=AsyncMock(return_value=FAKE_MODEL_JSON_REPLY),
        ),
    ):
        response = client.post("/api/bcs/assess?providers=gemini", files=files)

    assert response.status_code == 200
    body = response.json()
    assert body["gemini"]["status"] == "success"
    assert body["gemini"]["final_bcs"] == 3.0
    # claude and openai were not queried - should have default values
    assert body["claude"]["final_bcs"] is None
    assert body["claude"]["confidence"] is None
    assert body["openai"]["final_bcs"] is None
    assert body["openai"]["confidence"] is None

    # only 1 provider was queried and it succeeded - mean is just its score,
    # and claude/openai's default status="success" (despite never being
    # queried) must NOT sneak into the divisor.
    assert body["mean_bcs_score"] == 3.0


@pytest.mark.asyncio
async def test_assess_bcs_mean_divides_by_all_three_when_all_three_succeed():
    fake_bytes = b"fake-image-bytes"
    files = [("images", ("img1.jpg", fake_bytes, "image/jpeg")) for _ in range(4)]

    with (
        patch(
            "app.services.llm.gemini_provider.GeminiProvider.analyze_images",
            new=AsyncMock(return_value=fake_reply_with_score(3.0)),
        ),
        patch(
            "app.services.llm.claude_provider.ClaudeProvider.analyze_images",
            new=AsyncMock(return_value=fake_reply_with_score(3.25)),
        ),
        patch(
            "app.services.llm.openai_provider.OpenAIProvider.analyze_images",
            new=AsyncMock(return_value=fake_reply_with_score(3.75)),
        ),
    ):
        response = client.post("/api/bcs/assess", files=files)

    assert response.status_code == 200
    body = response.json()
    assert body["gemini"]["status"] == "success"
    assert body["claude"]["status"] == "success"
    assert body["openai"]["status"] == "success"

    # (3.0 + 3.25 + 3.75) / 3 = 3.3333... -> rounded to the nearest 0.25 = 3.25
    assert body["mean_bcs_score"] == 3.25
