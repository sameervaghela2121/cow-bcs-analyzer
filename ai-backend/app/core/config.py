"""
Central app configuration.
All provider API keys / model names live here so services never read
os.environ directly. This is what keeps the LLM layer swappable.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    APP_NAME: str = "BCS-Tracker/ Vision GenAI Service"
    ENV: str = "local"
    DEBUG: bool = True

    # --- Which provider to use by default (can be overridden per-request) ---
    DEFAULT_LLM_PROVIDER: str = "gemini"  # "gemini" | "claude" | "openai"

    # --- Generation params shared across providers ---
    # NOTE: claude-sonnet-5 and gpt-5.1 both reject any non-default temperature
    # (400 error) - only the model default (1) is accepted, so this is only
    # wired into gemini_provider.py. See claude_provider.py / openai_provider.py
    # for details.
    LLM_TEMPERATURE: float = 0.0

    # --- OpenAI ---
    OPENAI_API_KEY: str | None = None
    OPENAI_VISION_MODEL: str = "gpt-4.1"

    # --- Anthropic / Claude ---
    ANTHROPIC_API_KEY: str | None = None
    CLAUDE_VISION_MODEL: str = "claude-sonnet-4-6"

    # --- Google Gemini ---
    GEMINI_API_KEY: str | None = None
    GEMINI_VISION_MODEL: str = "gemini-2.5-pro"

    # --- Upload limits ---
    MAX_IMAGE_SIZE_MB: int = 10
    ALLOWED_IMAGE_TYPES: tuple[str, ...] = ("image/jpeg", "image/png", "image/webp")

    # --- AWS S3 ---
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str | None = None

    # --- MongoDB ---
    MONGODB_URL: str | None = None

    # --- Google Cloud Storage ---
    GCS_BUCKET_NAME: str = "sameerv-cow-bcs-images"
    GCS_PROJECT_ID: str | None = "sameerv"
    GCS_KEY_FILE: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
