# BCS FastAPI Service (multi-provider vision GenAI)

The AI microservice for the BCS (Body Condition Scoring) cattle platform.
Given a set of cow photos already sitting in Google Cloud Storage, it sends
them to every configured vision LLM (Gemini, Claude via AWS Bedrock, OpenAI)
in parallel, reconciles their answers into one `mean_bcs_score`, and persists
the result to the shared MongoDB `bcs_analysis` collection. Deployed on
Cloud Run; called directly by the frontend and, for local smoke-testing, via
a standalone multipart endpoint.

## Folder structure

```
ai-backend/
├── app/
│   ├── main.py                       # app factory, CORS, router mount, Mongo lifespan
│   │
│   ├── core/                         # cross-cutting infra, no business logic
│   │   ├── config.py                  #   pydantic-settings: all env vars/keys live here
│   │   ├── logging.py
│   │   └── exceptions.py              #   AppError hierarchy + FastAPI exception handlers
│   │
│   ├── api/                          # HTTP layer only — thin, no logic
│   │   ├── deps.py                    #   shared dependencies (e.g. provider selection)
│   │   ├── router.py                  #   aggregates all endpoint routers under /api
│   │   └── endpoints/
│   │       └── bcs.py                 #   POST /assess (smoke test) + POST /analyze/{id} (real flow)
│   │
│   ├── schemas/
│   │   └── bcs.py                     #   ProviderAssessment, MultiModelBCSResponse
│   │
│   ├── db/
│   │   └── mongo.py                   #   bcs_analysis reads/writes (motor, async)
│   │
│   ├── services/                     # business logic — orchestration, not I/O plumbing
│   │   ├── bcs_service.py             #   ties prompt + provider fan-out + mean score together
│   │   ├── gcs_service.py             #   downloads cow photos straight from GCS (gs:// URIs)
│   │   └── llm/                       #   <-- THE MULTI-PROVIDER LAYER
│   │       ├── base.py                 #     LLMProvider ABC + ImagePayload dataclass
│   │       ├── claude_provider.py      #     Anthropic (via AWS Bedrock) implementation
│   │       ├── gemini_provider.py      #     Google GenAI implementation
│   │       ├── openai_provider.py      #     OpenAI implementation
│   │       └── factory.py              #     name -> provider instance registry
│   │
│   ├── prompts/                      # prompt TEXT lives here, not in Python strings
│   │   ├── loader.py                   #   cached file loader
│   │   └── bcs/
│   │       ├── bcs_system_prompt.md     #   the exact expert BCS prompt, verbatim
│   │       └── bcs_json_addendum.md     #   reusable "also emit this JSON schema" wrapper
│   │
│   ├── utils/                        # small stateless helpers
│   │   ├── image_utils.py              #   multipart blob validation (type/size)
│   │   └── json_parser.py              #   pulls the ```json block out of narrative text
│   │
│   └── tests/
│       ├── conftest.py                 #   dummy provider API keys so tests never need real ones
│       ├── test_bcs_endpoint.py        #   /assess: fan-out, mean score, per-image tolerance
│       ├── test_analyze_endpoint.py    #   /analyze/{id}: status transitions, error handling
│       └── test_gcs_service.py         #   gs:// URI parsing + download
│
├── requirements.txt
├── Dockerfile                        # uvicorn on :8080, deployed as-is to Cloud Run
├── docker-compose.yml                # local container run, reads .env
├── .github/workflows/deploy-cloudrun.yml   # auto-deploys on push to main
├── scripts/setup-gcp-secrets.sh      # one-time Secret Manager setup for the keys below
└── README.md
```

## Why this shape

- **`services/llm/` is the whole point.** Every provider implements the same
  `LLMProvider.analyze_images()` interface. `bcs_service.py` never imports
  `openai`, `anthropic`, or `google.genai` directly — only
  `factory.get_llm_provider(name)`. Swapping the default model, A/B testing
  providers, or adding a new one later is a one-file change.
- **`prompts/` is data, not code.** The BCS prompt is stored verbatim as a
  `.md` file. Non-engineers can iterate on prompt wording via PR without
  touching Python.
- **Structured JSON without fighting the prompt.** The BCS prompt is
  intentionally narrative (landmark reasoning, caveats, FINAL BCS line) —
  that's good, it's auditable by a human. Rather than rewriting it to force
  raw JSON, `bcs_json_addendum.md` is appended at request time asking the
  model to *also* emit a fenced JSON block at the end, which
  `utils/json_parser.py` extracts.
- **`api/` stays thin.** Both endpoints just acquire images and call
  `bcs_service.assess_bcs()` — no LLM/parsing logic in the route itself, so
  the service is easy to unit test independently of HTTP.
- **`services/gcs_service.py` and `db/mongo.py` are the only things that know
  about GCS/Mongo.** Swapping storage or the database later doesn't touch
  `bcs_service.py` or the LLM layer at all.

## The two endpoints

**Every configured model answers the same images, concurrently.** This is
not "pick one provider" — it's a fan-out: Gemini, Claude, and OpenAI all get
the exact same prompt + images in parallel (`asyncio.gather`), and you get
all their answers back side by side.

### `POST /api/bcs/analyze/{bcs_analysis_id}` — the real flow

What the frontend actually calls, directly from the browser, right after it
finishes uploading a cow's photos straight to GCS via signed URLs. `bcs_analysis_id`
is the Mongo `_id` of a record (created by the Node backend) shaped like:

```json
{ "_id": "...", "status": "not_started", "cowsImages": ["gs://bucket/3124/ts/a.jpg", "..."] }
```

Flow:
1. Validates the id, 404s if the record doesn't exist, 409s if it's already `processing`/`completed`.
2. Flips `status` to `processing` and returns `202` immediately.
3. In the background: downloads every image in `cowsImages` from GCS, sends
   all of them — together, in one call per provider — to every configured
   LLM, and writes the result back onto the record:
   - `status: "completed"`, `bcsScore: <MultiModelBCSResponse>` on success.
   - `status: "failed"`, `errorMessage: "..."` if every image failed or every provider failed.

**Partial failures are tolerated at both layers, not just one:**
- One image failing to download (size limit, wrong content-type, a broken
  GCS object) never aborts the whole analysis — it's skipped, and the record
  still completes using whichever images did download. If any were skipped,
  the completed record also carries a `skippedImages: ["gs://...: <reason>"]` field.
- One LLM provider failing (bad key, rate limit, unparseable output) never
  blocks the others — you still get a result from whichever providers
  succeeded.
- Only if **every single image** fails to download, or **every single
  provider** fails to answer, does the analysis itself fail.

### `POST /api/bcs/assess` — multipart smoke test

Independent of MongoDB entirely — a standalone way to sanity-check provider
wiring or prompt changes without touching the real `bcs_analysis` flow.

```
POST /api/bcs/assess
Content-Type: multipart/form-data

