import asyncio
from urllib.parse import urlparse

import httpx
from google.api_core.exceptions import GoogleAPIError
from google.auth.exceptions import DefaultCredentialsError
from google.cloud import storage
from google.oauth2 import service_account

from app.core.config import settings
from app.core.exceptions import GcsNotConfiguredError, ImageDownloadError, InvalidImageError
from app.services.llm.base import ImagePayload

_DOWNLOAD_TIMEOUT_SECONDS = 30.0

_gcs_client: storage.Client | None = None


def _get_gcs_client() -> storage.Client:
    """Lazily builds a cached GCS client. Prefers an explicit service-account
    key file (GOOGLE_APPLICATION_CREDENTIALS) if configured, otherwise falls
    back to Application Default Credentials (e.g. running on GCP/Cloud Run,
    or that same env var already set outside our .env)."""
    global _gcs_client
    if _gcs_client is not None:
        return _gcs_client
    try:
        if settings.GOOGLE_APPLICATION_CREDENTIALS:
            credentials = service_account.Credentials.from_service_account_file(
                settings.GOOGLE_APPLICATION_CREDENTIALS
            )
            _gcs_client = storage.Client(
                credentials=credentials,
                project=settings.GCS_PROJECT_ID or credentials.project_id,
            )
        else:
            _gcs_client = storage.Client(project=settings.GCS_PROJECT_ID)
    except (DefaultCredentialsError, FileNotFoundError) as exc:
        raise GcsNotConfiguredError(
            "No usable Google Cloud credentials found. Set "
            "GOOGLE_APPLICATION_CREDENTIALS to a service-account key file, "
            "or run somewhere with Application Default Credentials available."
        ) from exc
    return _gcs_client


def _parse_gs_url(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    bucket_name = parsed.netloc
    blob_name = parsed.path.lstrip("/")
    if not bucket_name or not blob_name:
        raise InvalidImageError(f"Malformed GCS URL '{url}' - expected gs://<bucket>/<object-path>.")
    return bucket_name, blob_name


def _download_from_gcs_sync(url: str) -> tuple[bytes, str | None]:
    bucket_name, blob_name = _parse_gs_url(url)
    client = _get_gcs_client()
    blob = client.bucket(bucket_name).blob(blob_name)
    try:
        blob.reload()  # populates blob.content_type from GCS object metadata
        data = blob.download_as_bytes()
    except GoogleAPIError as exc:
        raise ImageDownloadError(f"Failed to download '{url}' from GCS: {exc}") from exc
    return data, blob.content_type


async def _download_from_gcs(url: str) -> tuple[bytes, str | None]:
    # google-cloud-storage has no native async client - run the blocking
    # call in a thread so concurrent downloads don't serialize on one another.
    return await asyncio.to_thread(_download_from_gcs_sync, url)


async def _download_from_http(url: str) -> tuple[bytes, str | None]:
    try:
        async with httpx.AsyncClient(timeout=_DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ImageDownloadError(f"Failed to download image from '{url}': {exc}") from exc
    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower() or None
    return response.content, content_type


async def download_and_validate_image(url: str, label: str | None = None) -> ImagePayload:
    """
    Fetches a single cow_images entry - a gs:// GCS URI (the expected case)
    or a plain http(s) URL (kept as a fallback) - and validates it the same
    way an uploaded file would be (allowed type, size cap, non-empty).
    """
    scheme = urlparse(url).scheme.lower()
    if scheme == "gs":
        data, content_type = await _download_from_gcs(url)
    elif scheme in ("http", "https"):
        data, content_type = await _download_from_http(url)
    else:
        raise InvalidImageError(f"Unsupported image URL scheme in '{url}' - expected gs:// or http(s)://.")

    content_type = (content_type or "").lower()
    if content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise InvalidImageError(
            f"Image at '{url}' has unsupported type '{content_type or 'unknown'}'. "
            f"Allowed: {settings.ALLOWED_IMAGE_TYPES}"
        )

    if not data:
        raise InvalidImageError(f"Image at '{url}' is empty.")
    size_mb = len(data) / (1024 * 1024)
    if size_mb > settings.MAX_IMAGE_SIZE_MB:
        raise InvalidImageError(
            f"Image at '{url}' is {size_mb:.1f}MB, exceeds {settings.MAX_IMAGE_SIZE_MB}MB limit."
        )

    return ImagePayload(bytes_data=data, mime_type=content_type, label=label)
