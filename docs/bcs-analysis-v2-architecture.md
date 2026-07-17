# BCS Tracker v2 Architecture — Schema, GCS Upload Flow, API Contracts

Supersedes the media-storage and review/audit-approval sections of `docs/module-and-api-spec.md`
(Decision D7 "media storage" is now resolved: GCS, not S3/GridFS/local disk; the review/override
workflow described there is removed for now — see §5).

This is a from-scratch database: the app was re-pointed at a fresh MongoDB instance alongside this
change, so there is no legacy data and no backward compatibility with the old `Reading`/`Media`/
denormalized-`Cow` schema.

**Audience**: this document is the single source of truth for all three components —
`backend/` (Node, built and owned by this team), `ai-backend/` (Python/FastAPI, owned by a
separate developer — §4 is their spec, not yet implemented), and `frontend/` (deferred, not yet
built — §5 is its contract).

---

## 1. Collections

Five MongoDB collections exist going forward. All Mongoose models live in `backend/src/models/`.

### `cows`

```js
{
  _id: ObjectId,
  cowsId: String,   // unique, e.g. "3124" — the human-entered tag, NOT the Mongo _id
  createdAt: Date,
  updatedAt: Date,
}
```
Minimal by design — no breed/pen/lactation/score fields. Created lazily via find-or-create the
first time a `cowsId` is uploaded against.

### `bcs_analysis`

```js
{
  _id: ObjectId,
  cow: ObjectId,          // ref Cow._id
  cowsId: String,         // denormalized copy of the tag, for filtering without a join
  cowsImages: [String],   // GCS object paths, gs://<bucket>/<cowsId>/<batchTimestamp>/<filename>
  bcsScore: Object,        // {} until the AI backend writes the raw multi-provider result
  status: String,          // 'not_started' | 'processing' | 'completed' | 'failed'
  errorMessage: String,    // null unless status === 'failed'
  createdBy: ObjectId,     // ref User._id
  updatedBy: ObjectId,     // ref User._id
  createdAt: Date,
  updatedAt: Date,
}
```
One document per upload batch (however many photos the user selects in one go). Replaces the old
`Reading`+`Media` pair — images are plain strings now, there is no per-image document.

### `users` — unchanged

```js
{
  _id, email, name, role: 'admin'|'staff', status: 'pending'|'active',
  passwordHash, inviteTokenHash, inviteTokenExpiresAt, invitedBy: ObjectId,
  refreshTokenVersion, createdAt, updatedAt,
}
```

### `invitations` — new, append-only log

```js
{
  _id: ObjectId,
  user: ObjectId,        // ref User._id — the invited user's doc
  invitedBy: ObjectId,   // ref User._id — who sent it
  email: String,
  status: String,        // 'sent' | 'failed'
  errorMessage: String,  // null unless status === 'failed'
  createdAt: Date,
  updatedAt: Date,
}
```
One row is created every time `POST /api/users/invite` runs — never upserted. This is the log of
"an invitation was sent," independent of the `User` document's own lifecycle. There is currently no
resend endpoint (inviting an email that already has a `User` doc still returns `409`) — only the
single initial invite path writes to this collection today.

### `audit_logs` — unchanged, dormant

```js
{ _id, cow: ObjectId, reading: ObjectId, user: ObjectId, action: 'approved'|'overridden', oldScore, newScore, createdAt, updatedAt }
```
Schema and read API (`GET /api/audit`) are untouched. Nothing writes to it anymore — the
review/override workflow that used to write these rows was removed (§ below), since the data it
depended on (`Reading.score`/`providerResults`, `Cow.latestScore`/`flagged`/`sharpDrop`) no longer
exists in the new schema. Reintroducing review/override on top of the new schema is future work,
out of scope here.

---

## 2. GCS bucket

- **Bucket**: `gs://sameerv-cow-bcs-images` (project `sameerv`, region `us-central1`).
- **Private**: uniform bucket-level access enabled, public access prevention **enforced** — no
  object is ever publicly readable. All access is via IAM-bound service accounts or short-lived
  signed URLs.
- **Layout**: `gs://sameerv-cow-bcs-images/<cowsId>/<batchTimestamp>/<filename>`
  - `<cowsId>` — reused across every upload session for that cow (just a string prefix, nothing
    to explicitly "create" — GCS has no real directories).
  - `<batchTimestamp>` — a sanitized ISO-8601 timestamp (`:`/`.` replaced with `-`, e.g.
    `2026-07-16T10-15-30-123Z`), computed **once per upload batch** and reused for every file in
    that batch, so one upload session's photos land together in their own folder.