field: images   (one or more image files, send as multiple `images` parts)

optional query param: ?providers=gemini,claude   (default = ALL configured providers)
```

Response (`MultiModelBCSResponse`) — identical shape to what gets stored as
`bcsScore` on a `bcs_analysis` record:

```json
{
  "claude":  { "recommendation": "...", "final_bcs": 3.25, "confidence": "High", "status": "success", "error_message": null, "is_selected": false },
  "gemini":  { "recommendation": "...", "final_bcs": 3.5,  "confidence": "High", "status": "success", "error_message": null, "is_selected": false },
  "openai":  { "recommendation": null,  "final_bcs": null, "confidence": null,  "status": "error",   "error_message": "rate limit exceeded", "is_selected": false },
  "mean_bcs_score": 3.25,
  "median_bcs_score": { "score": 3.25, "is_selected": false }
}
```

- Each provider is a top-level key with its own assessment embedded — `status: "error"` for a provider that failed, with no `final_bcs`/`confidence`.
- **`mean_bcs_score`** is the average `final_bcs` across only the providers that actually succeeded, divided by however many that was (1, 2, or 3 — never a fixed count), rounded to the nearest 0.25 to match every other BCS score in the system. `None` only if every provider failed, in which case the endpoint itself returns `502` (`LLMProviderError`) instead.
- **`median_bcs_score.score`** is the median of the same successful providers' `final_bcs`, rounded to the nearest 0.25 the same way.
- **`is_selected`** (on every provider *and* on `median_bcs_score`) is always `false` coming out of this endpoint — it exists for a reviewer to flip later, marking which one of mean/median/a specific provider's score was picked as the final value for that analysis. Not written anywhere by this service itself.

## Environment variables

No `.env.example` currently in the repo — set these directly in `ai-backend/.env` for local dev (see `docker-compose.yml`, which reads `.env` too), or as Cloud Run secrets/env vars in production (see `scripts/setup-gcp-secrets.sh` and `.github/workflows/deploy-cloudrun.yml`).

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY`, `OPENAI_VISION_MODEL` | OpenAI provider |
| `ANTHROPIC_API_KEY`, `CLAUDE_VISION_MODEL` | Claude provider (via AWS Bedrock) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | Bedrock credentials for Claude |
| `GEMINI_API_KEY`, `GEMINI_VISION_MODEL` | Gemini provider |
| `MONGODB_URL` | `bcs_analysis` reads/writes |
| `GCS_BUCKET_NAME`, `GCS_PROJECT_ID`, `GCS_KEY_FILE` | Where cow photos live; `GCS_KEY_FILE` is a service-account JSON path, optional if running with Application Default Credentials |
| `MAX_IMAGE_SIZE_MB`, `ALLOWED_IMAGE_TYPES` | Per-image validation limits (both endpoints) |
| `DEFAULT_LLM_PROVIDER`, `ENV`, `DEBUG` | Misc app config |

## Testing

```bash
pytest -q
```

Every test mocks the LLM providers, GCS, and Mongo — nothing hits a real API,
bucket, or database. `conftest.py` seeds dummy provider keys so provider
constructors don't fail at import time even though `analyze_images` itself is
always mocked.

## Run locally

```bash
pip install -r requirements.txt
# create ai-backend/.env with the variables listed above
uvicorn app.main:app --reload
# Swagger UI: http://localhost:8000/docs
```

Or via Docker (same image Cloud Run runs):

```bash
docker compose up --build
# service on http://localhost:8000
```

## Deployment

Auto-deploys to **Cloud Run** on every push to `main` via
`.github/workflows/deploy-cloudrun.yml`: builds the `Dockerfile` image, pushes
it to Artifact Registry, deploys with secrets pulled live from Secret Manager
(`--set-secrets`), and only routes traffic to the new revision once it's up.

One-time setup before the first deploy: run `scripts/setup-gcp-secrets.sh`
(prompts for each provider key + `MONGODB_URL` and writes them to Secret
Manager), and make sure the GitHub Actions workflow's secrets
(`GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
`GCP_SERVICE_ACCOUNT_EMAIL`) are configured on the repo.

## Adding a future feature

1. `app/prompts/<feature>/*.md` — the prompt(s).
2. `app/schemas/<feature>.py` — response contract.
3. `app/services/<feature>_service.py` — orchestration (reuses the same
   `services/llm/factory.py`, no new provider code needed unless it's a new LLM).
4. `app/api/endpoints/<feature>.py` — the route.
5. Register it in `app/api/router.py`.
