from enum import Enum

from pydantic import BaseModel, Field, field_validator


class ConfidenceLevel(str, Enum):
    high = "High"
    medium = "Medium"
    low = "Low"


class ProviderAssessment(BaseModel):
    """A single provider's BCS assessment result."""
    recommendation: str | None = None
    final_bcs: float | None = Field(default=None, ge=1.0, le=5.0)
    confidence: ConfidenceLevel | None = None
    status: str = "success"
    error_message: str | None = None

    @field_validator("final_bcs")
    @classmethod
    def round_to_quarter(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return round(v * 4) / 4


class MultiModelBCSResponse(BaseModel):
    """Fan-out response: every configured model answers the same images.
    Each provider is a top-level key with its assessment embedded."""
    claude: ProviderAssessment = Field(default_factory=ProviderAssessment)
    gemini: ProviderAssessment = Field(default_factory=ProviderAssessment)
    openai: ProviderAssessment = Field(default_factory=ProviderAssessment)