- **Service accounts** (both scoped to just this bucket, not project-wide IAM):
  - `bcs-backend-uploader@sameerv.iam.gserviceaccount.com` — `roles/storage.objectAdmin` on the
    bucket. Used by the Node backend to sign V4 upload (PUT) URLs. Key stored at
    `backend/credentials/gcs-key.json` (gitignored), referenced via `GCS_KEY_FILE`.
  - `bcs-ai-backend-reader@sameerv.iam.gserviceaccount.com` — `roles/storage.objectViewer` on the
    bucket. For the AI backend to fetch image bytes directly (not via presigned URLs, which may
    have expired by the time analysis runs). Key stored at `ai-backend/credentials/gcs-key.json`
    (gitignored) — provisioned already; the AI-backend developer just needs to wire it in (§4).
- Both accounts/bindings/keys were provisioned via `gcloud` and verified with a live signed-URL +
  PUT smoke test against the real bucket.

---

## 3. Node backend API (`backend/`, implemented)

All routes require `Authorization: Bearer <access token>` (`requireAuth()`), same as before.

### `POST /api/bcs-analysis/upload-urls`
Request:
```json
{ "cowsId": "3124", "files": [{ "filename": "a.jpg", "contentType": "image/jpeg" }] }
```
Find-or-creates the `Cow` doc for `cowsId`, computes one `batchTimestamp`, returns one V4 signed
PUT URL per file:
```json
{
  "cowsId": "3124",
  "batchTimestamp": "2026-07-16T10-15-30-123Z",
  "uploads": [
    { "filename": "a.jpg", "gsUri": "gs://sameerv-cow-bcs-images/3124/2026-07-16T10-15-30-123Z/a.jpg",
      "uploadUrl": "https://storage.googleapis.com/..." }
  ]
}
```
**Content-type is bound into the signed URL** — the caller's `PUT` must send the exact same
`Content-Type` header or GCS rejects the upload with `403`.

### `POST /api/bcs-analysis`
Request: `{ "cowsId": "3124", "cowsImages": ["gs://sameerv-cow-bcs-images/3124/.../a.jpg"] }`
(each entry must start with `gs://`). Creates the `bcs_analysis` record: `status: 'not_started'`,
`bcsScore: {}`, `createdBy`/`updatedBy` = the authenticated user. `201` with the full record
including `_id`.

### `GET /api/bcs-analysis/:id`
Returns the current record (`status`, `bcsScore`, `errorMessage`, etc.) — the polling endpoint.
`404` if the id doesn't exist or isn't a valid ObjectId.

### `GET /api/cows/:cowsId/analyses`
Paginated list of `bcs_analysis` records for a cow, most recent first.

### `POST /api/users/invite` — unchanged request/response shape
Still creates a pending `User` + sends the invite email; now also writes an `Invitation` row
(`status: 'sent'` on success, `status: 'failed'` + `errorMessage` if the email send throws, in
which case the `500` is still returned to the caller — same as before, just now logged).

---

## 4. AI-backend requirements (`ai-backend/`, spec only — NOT implemented by this team)

Owned by a separate developer. This section is the full contract for what needs to be built.

**Connect directly to the same MongoDB** the Node backend uses (`MONGODB_URL`), reading/writing the
`bcs_analysis` collection. `motor` is already an `ai-backend/requirements.txt` dependency; there's
an existing-but-currently-disconnected `app/db/mongo.py` (has `get_db()`/`close_connection()`
already, plus a dead `save_assessment()` writing to an unrelated `bcs_assessments` collection that
should be removed) — repurpose that file rather than starting from zero. Add two functions:
`get_bcs_analysis(analysis_id: ObjectId) -> dict | None` and
`update_bcs_analysis(analysis_id: ObjectId, fields: dict) -> None`.

**BSON/field-name compatibility**: Mongoose field names are used verbatim (camelCase) —
`cow`/`createdBy`/`updatedBy` are native BSON `ObjectId` (read back by `pymongo`/`motor` as
`bson.ObjectId` automatically, no conversion needed); `cowsImages` is `[str]` of `gs://` URIs;
`bcsScore` is an arbitrary object, written verbatim; `status` is one of
`not_started|processing|completed|failed`. Only write `status`, `bcsScore`, `errorMessage`,
`updatedAt` — never touch Mongoose-managed fields like `__v`.

