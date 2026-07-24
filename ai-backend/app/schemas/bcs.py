from enum import Enum

from pydantic import BaseModel, Field, field_validator


class ConfidenceLevel(str, Enum):
    high = "High"
    medium = "Medium"
    low = "Low"


class ProviderAssessment(BaseModel):
    """A single provider's BCS assessment result.

    Field names are camelCase (not the usual PEP8 snake_case) on purpose:
    model_dump() writes these keys directly into bcs_analysis.bcsScore in
    Mongo, and the Node backend/frontend read that same document, so the
    naming convention follows the stored/API shape, not the language.
    """
    recommendation: str | None = None
    finalBcs: float | None = Field(default=None, ge=1.0, le=5.0)
    confidence: ConfidenceLevel | None = None
    status: str = "success"
    errorMessage: str | None = None
    # Whether a reviewer picked *this* provider's score as the final one.
    # None = not yet reviewed; a reviewer's Save always resolves every
    # candidate (this + isMeanAccurate/isMedianAccurate on MultiModelBCSResponse)
    # to an explicit True/False, never leaves it None once touched.
    isTrue: bool | None = None

    @field_validator("finalBcs")
    @classmethod
    def round_to_quarter(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return round(v * 4) / 4


class MultiModelBCSResponse(BaseModel):
    """Fan-out response: every configured model answers the same images.
    Each provider is a top-level key with its assessment embedded.

    Mean/median are deliberately absent here - they're a pure function of
    the three providers' finalBcs and are computed fresh wherever they're
    displayed (Node backend's serializer) rather than persisted, so there's
    never a stored value that can drift from the raw scores it's derived from.
    """
    claude: ProviderAssessment = Field(default_factory=ProviderAssessment)
    gemini: ProviderAssessment = Field(default_factory=ProviderAssessment)
    openai: ProviderAssessment = Field(default_factory=ProviderAssessment)
    isMeanAccurate: bool | None = None
    isMedianAccurate: bool | None = None
    # True when the successful providers disagree by more than 0.5 BCS
    # points (max - min) - unlike mean/median this *is* stored, since the
    # Dashboard needs to filter/count on it via a real Mongo query, and it
    # never changes after the providers' scores are set.
    isCritical: bool = False
