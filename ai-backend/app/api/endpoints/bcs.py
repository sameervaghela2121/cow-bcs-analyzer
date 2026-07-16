import asyncio

from fastapi import APIRouter, Depends

from app.api.deps import get_provider_filter
from app.core.exceptions import AnalysisNotFoundError, InvalidImageError
from app.db.mongo import get_cow_bcs_analysis
from app.schemas.bcs import MultiModelBCSResponse
from app.services.bcs_service import assess_bcs
from app.utils.image_utils import download_and_validate_image

router = APIRouter(prefix="/bcs", tags=["Body Condition Scoring"])


@router.post("/assess/{analysis_id}", response_model=MultiModelBCSResponse)
async def assess_cattle_bcs(
    analysis_id: str,
    provider_names: list[str] | None = Depends(get_provider_filter),
) -> MultiModelBCSResponse:
    """
    Looks up `analysis_id` in the `cow_bcs_analysis` collection, downloads
    every URL in its `cow_images` list, and sends all of them - together, in
    one call - to every configured vision LLM (Gemini, Claude, OpenAI) using
    the same BCS scoring prompt. Pass ?providers=gemini,claude to narrow it
    down.

    Whatever number of images the referenced cow has (1, 4, however many)
    all go into the same LLM session/call, exactly like the previous
    multi-file upload did - only the image source changed.

    Returns each model's structured assessment side by side under `results`,
    plus any providers that failed under `errors` (one failure never blocks
    the others).
    """
    analysis = await get_cow_bcs_analysis(analysis_id)
    if analysis is None:
        raise AnalysisNotFoundError(
            f"No cow_bcs_analysis document found for id '{analysis_id}'."
        )

    image_urls = analysis.get("cow_images") or []
    if not image_urls:
        raise InvalidImageError(
            f"cow_bcs_analysis '{analysis_id}' has no cow_images to assess."
        )

    payloads = await asyncio.gather(
        *[
            download_and_validate_image(url, label=f"image_{i + 1}")
            for i, url in enumerate(image_urls)
        ]
    )

    return await assess_bcs(images=list(payloads), provider_names=provider_names)
