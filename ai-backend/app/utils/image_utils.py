from fastapi import UploadFile

from app.core.config import settings
from app.core.exceptions import InvalidImageError
from app.services.llm.base import ImagePayload


async def validate_and_load_image(file: UploadFile, label: str | None = None) -> ImagePayload:
    if file.content_type not in settings.ALLOWED_IMAGE_TYPES:
        raise InvalidImageError(
            f"'{file.filename}' has unsupported type '{file.content_type}'. "
            f"Allowed: {settings.ALLOWED_IMAGE_TYPES}"
        )

    data = await file.read()
    size_mb = len(data) / (1024 * 1024)
    if size_mb > settings.MAX_IMAGE_SIZE_MB:
        raise InvalidImageError(
            f"'{file.filename}' is {size_mb:.1f}MB, exceeds {settings.MAX_IMAGE_SIZE_MB}MB limit."
        )
    if not data:
        raise InvalidImageError(f"'{file.filename}' is empty.")

    return ImagePayload(bytes_data=data, mime_type=file.content_type, label=label)
