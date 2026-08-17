import base64

from anthropic import AsyncAnthropic

from app.core.config import settings
from app.core.exceptions import extract_error_message, LLMProviderError
from app.services.llm.base import ImagePayload, LLMProvider


class ClaudeProvider(LLMProvider):
    name = "claude"

    def __init__(self) -> None:
        self._client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self._model = settings.CLAUDE_VISION_MODEL

    async def analyze_images(
        self,
        system_prompt: str,
        user_instruction: str,
        images: list[ImagePayload],
        max_tokens: int = 2000,
    ) -> str:
        content: list[dict] = []
        for img in images:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": img.mime_type,
                        "data": base64.b64encode(img.bytes_data).decode("utf-8"),
                    },
                }
            )
            if img.label:
                content.append({"type": "text", "text": f"[Image above is: {img.label}]"})
        content.append({"type": "text", "text": user_instruction})

        try:
            # NOTE: no `temperature` here on purpose - claude-sonnet-5 rejects
            # any non-default temperature (400 invalid_request_error). Other
            # providers get settings.LLM_TEMPERATURE; Claude always runs at
            # its default sampling.
            response = await self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[{"role": "user", "content": content}],
            )
        except Exception as exc:  # noqa: BLE001
            raise LLMProviderError(extract_error_message(exc)) from exc

        text_blocks = [b.text for b in response.content if b.type == "text"]
        if not text_blocks:
            raise LLMProviderError("Claude returned no text content.")
        return "\n".join(text_blocks)
