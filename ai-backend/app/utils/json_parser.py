import json
import re

from app.core.exceptions import LLMProviderError
from app.core.logging import get_logger

logger = get_logger(__name__)

_JSON_FENCE_RE = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL)
_BARE_JSON_RE = re.compile(r"(\{)", re.DOTALL)


def _extract_balanced_json(text: str, start: int) -> str | None:
    """Extract a balanced JSON object starting at position `start`."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def extract_json_block(raw_text: str) -> dict:
    """
    Pulls the trailing ```json {...} ``` block out of a model response that
    otherwise contains free-form narrative text. Falls back to grabbing the
    last top-level {...} blob if the model forgot the fence.
    """
    candidate = None

    fence_match = _JSON_FENCE_RE.search(raw_text)
    if fence_match:
        inner = fence_match.group(1).strip()
        brace_start = inner.find("{")
        if brace_start != -1:
            candidate = _extract_balanced_json(inner, brace_start)
    else:
        bare_matches = list(_BARE_JSON_RE.finditer(raw_text))
        if bare_matches:
            candidate = _extract_balanced_json(raw_text, bare_matches[-1].start())

    if candidate is None:
        logger.error("No JSON block found in model response. Raw text:\n%s", raw_text[:2000])
        raise LLMProviderError(
            "Model response did not contain a parseable JSON block. "
            "Raw response has been logged for debugging."
        )

    try:
        return json.loads(candidate)
    except json.JSONDecodeError as exc:
        logger.error("Malformed JSON from model: %s\nCandidate:\n%s", exc, candidate[:2000])
        raise LLMProviderError(f"Model returned malformed JSON: {exc}") from exc
