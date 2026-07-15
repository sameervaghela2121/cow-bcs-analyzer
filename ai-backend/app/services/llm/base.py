"""
Every provider (OpenAI, Gemini, Claude, ...) implements this exact interface.
The rest of the app (services/, api/) only ever talks to `LLMProvider`,
never to a concrete SDK. This is what lets you add a new model provider
by dropping in one file, with zero changes anywhere else.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class ImagePayload:
    """A single image, provider-agnostic."""
    bytes_data: bytes
    mime_type: str  # e.g. "image/jpeg"
    label: str | None = None  # e.g. "rear_view", "side_view" - useful for prompting


class LLMProvider(ABC):
    name: str

    @abstractmethod
    async def analyze_images(
        self,
        system_prompt: str,
        user_instruction: str,
        images: list[ImagePayload],
        max_tokens: int = 2000,
    ) -> str:
        """
        Send a system prompt + instruction + N images to the model.
        Must return the raw text response (string) - parsing/validation
        happens one layer up in services/, not here.
        """
        raise NotImplementedError
