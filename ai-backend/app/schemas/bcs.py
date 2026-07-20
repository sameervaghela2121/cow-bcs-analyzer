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
    # Whether a reviewer picked *this* provider's score as the final one.
    # None = not yet reviewed; a reviewer's Save always resolves every
    # candidate (this + is_mean_true/is_median_true on MultiModelBCSResponse)
    # to an explicit True/False, never leaves it None once touched.
    is_true: bool | None = None

    @field_validator("final_bcs")
    @classmethod
    def round_to_quarter(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return round(v * 4) / 4


class MultiModelBCSResponse(BaseModel):
    """Fan-out response: every configured model answers the same images.
    Each provider is a top-level key with its assessment embedded.

    Mean/median are deliberately absent here - they're a pure function of
    the three providers' final_bcs and are computed fresh wherever they're
    displayed (Node backend's serializer) rather than persisted, so there's
    never a stored value that can drift from the raw scores it's derived from.
    """
    claude: ProviderAssessment = Field(default_factory=ProviderAssessment)
    gemini: ProviderAssessment = Field(default_factory=ProviderAssessment)
    openai: ProviderAssessment = Field(default_factory=ProviderAssessment)
    is_mean_true: bool | None = None
    is_median_true: bool | None = None
    # True when the successful providers disagree by more than 0.5 BCS
    # points (max - min) - unlike mean/median this *is* stored, since the
    # Dashboard needs to filter/count on it via a real Mongo query, and it
    # never changes after the providers' scores are set.
    is_critical: bool = False