**New endpoint**: `POST /api/bcs/analyze/{bcs_analysis_id}` (mounted under the existing `/api/bcs`
prefix in `app/api/router.py`). Contract:
1. Parse `bcs_analysis_id` as `ObjectId`; `404` if invalid or record not found.
2. `409` if `status` is already `processing` or `completed` (guards against double-processing;
   `not_started` and `failed` are both valid entry points — `failed` acts as a retry).
3. Set `status: 'processing'` immediately, respond `202` (don't block the HTTP response on the LLM
   calls — mirrors the old Node "fire-and-forget" pattern; FastAPI `BackgroundTasks` is a
   reasonable way to do this, understanding that an in-process crash mid-analysis leaves the record
   stuck at `processing` with no automatic retry — same limitation the old Node job had, not a new
   regression, but worth a real task queue eventually).
4. For each path in `cowsImages`, fetch the object from GCS using the AI backend's **own**
   service-account credentials (key at `ai-backend/credentials/gcs-key.json`,
   `bcs-ai-backend-reader@sameerv.iam.gserviceaccount.com`, `roles/storage.objectViewer` on
   `gs://sameerv-cow-bcs-images`) — do **not** rely on a presigned URL stored anywhere, none exists
   at analysis time. `google-cloud-storage`'s client is synchronous; wrap the download in
   `asyncio.to_thread` to avoid blocking the event loop. Produce the same `ImagePayload` shape
   (`app/services/llm/base.py`) that `validate_and_load_image` already produces from uploaded files.
5. Run the existing, **unchanged** `assess_bcs(images=payloads)` (`app/services/bcs_service.py`) —
   it already fans out to all three providers concurrently and returns a `MultiModelBCSResponse`.
6. On success: `update_bcs_analysis(id, {status: 'completed', bcsScore: result.model_dump()})`.
7. On any exception: `update_bcs_analysis(id, {status: 'failed', errorMessage: str(exc)})`.

**New dependency**: `google-cloud-storage` in `requirements.txt`.

**New config** (`app/core/config.py`, `pydantic-settings`): `GCS_BUCKET_NAME` (default
`sameerv-cow-bcs-images`, matching the Node side), `GCS_PROJECT_ID` (`sameerv`), `GCS_KEY_FILE`.
**Important**: unlike Node's `dotenv` (which mutates real `process.env`, so libraries doing their
own ADC lookup can see it), `pydantic-settings`'s `.env` parsing does **not** touch `os.environ` —
so the GCS client must be constructed explicitly via `storage.Client.from_service_account_json(settings.GCS_KEY_FILE, ...)`
rather than relying on implicit ADC discovery, whenever `GCS_KEY_FILE` is set only in `.env`.

**Old `POST /api/bcs/assess`** (multipart, existing): keep it as-is. Nothing in the new flow calls
it, but it's still useful as a standalone smoke-test endpoint independent of MongoDB state, and it's
the only thing currently covered by `app/tests/test_bcs_endpoint.py`.

---

## 5. Frontend integration contract (deferred — not built yet)

For whoever builds this next:

1. User enters/selects a `cowsId` and picks photo files.
2. `POST /api/bcs-analysis/upload-urls` with `{cowsId, files: [{filename, contentType}]}`.
3. For each returned `{filename, uploadUrl}`, `PUT` the raw file bytes directly to `uploadUrl` with
   `Content-Type` matching exactly what was sent in step 2 (GCS will `403` on a mismatch).
4. Once all `PUT`s succeed, collect the `gsUri` values and call
   `POST /api/bcs-analysis {cowsId, cowsImages: [gsUri, ...]}`. Response includes the record `_id`.
5. Call the AI backend directly (not through Node): `POST {AI_BACKEND_URL}/api/bcs/analyze/{_id}`.
6. Poll `GET /api/bcs-analysis/:id` (e.g. every 2s, same pattern as the old `usePollReading` hook)
   until `status` is `completed` or `failed`; render `bcsScore` or `errorMessage` accordingly.

Note: `cowsImages` stores `gs://` paths, not viewable URLs — a separate short-lived
read-signed-URL endpoint will be needed later if/when the frontend needs to actually display the
uploaded photos (not built yet, flagged here so it isn't forgotten).
