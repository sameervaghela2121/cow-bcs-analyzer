import asyncio
from typing import Awaitable

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, BackgroundTasks, Depends, File, UploadFile

from app.api.deps import get_provider_filter
from app.core.exceptions import AppError, InvalidImageError
from app.core.logging import get_logger
from app.db.mongo import get_bcs_analysis, update_bcs_analysis
from app.schemas.bcs import MultiModelBCSResponse
from app.services.bcs_service import assess_bcs
from app.services.gcs_service import fetch_image_from_gcs
from app.services.llm.base import ImagePayload
from app.utils.image_utils import validate_and_load_image

router = APIRouter(prefix="/bcs", tags=["Body Condition Scoring"])
logger = get_logger(__name__)


async def _gather_images_tolerating_failures(
    labels: list[str],
    fetch_calls: list[Awaitable[ImagePayload]],
) -> tuple[list[ImagePayload], list[str]]:
    """
    Runs every per-image fetch/validation concurrently. One image failing
    (size limit, bad content-type, a broken GCS object, etc.) must never
    abort the whole analysis - it's skipped, logged, and reported back
    alongside whatever did succeed, exactly like a single LLM provider
    failing never blocks the others in assess_bcs().
    """
    results = await asyncio.gather(*fetch_calls, return_exceptions=True)
    payloads: list[ImagePayload] = []
    failures: list[str] = []
    for label, result in zip(labels, results):
        if isinstance(result, Exception):
            logger.warning("Skipping image '%s': %s", label, result)
            failures.append(f"{label}: {result}")
        else:
            payloads.append(result)
    return payloads, failures


@router.post("/assess", response_model=MultiModelBCSResponse)
async def assess_cattle_bcs(
    images: list[UploadFile] = File(..., description="One or more photos of the animal(s) to assess"),
    provider_names: list[str] | None = Depends(get_provider_filter),
) -> MultiModelBCSResponse:
    """
    Accepts any number of image blobs and sends them, concurrently, to every
    configured vision LLM (Gemini, Claude, OpenAI) using the same BCS scoring
    prompt. Pass ?providers=gemini,claude to narrow it down.

    Returns each model's structured assessment side by side under `results`,
    plus any providers that failed under `errors` (one failure never blocks
    the others). Likewise, one image failing validation (size limit, wrong
    type, etc.) never blocks the rest - it's skipped and the analysis still
    runs on whichever images were valid.

    Kept as a standalone multipart entry point independent of MongoDB state —
    useful for smoke-testing provider wiring. The `/analyze/{id}` route below
    is what the real cows/bcs_analysis flow uses.
    """
    if not images:
        raise InvalidImageError("At least one image is required.")

    payloads, failures = await _gather_images_tolerating_failures(
        labels=[file.filename or "unnamed" for file in images],
        fetch_calls=[validate_and_load_image(file) for file in images],
    )
    if not payloads:
        raise InvalidImageError(f"All {len(images)} image(s) failed validation: {failures}")

    return await assess_bcs(images=payloads, provider_names=provider_names)


class InvalidAnalysisIdError(AppError):
    def __init__(self, message: str = "Invalid bcs_analysis id."):
        super().__init__(message, status_code=400)


class AnalysisNotFoundError(AppError):
    def __init__(self, message: str = "bcs_analysis record not found."):
        super().__init__(message, status_code=404)


class AnalysisConflictError(AppError):
    def __init__(self, message: str = "This analysis is already processing or completed."):
        super().__init__(message, status_code=409)


async def _run_analysis(analysis_id: ObjectId, image_uris: list[str]) -> None:
    """
    Background job: fetch each image straight from GCS (bytes, not a
    multipart upload) and run the exact same assess_bcs() used by /assess —
    same prompt, same providers, same reconciliation. Only the image
    acquisition step differs from the multipart flow.

    One image failing to download (size limit, wrong content-type, a
    permissions/network hiccup on that one GCS object, etc.) does not fail
    the whole analysis - it's skipped, and the record still completes using
    whichever images did download. Only if every single image fails does
    the analysis itself fail.
    """
    try:
        payloads, failures = await _gather_images_tolerating_failures(
            labels=image_uris,
            fetch_calls=[fetch_image_from_gcs(uri) for uri in image_uris],
        )
        if not payloads:
            raise InvalidImageError(f"All {len(image_uris)} image(s) failed to download: {failures}")

        result = await assess_bcs(images=payloads)
        update_fields = {"status": "completed", "bcsScore": result.model_dump()}
        if failures:
            update_fields["skippedImages"] = failures
        await update_bcs_analysis(analysis_id, update_fields)
    except Exception as exc:  # noqa: BLE001
        logger.warning("BCS analysis %s failed: %s", analysis_id, exc)
        await update_bcs_analysis(analysis_id, {"status": "failed", "errorMessage": str(exc)})


@router.post("/analyze/{bcs_analysis_id}", status_code=202)
async def analyze_bcs_record(bcs_analysis_id: str, background_tasks: BackgroundTasks) -> dict:
    """
    Given the Mongo _id of a bcs_analysis record (created by the Node backend
    once the frontend finishes uploading images to GCS), flips the record to
    'processing' and kicks off the same multi-provider assessment as
    /assess in the background. Returns immediately; poll the record's
    status/bcsScore via the Node backend (GET /api/bcs-analysis/:id) for the
    result.
    """
    try:
        analysis_id = ObjectId(bcs_analysis_id)
    except InvalidId:
        raise InvalidAnalysisIdError(f"'{bcs_analysis_id}' is not a valid id.")

    record = await get_bcs_analysis(analysis_id)
    if record is None:
        raise AnalysisNotFoundError()
    if record.get("status") in ("processing", "completed"):
        raise AnalysisConflictError()

    await update_bcs_analysis(analysis_id, {"status": "processing"})
    background_tasks.add_task(_run_analysis, analysis_id, record["cowsImages"])

    return {"id": bcs_analysis_id, "status": "processing"}
