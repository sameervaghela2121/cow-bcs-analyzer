# FastAPI GenAI Vision Service (multi-provider template)

Structured for the AI-TOPIK Coach stack (Strapi backend + this as a satellite
vision/GenAI microservice), but generic enough for any FastAPI + LLM project.

## Folder structure

```
bcs-fastapi-service/
├── app/
│   ├── main.py                     # app factory, middleware, router mount
│   │
│   ├── core/                       # cross-cutting infra, no business logic
│   │   ├── config.py                #   pydantic-settings: all env vars/keys live here
│   │   ├── logging.py
│   │   └── exceptions.py            #   AppError hierarchy + FastAPI exception handlers
│   │
│   ├── api/                        # HTTP layer only — thin, no logic
│   │   ├── deps.py                  #   shared dependencies (e.g. provider selection)
│   │   ├── router.py                #   aggregates all endpoint routers
│   │   └── endpoints/
│   │       └── bcs.py               #   POST /api/bcs/assess/{analysis_id} (Mongo-id-driven, N-image endpoint)
│   │
│   ├── schemas/                    # Pydantic request/response contracts
│   │   └── bcs.py                   #   BCSResponse, BCSAssessment, Landmarks, etc.
│   │
│   ├── services/                   # business logic — orchestration, not I/O plumbing
│   │   ├── bcs_service.py           #   ties prompt + provider + parser together
│   │   └── llm/                     #   <-- THE MULTI-PROVIDER LAYER
│   │       ├── base.py               #     LLMProvider ABC + ImagePayload dataclass
│   │       ├── claude_provider.py    #     Anthropic implementation
│   │       ├── gemini_provider.py    #     Google GenAI implementation
│   │       ├── openai_provider.py    #     OpenAI implementation
│   │       └── factory.py            #     name -> provider instance registry
│   │
│   ├── prompts/                    # prompt TEXT lives here, not in Python strings
│   │   ├── loader.py                 #   cached file loader
│   │   └── bcs/
│   │       ├── bcs_system_prompt.md   #   your exact expert BCS prompt, verbatim
│   │       └── bcs_json_addendum.md   #   reusable "also emit this JSON schema" wrapper
│   │
│   ├── utils/                      # small stateless helpers
│   │   ├── image_utils.py            #   blob validation (type/size)
│   │   └── json_parser.py            #   pulls ```json block out of narrative text
│   │
│   ├── models/                     # (empty for now) SQLAlchemy/DB models, if you
│   │                                 #   later persist assessment history
│   └── tests/
│       └── test_bcs_endpoint.py
│
├── requirements.txt
├── .env.example
└── README.md
```

## Why this shape

- **`services/llm/` is the whole point.** Every provider implements the same
  `LLMProvider.analyze_images()` interface. `bcs_service.py` (and any future
  service) never imports `openai`, `anthropic`, or `google.genai` directly —
  only `factory.get_llm_provider(name)`. Swapping the default model, A/B
  testing providers, or adding Mistral/Bedrock later is a one-file change.
- **`prompts/` is data, not code.** Your BCS prompt is stored verbatim as a
  `.md` file. Non-engineers can iterate on prompt wording via PR without
  touching Python. Each feature gets its own subfolder
  (`prompts/bcs/`, later `prompts/intro_sections/`, etc.).
- **Structured JSON without fighting the prompt.** Your BCS prompt is
  intentionally narrative (landmark reasoning, caveats, FINAL BCS line) —
  that's good, it's auditable by a human. Rather than rewriting it to force
  raw JSON, `bcs_json_addendum.md` is appended at request time asking the
  model to *also* emit a fenced JSON block at the end. `utils/json_parser.py`
  extracts and validates it. You keep the human-readable narrative (returned
  in `narrative` field) **and** a strict `BCSAssessment` Pydantic object.
- **`api/` stays thin.** The endpoint just validates the uploads and calls
  the service — no LLM/parsing logic in the route itself, so it's easy to
  unit test the service independently of HTTP.

## The endpoint

**Every configured model answers the same images, concurrently.** This is
not "pick one provider" — it's a fan-out: Gemini, Claude, and OpenAI all get
the exact same prompt + images in parallel (`asyncio.gather`), and you get
all their answers back side by side. Useful for cross-checking a genuinely
subjective visual task like BCS scoring, or for comparing model quality/cost
before committing to one in production.

```
POST /api/bcs/assess/{analysis_id}

analysis_id: the _id of a document in the `cow_bcs_analysis` MongoDB collection.
             That document's `cow_images` field is a list of gs:// GCS URIs
             (e.g. "gs://my-bucket/cow/9999/photo-1.jpg") - each one is
             downloaded via the GCS client and all of them go into the same
             LLM call (1 image or 10, they're all assessed together as one
             cow). Plain http(s):// URLs are also accepted as a fallback.

Requires GCS credentials to be resolvable: set GOOGLE_APPLICATION_CREDENTIALS
to a service-account key file path (optionally GCS_PROJECT_ID too), or rely
on Application Default Credentials when running on GCP/Cloud Run.

optional query param: ?providers=gemini,claude   (default = ALL configured providers)
```

Response (`MultiModelBCSResponse`):
```json
{
  "results": [
    {
      "provider": "gemini",
      "assessments": [
        {
          "animal_id": "animal_1",
          "landmarks": { "hooks": "...", "pins": "...", "tailhead": "...", "ribs": "...", "spine": "..." },
          "caveats": ["diagonal stance, reduced confidence on hook angle"],
          "recommendation": "within healthy range, no action needed",
          "final_bcs": 3.25,
          "confidence": "High"
        }
      ],
      "narrative": "<full original model text, for audit / display in UI>"
    },
    {
      "provider": "claude",
      "assessments": [ { "...": "..." } ],
      "narrative": "..."
    }
  ],
  "errors": [
    { "provider": "openai", "error": "OpenAI call failed: rate limit exceeded" }
  ]
}
```

- **`results`** — one entry per provider that succeeded and returned valid,
  schema-matching JSON.
- **`errors`** — one entry per provider that failed (bad key, timeout, quota,
  or the model returned unparseable output). A failure here never blocks the
  other providers' results — you always get back whatever succeeded.
- If **all** providers fail, the endpoint itself returns a `502` (`LLMProviderError`).

## Adding a future feature (e.g. your GitHub MCP PR tool, or a new vision task)

1. `app/prompts/<feature>/*.md` — the prompt(s).
2. `app/schemas/<feature>.py` — response contract.
3. `app/services/<feature>_service.py` — orchestration (reuses the same
   `services/llm/factory.py`, no new provider code needed unless it's a new LLM).
4. `app/api/endpoints/<feature>.py` — the route.
5. Register it in `app/api/router.py`.

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in the keys you actually use
uvicorn app.main:app --reload
# Swagger UI: http://localhost:8000/docs
```
