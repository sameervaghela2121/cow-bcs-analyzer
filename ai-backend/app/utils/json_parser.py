import json
import re

from app.core.exceptions import LLMProviderError
from app.core.logging import get_logger

logger = get_logger(__name__)

_JSON_FENCE_RE = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL)
_BARE_JSON_RE = re.compile(r"(\{)", re.DOTALL)

# Keys that identify the outer assessment object, so a nested object (e.g. one
# entry of the "landmarks" array) is never mistaken for the whole response.
_RESPONSE_KEYS = ("assessments", "final_bcs")


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


def _find_response_object(text: str) -> str | None:
    """
    Return the outermost balanced {...} that actually looks like an assessment.

    Scans candidate braces earliest-first so the OUTER object wins: providers
    using native structured output (Gemini, OpenAI json_mode) return bare JSON
    whose nested "landmarks" entries would otherwise be picked up instead.
    Narrative prose before the JSON is skipped because it will not parse.
    """
    fallback = None
    for match in _BARE_JSON_RE.finditer(text):
        blob = _extract_balanced_json(text, match.start())
        if blob is None:
            continue
        try:
            parsed = json.loads(blob)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict) and any(k in parsed for k in _RESPONSE_KEYS):
            return blob
        if fallback is None:
            fallback = blob
    return fallback


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
        candidate = _find_response_object(raw_text)

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
