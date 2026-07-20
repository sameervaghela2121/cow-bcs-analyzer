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

    # spread between the 2 successful scores is exactly 0.5 - not critical
    # ("more than 0.5", not "0.5 or more").
    assert body["is_critical"] is False
    # nothing has been reviewed yet - every selectable flag starts at None,
    # not False, so "not yet decided" stays distinguishable from "reviewed
    # and rejected".
    assert body["is_mean_true"] is None
    assert body["is_median_true"] is None
    assert body["gemini"]["is_true"] is None
    assert body["claude"]["is_true"] is None


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

    # only 1 provider succeeded - is_critical needs at least 2 scores to
    # measure disagreement between, so it stays False by definition.
    assert body["is_critical"] is False


@pytest.mark.asyncio
async def test_is_critical_false_when_all_three_agree_closely():
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
            new=AsyncMock(return_value=fake_reply_with_score(3.0)),
        ),
    ):
        response = client.post("/api/bcs/assess", files=files)

    assert response.status_code == 200
    body = response.json()
    assert body["gemini"]["status"] == "success"
    assert body["claude"]["status"] == "success"
    assert body["openai"]["status"] == "success"

    # spread across [3.0, 3.25, 3.0] is 0.25 - well under the 0.5 threshold
    assert body["is_critical"] is False


@pytest.mark.asyncio
async def test_is_critical_true_when_providers_disagree_by_more_than_half_a_point():
    fake_bytes = b"fake-image-bytes"
    files = [("images", ("img1.jpg", fake_bytes, "image/jpeg")) for _ in range(4)]

    with (
        patch(
            "app.services.llm.gemini_provider.GeminiProvider.analyze_images",
            new=AsyncMock(return_value=fake_reply_with_score(1.0)),
        ),
        patch(
            "app.services.llm.claude_provider.ClaudeProvider.analyze_images",
            new=AsyncMock(return_value=fake_reply_with_score(1.25)),
        ),
        patch(
            "app.services.llm.openai_provider.OpenAIProvider.analyze_images",
            new=AsyncMock(return_value=fake_reply_with_score(5.0)),
        ),
    ):
        response = client.post("/api/bcs/assess", files=files)

    assert response.status_code == 200
    body = response.json()

    # spread across [1.0, 1.25, 5.0] is 4.0 - well past the 0.5 threshold
    assert body["is_critical"] is True


@pytest.mark.asyncio
async def test_is_critical_true_at_the_tightest_possible_threshold_crossing():
    """Scores only ever land on quarter-point increments, so the smallest
    spread that can exceed 0.5 is 0.75 (the next increment up) - this is
    the tightest real boundary case, tighter than the 4.0-spread test above."""
    fake_bytes = b"fake-image-bytes"
    files = [("images", ("img1.jpg", fake_bytes, "image/jpeg")) for _ in range(4)]

    with (
        patch(
            "app.services.llm.gemini_provider.GeminiProvider.analyze_images",
            new=AsyncMock(return_value=fake_reply_with_score(3.0)),
        ),
        patch(
            "app.services.llm.claude_provider.ClaudeProvider.analyze_images",
            new=AsyncMock(return_value=fake_reply_with_score(3.75)),
        ),
        patch(
            "app.services.llm.openai_provider.OpenAIProvider.analyze_images",
            new=AsyncMock(side_effect=RuntimeError("simulated quota error")),
        ),
    ):
        response = client.post("/api/bcs/assess", files=files)

    assert response.status_code == 200
    body = response.json()
    # spread is exactly 0.75 - just above the 0.5 threshold
    assert body["is_critical"] is True


@pytest.mark.asyncio
async def test_assess_bcs_skips_one_invalid_image_but_still_scores_the_rest():
    """A single image failing validation (e.g. over the size limit) must
    not block the whole request - it's dropped, and the still-valid images
    go on to be scored normally."""
    good_bytes = b"fake-image-bytes"
    too_big_bytes = b"x" * (2 * 1024 * 1024)  # 2MB - exceeds the 1MB test cap below
    files = [
        ("images", ("good1.jpg", good_bytes, "image/jpeg")),
        ("images", ("too-big.jpg", too_big_bytes, "image/jpeg")),
        ("images", ("good2.jpg", good_bytes, "image/jpeg")),
    ]

    with (
        patch("app.utils.image_utils.settings.MAX_IMAGE_SIZE_MB", 1),
        patch(
            "app.services.llm.gemini_provider.GeminiProvider.analyze_images",
            new=AsyncMock(return_value=FAKE_MODEL_JSON_REPLY),
        ) as gemini_mock,
    ):
        response = client.post("/api/bcs/assess?providers=gemini", files=files)

    assert response.status_code == 200
    assert response.json()["gemini"]["status"] == "success"
    # only the 2 valid images should have reached the provider
    assert len(gemini_mock.call_args.kwargs["images"]) == 2


@pytest.mark.asyncio
async def test_assess_bcs_422s_when_every_image_fails_validation():
    too_big_bytes = b"x" * (2 * 1024 * 1024)
    files = [("images", ("too-big.jpg", too_big_bytes, "image/jpeg"))]

    with patch("app.utils.image_utils.settings.MAX_IMAGE_SIZE_MB", 1):
        response = client.post("/api/bcs/assess", files=files)

    assert response.status_code == 422
