"""
Fetches BCS analysis images directly from Google Cloud Storage using this
service's own service-account credentials — not a presigned URL, which may
have already expired by the time analysis actually runs.
"""
import asyncio
import mimetypes

from google.cloud import storage

from app.core.config import settings
from app.core.exceptions import InvalidImageError
from app.services.llm.base import ImagePayload

_client: storage.Client | None = None


def get_client() -> storage.Client:
    global _client
    if _client is None:
        if settings.GCS_KEY_FILE:
            _client = storage.Client.from_service_account_json(
                settings.GCS_KEY_FILE, project=settings.GCS_PROJECT_ID
            )
        else:
            _client = storage.Client(project=settings.GCS_PROJECT_ID)
    return _client


def parse_gs_uri(gs_uri: str) -> tuple[str, str]:
    """'gs://bucket/a/b/c.jpg' -> ('bucket', 'a/b/c.jpg'). Rejects anything outside our bucket."""
    if not gs_uri.startswith("gs://"):
        raise InvalidImageError(f"'{gs_uri}' is not a gs:// URI.")
    without_scheme = gs_uri.removeprefix("gs://")
    bucket, _, object_path = without_scheme.partition("/")
    if not bucket or not object_path:
        raise InvalidImageError(f"'{gs_uri}' is not a valid gs:// URI.")
    if bucket != settings.GCS_BUCKET_NAME:
        raise InvalidImageError(f"'{gs_uri}' does not belong to the configured bucket.")
    return bucket, object_path


def _download_sync(gs_uri: str) -> tuple[bytes, str]:
    bucket_name, object_path = parse_gs_uri(gs_uri)
    blob = get_client().bucket(bucket_name).blob(object_path)
    data = blob.download_as_bytes()
    content_type = blob.content_type or mimetypes.guess_type(object_path)[0] or "image/jpeg"
    return data, content_type


async def fetch_image_from_gcs(gs_uri: str) -> ImagePayload:
    """Download one image from GCS and wrap it as the provider-agnostic ImagePayload."""
    data, content_type = await asyncio.to_thread(_download_sync, gs_uri)
    return ImagePayload(bytes_data=data, mime_type=content_type, label=None)
