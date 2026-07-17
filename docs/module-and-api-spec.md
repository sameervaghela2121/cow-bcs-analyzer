 # BCS Tracker — Module & API Analysis

> **Superseded in part** by [`docs/bcs-analysis-v2-architecture.md`](./bcs-analysis-v2-architecture.md):
> media storage (Decision D7 below, now GCS direct-upload) and the readings/review/audit-approval
> schema and endpoints (§4 `readings`, "Review" module/endpoints below) were replaced by the
> `bcs_analysis` collection and a GCS-signed-URL upload flow. The domain rules in §2 and the
> non-review frontend modules in §3 are still current background reading.

Derived from `html-reference/BCS Tracker.dc.html` (the clickable prototype) and the
existing `ai-backend/` FastAPI service. This is an analysis document — no implementation.

**Target stack:** React (`frontend/`), Node + Express + MongoDB (`backend/`), existing
Python FastAPI vision service (`ai-backend/`, unchanged).

---

## 1. What the reference actually is

`BCS Tracker.dc.html` is a **single-file React prototype** built on a bespoke runtime
(`support.js` — a generated `dc-runtime` build; framework scaffolding, not app logic, so
it carries nothing to port). The whole app is one `Component extends DCLogic` class with:

- `this.state` — the entire app state, in memory only
- `renderVals()` — a single mega-selector producing every value + handler the markup binds to
- `<sc-if>` / `<sc-for>` — the runtime's conditional/loop directives

**All data is fake and seeded.** `generateCows()` uses a `mulberry32(20260715)` seeded PRNG to
invent 22 cows; `generateSampleAuditLog()` and `generateSampleUsers()` do the same. There is no
network call anywhere in the prototype — `finishUpload()` fabricates a score with `Math.random()`
after a `setTimeout`. Every one of these generators is throwaway; the **business rules embedded
around them (§2) are the real specification.**

---

## 2. Domain rules extracted from the prototype

These are the authoritative rules to port. They are currently scattered across `renderVals()`
and helpers; in the real system they belong in one shared backend module.

| Rule | Definition | Source |
|---|---|---|
| BCS scale | 1.0 – 5.0, always rounded to nearest **0.25** | `roundQuarter()` |
| Band: Too thin | `score < 2.5` (amber `#b45309`) | `bandFor()` |
| Band: Ideal | `2.5 <= score <= 3.75` (green `#166534`) | `bandFor()` |
| Band: Too heavy | `score > 3.75` (blue `#1d4ed8`) | `bandFor()` |
| Confidence | `high` \| `medium` \| `low` | `confStyleFor()` |
| Sharp drop | `prev.score - latest.score >= 0.5` | `computeDerived()` |
| Review queue | latest reading where `(flagged OR sharpDrop)` AND not resolved | `flaggedReadings` |
| Override step | ±0.25, clamped to [1, 5] | `decFn` / `incFn` |
| Override effect | sets new score, `flagged = false`, marks resolved, writes audit entry | `confirmFn` |
| Override rate | `overridden / totalReviewed` (%) | `reviewStats` |
| Avg adjustment | `mean(abs(newScore - oldScore))` over overrides only | `reviewStats` |

**Flagging needs a real rule.** The prototype fakes it:
`flagged = confidence === 'low' || (confidence === 'medium' && Math.random() < 0.4)`.
The random half must be replaced by something deterministic — see Decision D2.

---

## 3. Frontend modules (`frontend/`)

Seven screens, gated by `screen` state + `loggedIn`. Sidebar nav (collapses to a bottom tab bar
under 820px — the prototype is already responsive and that CSS is worth keeping).

| Module | Screen | Contents |
|---|---|---|
| **Auth** | Login | Two stages: mobile entry → OTP entry. "Change number" resets. Inline errors. |
| **Upload** | Upload | Cow ID input, drag/drop + file picker (`image/*,video/*`), progress bar, processing spinner, result card (score, band, confidence, flagged), "Upload another" / "View cow history". |
| **Herd** | Herd | Card grid. Search by cow ID, filter chips (all/flagged/thin/ideal/heavy), sort (recent / bcs-asc / bcs-desc / flagged). Per card: latest score badge, band, pen, "last scored" relative date, flag icon, sharp-drop warning. |
| **Cow Detail** | Detail | Header (breed, lactation, pen, current BCS + band), SVG trend chart with banded backgrounds, reading history list, reading modal (large image, score, confidence). |
| **Review** | Review | Queue of flagged readings with reason label, Approve / Override (±0.25 stepper), and a stats strip. Empty state. |
| **Audit Log** | Audit | Reverse-chronological approve/override entries with `old → new` score. Empty state. |
| **User Mgmt** | Users | **Admin-only.** Invite by mobile + role, role dropdown per user, remove, active/pending status. |
| **Shell** | — | Sidebar nav, flagged-count badge, light/dark theme toggle (CSS custom properties, `THEMES` map), logout. |

