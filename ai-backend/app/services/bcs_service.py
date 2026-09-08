import asyncio

from app.core.exceptions import LLMProviderError
from app.core.logging import get_logger
from app.core.pricing import CostEstimate, estimate_cost
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
) -> tuple[ProviderAssessment, CostEstimate | None]:
    result = await provider.analyze_images(
        system_prompt=system_prompt,
        user_instruction=user_instruction,
        images=images,
        max_tokens=12000,
    )
    parsed = extract_json_block(result.text)
    logger.info("Provider '%s' parsed JSON: %s", provider.name, parsed)

    cost = estimate_cost(provider.model, result.usage.input_tokens, result.usage.output_tokens)
    if cost is not None:
        logger.info(
            "Provider '%s' (model=%s) used %d input + %d output tokens -> $%.5f (₹%.4f)",
            provider.name, provider.model, cost.input_tokens, cost.output_tokens, cost.usd, cost.inr,
        )

    if "assessments" in parsed:
        first = parsed["assessments"][0]
    else:
        first = parsed
    assessment = ProviderAssessment(
        recommendation=first["recommendation"],
        finalBcs=first["final_bcs"],
        confidence=first["confidence"],
        status="success",
        errorMessage=None,
    )
    return assessment, cost


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

    async def _safe_run(name: str) -> tuple[str, ProviderAssessment, CostEstimate | None]:
        try:
            provider = get_llm_provider(name)
            if provider.name == "gemini":
                instruction = base_instruction
            else:
                instruction = base_instruction + "\n\n" + json_addendum
            assessment, cost = await _run_single_provider(provider, system_prompt, instruction, images)
            return name, assessment, cost
        except Exception as exc:  # noqa: BLE001
            logger.warning("Provider '%s' failed: %s", name, exc)
            return name, ProviderAssessment(
                status="error",
                errorMessage=str(exc),
            ), None

    outcomes = await asyncio.gather(*[_safe_run(name) for name in names])

    response = MultiModelBCSResponse()
    success_count = 0
    for name, assessment, _cost in outcomes:
        if hasattr(response, name):
            setattr(response, name, assessment)
            if assessment.status == "success":
                success_count += 1

    if success_count == 0:
        errors = [f"{name}: {a.errorMessage}" for name, a, _cost in outcomes]
        raise LLMProviderError(f"All providers failed: {errors}")

    # Log the total cost across every provider queried this call, in
    # rupees, alongside each provider's own share - this is the "how much
    # did this batch of images cost" line; per-provider token/cost detail
    # is already logged in _run_single_provider as each call finishes.
    provider_costs = [(name, cost) for name, _assessment, cost in outcomes if cost is not None]
    if provider_costs:
        total_usd = sum(cost.usd for _name, cost in provider_costs)
        total_inr = sum(cost.inr for _name, cost in provider_costs)
        breakdown = ", ".join(f"{name}=₹{cost.inr:.4f}" for name, cost in provider_costs)
        logger.info(
            "BCS analysis cost for %d image(s) across %d provider(s): ₹%.4f total ($%.5f) [%s]",
            len(images), len(provider_costs), total_inr, total_usd, breakdown,
        )

    # Computed from `outcomes` (only the providers queried this call), not
    # from `response` directly - untouched provider fields on `response`
    # still carry ProviderAssessment's default status="success" even though
    # they were never queried, which would otherwise silently pollute this.
    successful_scores = [
        assessment.finalBcs
        for _, assessment, _cost in outcomes
        if assessment.status == "success" and assessment.finalBcs is not None
    ]
    # Mean/median are intentionally not computed here anymore - they're a
    # pure function of these same successful_scores, so the Node backend
    # recomputes them fresh at read time instead of us persisting a value
    # that could drift from the raw scores it's derived from.
    if len(successful_scores) >= 2:
        response.isCritical = (max(successful_scores) - min(successful_scores)) > 0.5

    return response
