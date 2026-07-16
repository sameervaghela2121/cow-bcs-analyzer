from unittest.mock import MagicMock, patch

import pytest
from google.auth.exceptions import DefaultCredentialsError

from app.core.exceptions import GcsNotConfiguredError, ImageDownloadError, InvalidImageError
from app.utils import image_utils


@pytest.fixture(autouse=True)
def _reset_gcs_client_cache():
    image_utils._gcs_client = None
    yield
    image_utils._gcs_client = None


def make_fake_blob(data: bytes = b"fake-bytes", content_type: str | None = "image/jpeg"):
    blob = MagicMock()
    blob.download_as_bytes.return_value = data
    blob.content_type = content_type
    blob.reload.return_value = None
    return blob


def make_fake_gcs_client(blob):
    bucket = MagicMock()
    bucket.blob.return_value = blob
    client = MagicMock()
    client.bucket.return_value = bucket
    return client, bucket


@pytest.mark.asyncio
async def test_downloads_and_validates_a_gs_url():
    blob = make_fake_blob()
    client, bucket = make_fake_gcs_client(blob)

    with patch("app.utils.image_utils._get_gcs_client", return_value=client):
        payload = await image_utils.download_and_validate_image(
            "gs://my-bucket/cow/9999/photo-1.jpg", label="image_1"
        )

    client.bucket.assert_called_once_with("my-bucket")
    bucket.blob.assert_called_once_with("cow/9999/photo-1.jpg")
    assert payload.bytes_data == b"fake-bytes"
    assert payload.mime_type == "image/jpeg"
    assert payload.label == "image_1"


@pytest.mark.asyncio
async def test_rejects_a_disallowed_mime_type_from_gcs():
    blob = make_fake_blob(content_type="application/pdf")
    client, _ = make_fake_gcs_client(blob)

    with patch("app.utils.image_utils._get_gcs_client", return_value=client):
        with pytest.raises(InvalidImageError):
            await image_utils.download_and_validate_image("gs://my-bucket/cow/file.pdf")


@pytest.mark.asyncio
async def test_rejects_an_empty_gcs_object():
    blob = make_fake_blob(data=b"")
    client, _ = make_fake_gcs_client(blob)

    with patch("app.utils.image_utils._get_gcs_client", return_value=client):
        with pytest.raises(InvalidImageError):
            await image_utils.download_and_validate_image("gs://my-bucket/cow/empty.jpg")


@pytest.mark.asyncio
async def test_rejects_a_malformed_gs_url():
    with pytest.raises(InvalidImageError):
        await image_utils.download_and_validate_image("gs:///no-bucket-name.jpg")


@pytest.mark.asyncio
async def test_rejects_an_unsupported_url_scheme():
    with pytest.raises(InvalidImageError):
        await image_utils.download_and_validate_image("ftp://example.com/cow.jpg")


@pytest.mark.asyncio
async def test_raises_gcs_not_configured_when_no_credentials_are_available():
    with patch("app.utils.image_utils.storage.Client", side_effect=DefaultCredentialsError("no creds")):
        with pytest.raises(GcsNotConfiguredError):
            await image_utils.download_and_validate_image("gs://my-bucket/cow/photo.jpg")


@pytest.mark.asyncio
async def test_raises_image_download_error_when_the_gcs_object_is_missing():
    from google.api_core.exceptions import NotFound

    blob = MagicMock()
    blob.reload.side_effect = NotFound("object not found")
    client, _ = make_fake_gcs_client(blob)

    with patch("app.utils.image_utils._get_gcs_client", return_value=client):
        with pytest.raises(ImageDownloadError):
            await image_utils.download_and_validate_image("gs://my-bucket/cow/missing.jpg")


@pytest.mark.asyncio
async def test_still_supports_a_plain_https_url_as_a_fallback():
    fake_response = MagicMock()
    fake_response.headers = {"content-type": "image/png"}
    fake_response.content = b"png-bytes"
    fake_response.raise_for_status.return_value = None

    class FakeAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc_info):
            return False

        async def get(self, url):
            return fake_response

    with patch("app.utils.image_utils.httpx.AsyncClient", FakeAsyncClient):
        payload = await image_utils.download_and_validate_image("https://cdn.example.com/cow.png")

    assert payload.bytes_data == b"png-bytes"
    assert payload.mime_type == "image/png"
