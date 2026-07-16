import httpx

from app.core.config import settings
from app.core.exceptions import ImageDownloadError, InvalidImageError
from app.services.llm.base import ImagePayload

_DOWNLOAD_TIMEOUT_SECONDS = 30.0


async def download_and_validate_image(url: str, label: str | None = None) -> ImagePayload:
    """
    Fetches a single cow_images URL and validates it the same way an
    uploaded file would be (allowed type, size cap, non-empty).
    """
    try:
        async with httpx.AsyncClient(timeout=_DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ImageDownloadError(f"Failed to download image from '{url}': {exc}") from exc

    content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
    if content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise InvalidImageError(
            f"Image at '{url}' has unsupported type '{content_type or 'unknown'}'. "
            f"Allowed: {settings.ALLOWED_IMAGE_TYPES}"
        )

    data = response.content
    if not data:
        raise InvalidImageError(f"Image at '{url}' is empty.")
    size_mb = len(data) / (1024 * 1024)
    if size_mb > settings.MAX_IMAGE_SIZE_MB:
        raise InvalidImageError(
            f"Image at '{url}' is {size_mb:.1f}MB, exceeds {settings.MAX_IMAGE_SIZE_MB}MB limit."
        )

    return ImagePayload(bytes_data=data, mime_type=content_type, label=label)
