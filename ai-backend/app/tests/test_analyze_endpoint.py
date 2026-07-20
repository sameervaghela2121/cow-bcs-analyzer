"""
Tests for POST /api/bcs/analyze/{bcs_analysis_id}. Mongo and GCS are both
mocked out - assess_bcs() is also mocked here since its own behavior is
already covered by test_bcs_endpoint.py; these tests only verify the
analyze-endpoint's status transitions and error handling.
"""
from unittest.mock import AsyncMock, patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.core.exceptions import InvalidImageError
from app.main import app
from app.schemas.bcs import MultiModelBCSResponse, ProviderAssessment
from app.services.llm.base import ImagePayload

client = TestClient(app)


def test_analyze_rejects_invalid_id():
    response = client.post("/api/bcs/analyze/not-an-object-id")
    assert response.status_code == 400


def test_analyze_returns_404_when_record_missing():
    with patch("app.api.endpoints.bcs.get_bcs_analysis", new=AsyncMock(return_value=None)):
        response = client.post(f"/api/bcs/analyze/{ObjectId()}")
    assert response.status_code == 404


@pytest.mark.parametrize("status", ["processing", "completed"])
def test_analyze_returns_409_when_already_in_progress_or_done(status):
    record = {"_id": ObjectId(), "status": status, "cowsImages": ["gs://bucket/3124/ts/a.jpg"]}
    with patch("app.api.endpoints.bcs.get_bcs_analysis", new=AsyncMock(return_value=record)):
        response = client.post(f"/api/bcs/analyze/{record['_id']}")
    assert response.status_code == 409


def test_analyze_marks_processing_then_completed_on_success():
    analysis_id = ObjectId()
    record = {
        "_id": analysis_id,
        "status": "not_started",
        "cowsImages": ["gs://bucket/3124/ts/a.jpg", "gs://bucket/3124/ts/b.jpg"],
    }
    fake_payload = ImagePayload(bytes_data=b"x", mime_type="image/jpeg")
    fake_result = MultiModelBCSResponse(
        gemini=ProviderAssessment(final_bcs=3.0, confidence="High", status="success")
    )

    with (
        patch("app.api.endpoints.bcs.get_bcs_analysis", new=AsyncMock(return_value=record)),
        patch("app.api.endpoints.bcs.update_bcs_analysis", new=AsyncMock()) as mock_update,
        patch("app.api.endpoints.bcs.fetch_image_from_gcs", new=AsyncMock(return_value=fake_payload)) as mock_fetch,
        patch("app.api.endpoints.bcs.assess_bcs", new=AsyncMock(return_value=fake_result)) as mock_assess,
    ):
        response = client.post(f"/api/bcs/analyze/{analysis_id}")

    assert response.status_code == 202
    assert response.json() == {"id": str(analysis_id), "status": "processing"}

    # one fetch per image, sourced straight from GCS rather than a multipart upload
    assert mock_fetch.call_count == 2
    mock_assess.assert_awaited_once()

    # first call flips to processing before the background task runs, second
    # call (from the background task) writes the completed result
    calls = mock_update.await_args_list
    assert calls[0].args == (analysis_id, {"status": "processing"})
    assert calls[1].args[0] == analysis_id
    assert calls[1].args[1]["status"] == "completed"
    # The whole result lands as bcsScore verbatim - no mean/median value
    # split out to the document root, since neither is computed here anymore
    # (Node backend derives them fresh from the provider scores on read).
    assert calls[1].args[1]["bcsScore"] == fake_result.model_dump()


