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


@pytest.mark.asyncio
async def test_assess_bcs_fans_out_to_all_providers():
    fake_bytes = b"fake-image-bytes"
    files = [("images", ("img1.jpg", fake_bytes, "image/jpeg")) for _ in range(4)]

    # Patch all three providers so no real API calls happen and the test
    # verifies the fan-out behavior (every model answers independently).
    with (
        patch(
            "app.services.llm.gemini_provider.GeminiProvider.analyze_images",
            new=AsyncMock(return_value=FAKE_MODEL_JSON_REPLY),
        ),
        patch(
            "app.services.llm.claude_provider.ClaudeProvider.analyze_images",
            new=AsyncMock(return_value=FAKE_MODEL_JSON_REPLY),
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
    assert body["claude"]["final_bcs"] == 3.0
    assert body["openai"]["status"] == "error"
    assert body["openai"]["final_bcs"] is None
    assert body["openai"]["confidence"] is None
    assert "simulated quota error" in body["openai"]["error_message"]


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
