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
    # Whether a reviewer picked *this* provider's score as the final one
    # (as opposed to the mean or median) - always false coming out of
    # assess_bcs; a reviewer flips it later, same idea as median_bcs_score's.
    is_selected: bool = False

    @field_validator("final_bcs")
    @classmethod
    def round_to_quarter(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return round(v * 4) / 4


class MedianBcsScore(BaseModel):
    """Median of final_bcs across whichever providers succeeded, alongside
    whether a reviewer has picked it as the final score for this analysis."""
    score: float | None = Field(default=None, ge=1.0, le=5.0)
    is_selected: bool = False


class MultiModelBCSResponse(BaseModel):
    """Fan-out response: every configured model answers the same images.
    Each provider is a top-level key with its assessment embedded."""
    claude: ProviderAssessment = Field(default_factory=ProviderAssessment)
    gemini: ProviderAssessment = Field(default_factory=ProviderAssessment)
    openai: ProviderAssessment = Field(default_factory=ProviderAssessment)
    mean_bcs_score: float | None = Field(
        default=None,
        ge=1.0,
        le=5.0,
        description=(
            "Average of final_bcs across only the providers that actually "
            "succeeded - divided by however many that was (1, 2, or 3), not "
            "a fixed count."
        ),
    )
    median_bcs_score: MedianBcsScore = Field(default_factory=MedianBcsScore)
