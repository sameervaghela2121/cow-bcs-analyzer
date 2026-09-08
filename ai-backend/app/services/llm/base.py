"""
Every provider (OpenAI, Gemini, Claude, ...) implements this exact interface.
The rest of the app (services/, api/) only ever talks to `LLMProvider`,
never to a concrete SDK. This is what lets you add a new model provider
by dropping in one file, with zero changes anywhere else.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ImagePayload:
    """A single image, provider-agnostic."""
    bytes_data: bytes
    mime_type: str  # e.g. "image/jpeg"
    label: str | None = None  # e.g. "rear_view", "side_view" - useful for prompting


@dataclass
class LLMUsage:
    """Token usage for one analyze_images() call, as reported by the
    provider's own SDK response - never estimated client-side. Either
    field can be None if a provider's response didn't carry usage data;
    callers (see app/core/pricing.py) must treat that as "cost unknown",
    not zero."""
    input_tokens: int | None = None
    output_tokens: int | None = None


@dataclass
class LLMResult:
    """What analyze_images() returns: the raw text response plus the
    usage needed to cost it. `text` is unparsed - parsing/validation still
    happens one layer up in services/, not here."""
    text: str
    usage: LLMUsage = field(default_factory=LLMUsage)


class LLMProvider(ABC):
    name: str
    model: str

    @abstractmethod
    async def analyze_images(
        self,
        system_prompt: str,
        user_instruction: str,
        images: list[ImagePayload],
        max_tokens: int = 2000,
    ) -> LLMResult:
        """
        Send a system prompt + instruction + N images to the model.
        Must return an LLMResult - the raw text response (string) plus
        token usage for cost logging - parsing/validation happens one
        layer up in services/, not here.
        """
        raise NotImplementedError
