from fastapi import Query


def get_provider_filter(
    providers: str | None = Query(
        default=None,
        description=(
            "Optional comma-separated subset of models to query, e.g. "
            "'gemini,claude'. Omit to fan out to ALL configured providers."
        ),
    )
) -> list[str] | None:
    if not providers:
        return None
    return [p.strip().lower() for p in providers.split(",") if p.strip()]