def test_analyze_skips_a_failed_image_but_still_completes_with_the_rest():
    """One image being too big / broken must not take down the whole
    analysis - it should be dropped, and the record still completes using
    whichever images did download successfully."""
    analysis_id = ObjectId()
    record = {
        "_id": analysis_id,
        "status": "not_started",
        "cowsImages": [
            "gs://bucket/3124/ts/a.jpg",
            "gs://bucket/3124/ts/too-big.jpg",
            "gs://bucket/3124/ts/c.jpg",
        ],
    }
    fake_payload = ImagePayload(bytes_data=b"x", mime_type="image/jpeg")
    fake_result = MultiModelBCSResponse(
        gemini=ProviderAssessment(final_bcs=3.0, confidence="High", status="success")
    )

    async def fetch_side_effect(uri):
        if "too-big" in uri:
            raise InvalidImageError(f"'{uri}' is 12.0MB, exceeds 10MB limit.")
        return fake_payload

    with (
        patch("app.api.endpoints.bcs.get_bcs_analysis", new=AsyncMock(return_value=record)),
        patch("app.api.endpoints.bcs.update_bcs_analysis", new=AsyncMock()) as mock_update,
        patch("app.api.endpoints.bcs.fetch_image_from_gcs", new=AsyncMock(side_effect=fetch_side_effect)),
        patch("app.api.endpoints.bcs.assess_bcs", new=AsyncMock(return_value=fake_result)) as mock_assess,
    ):
        response = client.post(f"/api/bcs/analyze/{analysis_id}")

    assert response.status_code == 202

    # only the 2 good images should have reached assess_bcs - the broken one is dropped
    mock_assess.assert_awaited_once()
    assert len(mock_assess.await_args.kwargs["images"]) == 2

    calls = mock_update.await_args_list
    assert calls[1].args[0] == analysis_id
    assert calls[1].args[1]["status"] == "completed"
    assert calls[1].args[1]["bcsScore"] == fake_result.model_dump()
    assert len(calls[1].args[1]["skippedImages"]) == 1
    assert "too-big" in calls[1].args[1]["skippedImages"][0]


def test_analyze_fails_only_when_every_single_image_fails():
    """Skipping bad images is fine as long as at least one is usable - but
    if literally all of them fail, the analysis has nothing to work with
    and must be marked failed, not silently "completed" with no score."""
    analysis_id = ObjectId()
    record = {
        "_id": analysis_id,
        "status": "not_started",
        "cowsImages": ["gs://bucket/3124/ts/a.jpg", "gs://bucket/3124/ts/b.jpg"],
    }

    with (
        patch("app.api.endpoints.bcs.get_bcs_analysis", new=AsyncMock(return_value=record)),
        patch("app.api.endpoints.bcs.update_bcs_analysis", new=AsyncMock()) as mock_update,
        patch("app.api.endpoints.bcs.fetch_image_from_gcs", new=AsyncMock(side_effect=RuntimeError("gone"))),
    ):
        response = client.post(f"/api/bcs/analyze/{analysis_id}")

    assert response.status_code == 202

    calls = mock_update.await_args_list
    assert calls[1].args[1]["status"] == "failed"
    assert "All 2 image(s) failed to download" in calls[1].args[1]["errorMessage"]


def test_analyze_marks_failed_when_assessment_raises():
    analysis_id = ObjectId()
    record = {"_id": analysis_id, "status": "failed", "cowsImages": ["gs://bucket/3124/ts/a.jpg"]}
    fake_payload = ImagePayload(bytes_data=b"x", mime_type="image/jpeg")

    with (
        patch("app.api.endpoints.bcs.get_bcs_analysis", new=AsyncMock(return_value=record)),
        patch("app.api.endpoints.bcs.update_bcs_analysis", new=AsyncMock()) as mock_update,
        patch("app.api.endpoints.bcs.fetch_image_from_gcs", new=AsyncMock(return_value=fake_payload)),
        patch("app.api.endpoints.bcs.assess_bcs", new=AsyncMock(side_effect=RuntimeError("all providers failed"))),
    ):
        response = client.post(f"/api/bcs/analyze/{analysis_id}")

    assert response.status_code == 202  # retry from a failed record is allowed

    calls = mock_update.await_args_list
    assert calls[0].args == (analysis_id, {"status": "processing"})
    assert calls[1].args[0] == analysis_id
    assert calls[1].args[1]["status"] == "failed"
    assert "all providers failed" in calls[1].args[1]["errorMessage"]
