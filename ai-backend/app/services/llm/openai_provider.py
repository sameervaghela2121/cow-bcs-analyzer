import base64

from openai import AsyncOpenAI

from app.core.config import settings
from app.core.exceptions import extract_error_message, LLMProviderError
from app.services.llm.base import ImagePayload, LLMProvider


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self) -> None:
        if not settings.OPENAI_API_KEY:
            raise LLMProviderError("OPENAI_API_KEY is not configured.")
        self._client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self._model = settings.OPENAI_VISION_MODEL

    async def analyze_images(
        self,
        system_prompt: str,
        user_instruction: str,
        images: list[ImagePayload],
        max_tokens: int = 2000,
    ) -> str:
        content: list[dict] = [{"type": "text", "text": user_instruction}]
        for img in images:
            b64 = base64.b64encode(img.bytes_data).decode("utf-8")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{img.mime_type};base64,{b64}"},
                }
            )

        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": content},
                ],
            )
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(extract_error_message(exc)) from exc

        message = response.choices[0].message.content if response.choices else None
        if not message:
            raise LLMProviderError("OpenAI returned no text content.")
        return message
