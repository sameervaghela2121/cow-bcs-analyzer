"""
Per-model USD pricing (per 1,000,000 tokens) for every vision LLM this app
can call, used to log each provider's cost in rupees after a BCS analysis.
Model IDs are read straight from Settings (CLAUDE_VISION_MODEL /
GEMINI_VISION_MODEL / OPENAI_VISION_MODEL), so pointing .env at a
different model changes the logged cost automatically - nothing here is
hardcoded to today's .env values.

Prices verified 2026-09-07 against each provider's public pricing page /
Anthropic's own rate card. All three SDKs fold image tokens into their
regular input-token usage field (usage.input_tokens / usage.prompt_tokens /
usage_metadata.prompt_token_count), so no separate per-image token
estimate is needed - the reported usage already reflects it.
"""
from dataclasses import dataclass

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# model id -> (input $ / 1M tokens, output $ / 1M tokens)
MODEL_PRICING_USD_PER_MTOK: dict[str, tuple[float, float]] = {
    # --- Anthropic / Claude ---
    "claude-fable-5-1": (10.00, 50.00),
    "claude-mythos-5-1": (10.00, 50.00),
    "claude-fable-5": (10.00, 50.00),
    "claude-opus-5": (5.00, 25.00),
    "claude-opus-4-8": (5.00, 25.00),
    "claude-opus-4-7": (5.00, 25.00),
    "claude-opus-4-6": (5.00, 25.00),
    "claude-sonnet-5": (2.00, 10.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-haiku-4-5": (1.00, 5.00),

    # --- OpenAI ---
    "gpt-4.1": (2.00, 8.00),
    "gpt-5.1": (1.25, 10.00),

    # --- Google Gemini ---
    # gemini-2.5-pro's rate doubles above a 200k-token prompt; BCS image
    # batches never get close, so only the base tier is modeled here.
    "gemini-3.5-flash": (1.50, 9.00),
    "gemini-2.5-pro": (1.25, 10.00),
}


@dataclass
class CostEstimate:
    model: str
    input_tokens: int
    output_tokens: int
    usd: float
    inr: float


def estimate_cost(
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
) -> CostEstimate | None:
    """
    Converts one provider call's token usage into USD/INR using
    MODEL_PRICING_USD_PER_MTOK and settings.USD_TO_INR_RATE.

    Returns None (after logging a warning) instead of raising whenever cost
    can't be computed - missing usage, or a model that isn't in the pricing
    table yet - so an unpriced or future model never breaks the analysis,
    only its cost log.
    """
    if input_tokens is None or output_tokens is None:
        logger.warning("No token usage reported for model '%s' - skipping cost estimate.", model)
        return None

    pricing = MODEL_PRICING_USD_PER_MTOK.get(model)
    if pricing is None:
        # Best-effort match for a dated/suffixed variant of a known model
        # (e.g. "gpt-4.1-2026-05-01"), so a snapshot id still prices.
        prefix_matches = [key for key in MODEL_PRICING_USD_PER_MTOK if model.startswith(key)]
        if prefix_matches:
            pricing = MODEL_PRICING_USD_PER_MTOK[max(prefix_matches, key=len)]
        else:
            logger.warning(
                "No pricing entry for model '%s' - add it to MODEL_PRICING_USD_PER_MTOK "
                "in app/core/pricing.py to get cost logging for it.",
                model,
            )
            return None

    input_price, output_price = pricing
    usd = (input_tokens / 1_000_000) * input_price + (output_tokens / 1_000_000) * output_price
    return CostEstimate(
        model=model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        usd=usd,
        inr=usd * settings.USD_TO_INR_RATE,
    )
