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
from app.utils.image_utils import validate_and_load_image

router = APIRouter(prefix="/bcs", tags=["Body Condition Scoring"])
logger = get_logger(__name__)


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
    the others).

    Kept as a standalone multipart entry point independent of MongoDB state —
    useful for smoke-testing provider wiring. The `/analyze/{id}` route below
    is what the real cows/bcs_analysis flow uses.
    """
    if not images:
        raise InvalidImageError("At least one image is required.")

    payloads = [
        await validate_and_load_image(file)
        for file in images
    ]

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
    """
    try:
        payloads = [await fetch_image_from_gcs(uri) for uri in image_uris]
        result = await assess_bcs(images=payloads)
        await update_bcs_analysis(analysis_id, {"status": "completed", "bcsScore": result.model_dump()})
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
