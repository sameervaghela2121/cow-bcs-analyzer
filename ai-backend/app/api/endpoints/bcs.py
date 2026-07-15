from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_provider_filter
from app.core.exceptions import InvalidImageError
from app.schemas.bcs import MultiModelBCSResponse
from app.services.bcs_service import assess_bcs
from app.utils.image_utils import validate_and_load_image

router = APIRouter(prefix="/bcs", tags=["Body Condition Scoring"])


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
    """
    if not images:
        raise InvalidImageError("At least one image is required.")

    payloads = [
        await validate_and_load_image(file)
        for file in images
    ]

    return await assess_bcs(images=payloads, provider_names=provider_names)
