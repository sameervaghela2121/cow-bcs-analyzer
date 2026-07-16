import ast

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base class for all handled application errors."""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class InvalidImageError(AppError):
    def __init__(self, message: str = "One or more uploaded images are invalid."):
        super().__init__(message, status_code=422)


class LLMProviderError(AppError):
    """Raised when the upstream LLM call fails or returns unparseable output."""

    def __init__(self, message: str = "The vision model failed to produce a valid result."):
        super().__init__(message, status_code=502)


class AnalysisNotFoundError(AppError):
    """Raised when the given cow_bcs_analysis _id doesn't resolve to a document."""

    def __init__(self, message: str = "The requested cow BCS analysis record was not found."):
        super().__init__(message, status_code=404)


class ImageDownloadError(AppError):
    """Raised when a cow_images URL can't be fetched."""

    def __init__(self, message: str = "Failed to download one or more cow images."):
        super().__init__(message, status_code=502)


class MongoNotConfiguredError(AppError):
    """Raised when MONGODB_URL isn't set but a Mongo-backed lookup was requested."""

    def __init__(self, message: str = "MongoDB is not configured on this service."):
        super().__init__(message, status_code=500)


def extract_error_message(exc: Exception) -> str:
    """Extract a clean human-readable error message from a provider exception."""
    exc_str = str(exc)

    # OpenAI / Anthropic: "Error code: 429 - {'error': {'message': '...', ...}}"
    if "Error code:" in exc_str and "'message':" in exc_str:
        try:
            dict_part = exc_str.split(" - ", 1)[1]
            parsed = ast.literal_eval(dict_part)
            return parsed.get("error", {}).get("message", exc_str)
        except Exception:  # noqa: BLE001
            pass

    # Fallback: return the string as-is
    return exc_str


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.__class__.__name__, "message": exc.message},
        )
