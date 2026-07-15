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
    APP_NAME: str = "AI-TOPIK / Vision GenAI Service"
    ENV: str = "local"
    DEBUG: bool = True

    # --- Which provider to use by default (can be overridden per-request) ---
    DEFAULT_LLM_PROVIDER: str = "gemini"  # "gemini" | "claude" | "openai"

    # --- OpenAI ---
    OPENAI_API_KEY: str | None = None
    OPENAI_VISION_MODEL: str = "gpt-4.1"

    # --- Anthropic / Claude (via AWS Bedrock) ---
    ANTHROPIC_API_KEY: str | None = None  # bearer token for Bedrock (optional)
    CLAUDE_VISION_MODEL: str = "anthropic.claude-sonnet-4-6"

    # --- AWS credentials (for Bedrock) ---
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None

    # --- Google Gemini ---
    GEMINI_API_KEY: str | None = None
    GEMINI_VISION_MODEL: str = "gemini-2.5-pro"

    # --- Upload limits ---
    MAX_IMAGE_SIZE_MB: int = 10
    ALLOWED_IMAGE_TYPES: tuple[str, ...] = ("image/jpeg", "image/png", "image/webp")

    # --- AWS S3 / Bedrock region ---
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str | None = None

    # --- MongoDB ---
    MONGODB_URL: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