**Drop from the prototype:** the "Preview role (demo)" `<select>` in the sidebar footer — it
client-side spoofs admin/staff. Role must come from the authenticated session.

**Suggested composition:** Vite + React Router (one route per screen), TanStack Query for all
server state (it maps cleanly onto the polling in Decision D1), Context for auth + theme. The
single `renderVals()` selector should decompose into per-screen hooks; the shared badge/band/
confidence styling becomes small presentational components.

---

## 4. MongoDB collections (`backend/`)

| Collection | Key fields | Notes |
|---|---|---|
| `users` | `mobile` (unique), `name`, `role` (`admin`\|`staff`), `status` (`active`\|`pending`), `invitedBy`, `createdAt` | Mobile is the identity — there are no passwords. |
| `otp_codes` | `mobile`, `codeHash`, `attempts`, `expiresAt` | **TTL index on `expiresAt`.** Hash the code; never store plaintext. |
| `cows` | `cowId` (unique), `breed`, `lactation`, `pen`, `createdAt` | Prototype invents these; real system needs a registry (Decision D4). |
| `readings` | `cowId`, `mediaId`, `score`, `confidence`, `flagged`, `flagReason`, `status`, `reviewStatus`, `capturedAt`, `providerResults[]`, `assessmentId` | The core collection. `status` drives the async upload flow; `reviewStatus` (`pending`\|`approved`\|`overridden`) replaces the prototype's ephemeral `resolvedIds`. |
| `media` | `storageKey`, `mimeType`, `kind` (`image`\|`video`), `frameKey`, `size` | `frameKey` = the still extracted from a video (Decision D3). |
| `audit_logs` | `cowId`, `readingId`, `userId`, `action` (`approved`\|`overridden`), `oldScore`, `newScore`, `createdAt` | Append-only. Drives both the Audit screen and Review stats. |
| `bcs_assessments` | raw `MultiModelBCSResponse` | **Already written by `ai-backend`** — see §6. |

Suggested indexes: `readings` on `{cowId, capturedAt}` (detail + trend), on
`{reviewStatus, flagged}` (queue), `users.mobile` unique, `cows.cowId` unique.

**Denormalize the latest reading onto `cows`** (`latestScore`, `latestBand`, `lastScoredAt`,
`flagged`). The Herd screen sorts and filters on exactly these fields across the whole herd;
computing them per request means an aggregation over all readings on every load.

---

## 5. API catalog (`backend/`)

All under `/api`. JWT (access + refresh) from OTP verification; `role` claim gates admin routes.

### Auth
| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/request-otp` | `{mobile}` → send SMS. Rate-limit per mobile + IP. |
| POST | `/auth/verify-otp` | `{mobile, code}` → `{accessToken, refreshToken, user}`. Activates a `pending` invite. |
| POST | `/auth/refresh` | Rotate access token. |
| POST | `/auth/logout` | Revoke refresh token. |
| GET | `/auth/me` | Current user + role (replaces the demo role selector). |

### Users — admin only
| Method | Path | Purpose |
|---|---|---|
| GET | `/users` | List (`?status=&role=`). |
| POST | `/users/invite` | `{mobile, role}` → creates `pending` user. |
| PATCH | `/users/:id/role` | `{role}`. |
| DELETE | `/users/:id` | Remove. Guard against removing the last admin. |

### Cows
| Method | Path | Purpose |
|---|---|---|
| GET | `/cows` | Herd grid. `?search=&filter=all\|flagged\|thin\|ideal\|heavy&sort=recent\|bcs-asc\|bcs-desc\|flagged&page=&limit=`. Returns latest score, band, flag, sharpDrop, lastScoredAt. |
| GET | `/cows/:cowId` | Detail: metadata + current score + band. |
| POST | `/cows` | Register a cow. |
| PATCH | `/cows/:cowId` | Update breed / lactation / pen. |
| GET | `/cows/:cowId/readings` | Reading history (paginated, desc). Feeds both the history list and the trend chart. |

### Readings / Upload
| Method | Path | Purpose |
|---|---|---|
| POST | `/readings` | **Multipart** (`cowId`, `file`). Stores media, returns `202 {readingId, status:'processing'}`, kicks off scoring. |
| GET | `/readings/:id` | Poll target. Returns `status` (`processing`\|`scored`\|`failed`) + result. |
| GET | `/readings/:id/media` | Signed URL for image/extracted frame (real thumbnails replace the prototype's gradients). |

### Review
| Method | Path | Purpose |
|---|---|---|
| GET | `/review/queue` | Flagged/sharp-drop readings pending review, with reason labels. |
| POST | `/review/:readingId/approve` | Confirm score → `reviewStatus:'approved'` + audit entry. |
| POST | `/review/:readingId/override` | `{score}` → validate 0.25 step + [1,5], update reading, clear flag, audit entry. |
| GET | `/review/stats` | Reviewed / approved / overridden / cows-with-override / override rate / avg adjustment. |

### Audit
| Method | Path | Purpose |
|---|---|---|
| GET | `/audit` | `?cowId=&action=&from=&to=&page=` — reverse chronological. |

### Meta
| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness + Mongo + ai-backend reachability. |

---

## 6. Integration with the existing `ai-backend`

**Contract (verified in code, do not re-derive):**

```
POST http://<ai-backend>/api/bcs/assess
Content-Type: multipart/form-data
  images: <one or more files>          # field name is "images", repeatable
  ?providers=gemini,claude             # optional; omit = fan out to all three
