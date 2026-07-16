"""
Unit tests for app.services.gcs_service. The real google-cloud-storage
client is mocked out entirely - these tests only verify our own path
parsing/validation and the ImagePayload wiring, not GCS itself.
"""
from unittest.mock import MagicMock, patch

import pytest

from app.core.exceptions import InvalidImageError
from app.services.gcs_service import fetch_image_from_gcs, parse_gs_uri


def test_parse_gs_uri_splits_bucket_and_object_path():
    with patch("app.services.gcs_service.settings") as mock_settings:
        mock_settings.GCS_BUCKET_NAME = "sameerv-cow-bcs-images"
        bucket, object_path = parse_gs_uri(
            "gs://sameerv-cow-bcs-images/3124/2026-07-16T10-00-00-000Z/a.jpg"
        )
    assert bucket == "sameerv-cow-bcs-images"
    assert object_path == "3124/2026-07-16T10-00-00-000Z/a.jpg"


def test_parse_gs_uri_rejects_non_gs_scheme():
    with pytest.raises(InvalidImageError):
        parse_gs_uri("https://example.com/a.jpg")


def test_parse_gs_uri_rejects_wrong_bucket():
    with patch("app.services.gcs_service.settings") as mock_settings:
        mock_settings.GCS_BUCKET_NAME = "sameerv-cow-bcs-images"
        with pytest.raises(InvalidImageError):
            parse_gs_uri("gs://some-other-bucket/3124/ts/a.jpg")


def test_parse_gs_uri_rejects_missing_object_path():
    with patch("app.services.gcs_service.settings") as mock_settings:
        mock_settings.GCS_BUCKET_NAME = "sameerv-cow-bcs-images"
        with pytest.raises(InvalidImageError):
            parse_gs_uri("gs://sameerv-cow-bcs-images/")


@pytest.mark.asyncio
async def test_fetch_image_from_gcs_downloads_and_wraps_payload():
    fake_blob = MagicMock()
    fake_blob.download_as_bytes.return_value = b"fake-jpeg-bytes"
    fake_blob.content_type = "image/jpeg"

    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob

    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket

    with (
        patch("app.services.gcs_service.settings") as mock_settings,
        patch("app.services.gcs_service.get_client", return_value=fake_client),
    ):
        mock_settings.GCS_BUCKET_NAME = "sameerv-cow-bcs-images"
        payload = await fetch_image_from_gcs(
            "gs://sameerv-cow-bcs-images/3124/ts/a.jpg"
        )

    assert payload.bytes_data == b"fake-jpeg-bytes"
    assert payload.mime_type == "image/jpeg"
    fake_bucket.blob.assert_called_once_with("3124/ts/a.jpg")
