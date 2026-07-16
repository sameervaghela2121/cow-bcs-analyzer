"""
Run with: pytest -q
Mocks the LLM providers, the Mongo lookup, and the image download so tests
never hit real APIs, a real database, or the network.
"""
from unittest.mock import AsyncMock, patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.main import app
from app.services.llm.base import ImagePayload

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

FAKE_ANALYSIS_ID = str(ObjectId())
FAKE_IMAGE_URLS = [f"https://cdn.example.com/cow-9999/photo-{i}.jpg" for i in range(4)]


def fake_analysis_doc(image_urls=FAKE_IMAGE_URLS):
    return {"_id": ObjectId(FAKE_ANALYSIS_ID), "cow_images": image_urls}


def fake_download(url: str, label: str | None = None) -> ImagePayload:
    return ImagePayload(bytes_data=b"fake-image-bytes", mime_type="image/jpeg", label=label)


@pytest.mark.asyncio
async def test_assess_bcs_fans_out_to_all_providers():
    with (
        patch(
            "app.api.endpoints.bcs.get_cow_bcs_analysis",
            new=AsyncMock(return_value=fake_analysis_doc()),
        ),
        patch(
            "app.api.endpoints.bcs.download_and_validate_image",
            new=AsyncMock(side_effect=fake_download),
        ),
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
        patch(
            "app.services.bcs_service.save_assessment",
            new=AsyncMock(return_value=None),
        ),
    ):
        response = client.post(f"/api/bcs/assess/{FAKE_ANALYSIS_ID}")

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
async def test_assess_bcs_sends_every_cow_image_in_a_single_call():
    """All images for the cow must go to each provider in one shared call,
    not one call per image."""
    with (
        patch(
            "app.api.endpoints.bcs.get_cow_bcs_analysis",
            new=AsyncMock(return_value=fake_analysis_doc()),
        ),
        patch(
            "app.api.endpoints.bcs.download_and_validate_image",
            new=AsyncMock(side_effect=fake_download),
        ),
        patch(
            "app.services.llm.gemini_provider.GeminiProvider.analyze_images",
            new=AsyncMock(return_value=FAKE_MODEL_JSON_REPLY),
        ) as gemini_mock,
        patch(
            "app.services.bcs_service.save_assessment",
            new=AsyncMock(return_value=None),
        ),
    ):
        response = client.post(f"/api/bcs/assess/{FAKE_ANALYSIS_ID}?providers=gemini")

    assert response.status_code == 200
    gemini_mock.assert_called_once()
    assert len(gemini_mock.call_args.kwargs["images"]) == len(FAKE_IMAGE_URLS)


@pytest.mark.asyncio
async def test_assess_bcs_downloads_each_image_exactly_once_no_matter_how_many_providers():
    """Fanning out to all 3 providers must not re-download images per
    provider - each cow_images URL is fetched once, total, and the same
    in-memory bytes are reused for every provider call."""
    with (
        patch(
            "app.api.endpoints.bcs.get_cow_bcs_analysis",
            new=AsyncMock(return_value=fake_analysis_doc()),
        ),
        patch(
            "app.api.endpoints.bcs.download_and_validate_image",
            new=AsyncMock(side_effect=fake_download),
        ) as download_mock,
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
            new=AsyncMock(return_value=FAKE_MODEL_JSON_REPLY),
        ),
        patch(
            "app.services.bcs_service.save_assessment",
            new=AsyncMock(return_value=None),
        ),
    ):
        # No ?providers filter - fans out to all 3 configured providers.
        response = client.post(f"/api/bcs/assess/{FAKE_ANALYSIS_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["gemini"]["status"] == "success"
    assert body["claude"]["status"] == "success"
    assert body["openai"]["status"] == "success"

    # 4 images, 3 providers - if downloads happened per-provider this would
    # be 12. It must be exactly 4: one download per URL, total.
    assert download_mock.call_count == len(FAKE_IMAGE_URLS)
    downloaded_urls = sorted(call.args[0] for call in download_mock.call_args_list)
    assert downloaded_urls == sorted(FAKE_IMAGE_URLS)


@pytest.mark.asyncio
async def test_assess_bcs_can_be_narrowed_to_a_subset():
    with (
        patch(
            "app.api.endpoints.bcs.get_cow_bcs_analysis",
            new=AsyncMock(return_value=fake_analysis_doc()),
        ),
        patch(
            "app.api.endpoints.bcs.download_and_validate_image",
            new=AsyncMock(side_effect=fake_download),
        ),
        patch(
            "app.services.llm.gemini_provider.GeminiProvider.analyze_images",
            new=AsyncMock(return_value=FAKE_MODEL_JSON_REPLY),
        ),
        patch(
            "app.services.bcs_service.save_assessment",
            new=AsyncMock(return_value=None),
        ),
    ):
        response = client.post(f"/api/bcs/assess/{FAKE_ANALYSIS_ID}?providers=gemini")

    assert response.status_code == 200
    body = response.json()
    assert body["gemini"]["status"] == "success"
    assert body["gemini"]["final_bcs"] == 3.0
    # claude and openai were not queried - should have default values
    assert body["claude"]["final_bcs"] is None
    assert body["claude"]["confidence"] is None
    assert body["openai"]["final_bcs"] is None
    assert body["openai"]["confidence"] is None


@pytest.mark.asyncio
async def test_assess_bcs_404s_when_analysis_id_does_not_resolve():
    with patch(
        "app.api.endpoints.bcs.get_cow_bcs_analysis",
        new=AsyncMock(return_value=None),
    ):
        response = client.post(f"/api/bcs/assess/{FAKE_ANALYSIS_ID}")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_assess_bcs_422s_when_analysis_has_no_cow_images():
    with patch(
        "app.api.endpoints.bcs.get_cow_bcs_analysis",
        new=AsyncMock(return_value=fake_analysis_doc(image_urls=[])),
    ):
        response = client.post(f"/api/bcs/assess/{FAKE_ANALYSIS_ID}")

    assert response.status_code == 422
