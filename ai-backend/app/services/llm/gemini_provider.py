from google import genai
from google.genai import types

from app.core.config import settings
from app.core.exceptions import extract_error_message, LLMProviderError
from app.services.llm.base import ImagePayload, LLMProvider

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "recommendation": {"type": "string"},
        "final_bcs": {"type": "number", "minimum": 1.0, "maximum": 5.0},
        "confidence": {"type": "string", "enum": ["High", "Medium", "Low"]},
    },
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
                    response_mime_type="application/json",
                    response_schema=_RESPONSE_SCHEMA,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(extract_error_message(exc)) from exc

        if not response.text:
            raise LLMProviderError("Gemini returned no text content.")
        return response.text