```

Response is **not** a single score — it's three, side by side:

```jsonc
{
  "claude": { "final_bcs": 3.25, "confidence": "High", "recommendation": "...",
              "status": "success", "error_message": null },
  "gemini": { ... },
  "openai": { ... }
}
```

Facts that shape the Node backend:

- **`final_bcs` is already rounded to 0.25** server-side (`round_to_quarter` validator) and
  constrained to `[1.0, 5.0]`. No re-rounding needed.
- **`confidence` is capitalized** (`"High"`/`"Medium"`/`"Low"` — the `ConfidenceLevel` enum) but
  the prototype uses lowercase. Normalize at the boundary.
- **It accepts images only** — `ALLOWED_IMAGE_TYPES = ("image/jpeg", "image/png", "image/webp")`,
  max 10MB (`MAX_IMAGE_SIZE_MB`). **It cannot take video.** See Decision D3.
- **It has no concept of a cow.** No `cowId` in the request or response. Linking a score to an
  animal is entirely the Node backend's job.
- **Partial failure is normal.** One provider failing returns `status:"error"` for that key while
  the others succeed; only if *all* fail does it raise (HTTP error). The Node backend must handle
  "2 of 3 answered".
- **It already writes to Mongo.** `bcs_service.py:94` calls `save_assessment(response.model_dump())`
  into `bcs_assessments` — with no cowId, readingId, or user. Today these are orphan records.

---

## 7. Decisions needed before implementation

These are genuine forks where the prototype gives no answer. Each changes the shape of the code.

**D1 — Upload flow: synchronous or job-based?**
The prototype fakes ~1.3s. Reality is three vision LLMs in parallel: **5–30s**, sometimes worse.
A synchronous `POST /readings` risks proxy/browser timeouts. Recommend job-based: return `202`
immediately, poll `GET /readings/:id`. This maps 1:1 onto the UI states that already exist
(`uploading → processing → done`) and needs no new screens.

**D2 — Multi-model reconciliation.** The AI returns 3 scores; the UI shows 1 score + 1 confidence.
Needs a defined rule. Suggested: **median of successful providers** (robust to one outlier),
with confidence derived from spread — e.g. all within 0.25 → `high`; within 0.5 → `medium`;
wider, or only one provider answered → `low`. This also cleanly replaces the random flagging in §2:
**flag when the models disagree**, which is a real signal rather than a coin flip. Store every
provider's raw answer in `readings.providerResults[]` so a reviewer can see *why* it was flagged.

**D3 — Video handling.** The upload UI accepts `video/*` and the prototype even renders an
"Extracted still frame" label — but the AI service rejects anything that isn't JPEG/PNG/WebP.
Something must extract a frame. Recommend **ffmpeg in the Node backend** (keeps `ai-backend`
untouched). Open sub-question: which frame? (first, middle, or best-quality/sharpest).

**D4 — Cow master data.** `breed`, `lactation`, and `pen` are randomly generated in the prototype
but shown as fact on the detail screen. Real source needed: manual CRUD, CSV import, or a herd-
management system sync? Also: does uploading an unknown cow ID auto-create the cow (as
`addReadingToCow()` does, with `breed: 'Unknown'`) or reject it?

**D5 — Ownership of `bcs_assessments`.** `ai-backend` already persists raw model output with no
cow linkage. Either (a) leave it as a raw model-audit trail and have Node store its own linked
copy, or (b) have Node pass a correlation ID through and reconcile. Doing nothing means orphan
records accumulating forever.

**D6 — OTP delivery.** No SMS provider is configured (`.env` has AWS, but for Bedrock/S3 — no
Twilio/SNS). The prototype accepts any 4–6 digits. Need a provider, plus expiry, attempt limits,
and rate limiting.

**D7 — Media storage.** Every thumbnail in the prototype is a CSS gradient (`thumbGradientFor()`)
— no real images exist. `AWS_S3_BUCKET` is already in the ai-backend config, suggesting S3 is the
intended target. Confirm S3 (+ signed URLs) vs GridFS vs local disk.

---

## 8. Also noted

`html-reference/uploads/DocFlow---Document-Extraction-Portal-07-15-2026_01_29_PM.png` is a
screenshot of an unrelated "DocFlow / Document Extraction Portal" project. It appears to be
leftover and unrelated to BCS Tracker — flagging in case it was included by mistake.
