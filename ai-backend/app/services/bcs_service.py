import asyncio

from app.core.exceptions import LLMProviderError
from app.core.logging import get_logger
from app.db.mongo import save_assessment
from app.prompts.loader import load_prompt
from app.schemas.bcs import MultiModelBCSResponse, ProviderAssessment
from app.services.llm.base import ImagePayload, LLMProvider
from app.services.llm.factory import get_all_provider_names, get_llm_provider
from app.utils.json_parser import extract_json_block

logger = get_logger(__name__)


async def _run_single_provider(
    provider: LLMProvider,
    system_prompt: str,
    user_instruction: str,
    images: list[ImagePayload],
) -> ProviderAssessment:
    raw_text = await provider.analyze_images(
        system_prompt=system_prompt,
        user_instruction=user_instruction,
        images=images,
        max_tokens=4096,
    )
    parsed = extract_json_block(raw_text)
    logger.info("Provider '%s' parsed JSON: %s", provider.name, parsed)
    if "assessments" in parsed:
        first = parsed["assessments"][0]
    else:
        first = parsed
    return ProviderAssessment(
        recommendation=first["recommendation"],
        final_bcs=first["final_bcs"],
        confidence=first["confidence"],
        status="success",
        error_message=None,
    )


async def assess_bcs(
    images: list[ImagePayload],
    provider_names: list[str] | None = None,
) -> MultiModelBCSResponse:
    """
    Sends the given images + BCS prompt to every configured model
    (or a subset if `provider_names` is given) and returns each model's
    answer independently. One provider failing (bad key, rate limit, quota,
    unparseable output) never blocks the others from returning.
    """
    if not images:
        raise LLMProviderError("At least one image is required.")

    names = provider_names or get_all_provider_names()

    system_prompt = load_prompt("bcs/bcs_system_prompt.md")
    json_addendum = load_prompt("bcs/bcs_json_addendum.md")
    base_instruction = (
        "Assess the body condition score of the animal(s) shown in these images "
        "using your standard methodology."
    )

    async def _safe_run(name: str) -> tuple[str, ProviderAssessment]:
        try:
            provider = get_llm_provider(name)
            if provider.name == "gemini":
                instruction = base_instruction
            else:
                instruction = base_instruction + "\n\n" + json_addendum
            result = await _run_single_provider(provider, system_prompt, instruction, images)
            return name, result
        except Exception as exc:  # noqa: BLE001
            logger.warning("Provider '%s' failed: %s", name, exc)
            return name, ProviderAssessment(
                status="error",
                error_message=str(exc),
            )

    outcomes = await asyncio.gather(*[_safe_run(name) for name in names])

    response = MultiModelBCSResponse()
    success_count = 0
    for name, assessment in outcomes:
        if hasattr(response, name):
            setattr(response, name, assessment)
            if assessment.status == "success":
                success_count += 1

    if success_count == 0:
        errors = [f"{name}: {a.error_message}" for name, a in outcomes]
        raise LLMProviderError(f"All providers failed: {errors}")

    await save_assessment(response.model_dump())

    return response
