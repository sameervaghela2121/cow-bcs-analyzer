import asyncio

from app.core.exceptions import LLMProviderError
from app.core.logging import get_logger
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
        max_tokens=12000,
    )
    parsed = extract_json_block(raw_text)
    logger.info("Provider '%s' parsed JSON: %s", provider.name, parsed)
    if "assessments" in parsed:
        first = parsed["assessments"][0]
    else:
        first = parsed
    return ProviderAssessment(
        recommendation=first["recommendation"],
        finalBcs=first["final_bcs"],
        confidence=first["confidence"],
        status="success",
        errorMessage=None,
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

    # ------------------------------------------------------------------
    # PROMPT SELECTION — keep exactly ONE of the two pairs below active.
    #
    #   ORIGINAL   : holistic scoring. The model reads the animal and states a
    #                score directly. Unchanged, pre-landmark behaviour.
    #   ANATOMICAL : the model locates 8 anatomical landmarks, rates each into
    #                a discrete bin, and computes the weighted average itself.
    #
    # To switch, comment out the active pair and uncomment the other.
    # Nothing else needs changing — the response parser accepts both shapes.
    # ------------------------------------------------------------------

    # --- ORIGINAL (holistic) ---
    # system_prompt = load_prompt("bcs/bcs_system_prompt.md")
    # json_addendum = load_prompt("bcs/bcs_json_addendum.md")

    # --- ANATOMICAL (landmark binning) ---
    system_prompt = load_prompt("bcs/bcs_anatomical_system_prompt.md")
    json_addendum = load_prompt("bcs/bcs_anatomical_json_addendum.md")
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
                errorMessage=str(exc),
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
        errors = [f"{name}: {a.errorMessage}" for name, a in outcomes]
        raise LLMProviderError(f"All providers failed: {errors}")

    # Computed from `outcomes` (only the providers queried this call), not
    # from `response` directly - untouched provider fields on `response`
    # still carry ProviderAssessment's default status="success" even though
    # they were never queried, which would otherwise silently pollute this.
    successful_scores = [
        assessment.finalBcs
        for _, assessment in outcomes
        if assessment.status == "success" and assessment.finalBcs is not None
    ]
    # Mean/median are intentionally not computed here anymore - they're a
    # pure function of these same successful_scores, so the Node backend
    # recomputes them fresh at read time instead of us persisting a value
    # that could drift from the raw scores it's derived from.
    if len(successful_scores) >= 2:
        response.isCritical = (max(successful_scores) - min(successful_scores)) > 0.5

    return response
