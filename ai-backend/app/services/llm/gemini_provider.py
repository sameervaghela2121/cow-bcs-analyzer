from google import genai
from google.genai import types

from app.core.config import settings
from app.core.exceptions import extract_error_message, LLMProviderError
from app.services.llm.base import ImagePayload, LLMProvider

_LANDMARK_NAMES = [
    "hooks", "posterior_hook_angle", "tailhead", "pins",
    "thurl_line", "ribs", "spine", "brisket",
]

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "landmarks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "enum": _LANDMARK_NAMES},
                    # Normalised 0-1000, top-left origin. Gemini emits this scale
                    # regardless of what the prompt asks for, so callers must
                    # rescale by image width/height before drawing overlays.
                    "x": {"type": "integer", "minimum": 0, "maximum": 1000, "nullable": True},
                    "y": {"type": "integer", "minimum": 0, "maximum": 1000, "nullable": True},
                    "bin": {"type": "string"},
                    "anchor": {"type": "number", "nullable": True},
                    "weight": {"type": "number"},
                },
                "required": ["name", "bin", "weight"],
            },
        },
        "visible_weight": {"type": "number"},
        "weighted_sum": {"type": "number"},
        "recommendation": {"type": "string"},
        "final_bcs": {"type": "number", "minimum": 1.0, "maximum": 5.0},
        "confidence": {"type": "string", "enum": ["High", "Medium", "Low"]},
    },
    # Only the three fields BOTH prompts produce are required. "landmarks" and
    # "visible_weight" are optional so the old holistic prompt still validates:
    # requiring them would force Gemini to invent landmarks that prompt never
    # asks for. See the PROMPT SELECTION block in bcs_service.py.
    "required": ["recommendation", "final_bcs", "confidence"],
}


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self) -> None:
        if not settings.GEMINI_API_KEY:
            raise LLMProviderError("GEMINI_API_KEY is not configured.")
        self._client = genai.Client(api_key=settings.GEMINI_API_KEY)
        self._model = settings.GEMINI_VISION_MODEL

    async def analyze_images(
        self,
        system_prompt: str,
        user_instruction: str,
        images: list[ImagePayload],
        max_tokens: int = 4096,
    ) -> str:
        parts: list[types.Part | str] = []
        for img in images:
            parts.append(types.Part.from_bytes(data=img.bytes_data, mime_type=img.mime_type))
            if img.label:
                parts.append(f"[Image above is: {img.label}]")
        parts.append(user_instruction)

        try:
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=parts,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=max_tokens,
                    temperature=settings.LLM_TEMPERATURE,
                    response_mime_type="application/json",
                    response_schema=_RESPONSE_SCHEMA,
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                ),
            )
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(extract_error_message(exc)) from exc

        if not response.text:
            raise LLMProviderError("Gemini returned no text content.")
        return response.text
