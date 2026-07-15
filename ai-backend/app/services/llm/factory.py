"""
Single place that knows how to turn a provider name into an LLMProvider.
Add a new provider (e.g. "mistral") by:
  1. creating app/services/llm/mistral_provider.py implementing LLMProvider
  2. registering it in _PROVIDERS below
Nothing else in the codebase changes.
"""
from app.core.exceptions import LLMProviderError
from app.services.llm.base import LLMProvider
from app.services.llm.claude_provider import ClaudeProvider
from app.services.llm.gemini_provider import GeminiProvider
from app.services.llm.openai_provider import OpenAIProvider

_PROVIDERS: dict[str, type[LLMProvider]] = {
    "claude": ClaudeProvider,
    "gemini": GeminiProvider,
    "openai": OpenAIProvider,
}


def get_llm_provider(name: str) -> LLMProvider:
    provider_cls = _PROVIDERS.get(name.lower())
    if provider_cls is None:
        raise LLMProviderError(
            f"Unknown LLM provider '{name}'. Available: {list(_PROVIDERS)}"
        )
    return provider_cls()


def get_all_provider_names() -> list[str]:
    """Used when the caller wants every configured model to answer, not just one."""
    return list(_PROVIDERS.keys())
