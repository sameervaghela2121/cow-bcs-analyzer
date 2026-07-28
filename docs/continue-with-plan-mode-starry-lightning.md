# Multi-Tenant SaaS Conversion — Organization / Facility / Role Schema

## Context

The app is currently single-tenant: one flat pool of Cows, one flat `User` collection with only `admin`/`staff` roles, no concept of "which farm does this belong to." The business need is to turn it into a real SaaS platform serving multiple customer organizations (e.g. "Amul Good Farm"), each of which can operate several physical facilities (e.g. Ahmedabad, Modasa), each staffed by its own people. This plan establishes the **schema and hierarchy** for that — new `Organization`/`Facility` models, an expanded role enum, and re-scoping of every tenant-owned collection (`Cow`, `BcsAnalysis`, `AuditLog`, `MilkingRecord`). It deliberately does **not** design the permission matrix (which role can perform which specific action) — that is an explicit follow-up conversation. It also does not execute any data migration against the live database — that is a separate, reviewed step after this schema lands.

Two architecture questions were confirmed with the user before finalizing this plan:
- A user belongs to **at most one facility** (no multi-facility membership) — keeps `User.facility` a simple scalar ref.
- Storage isolation uses **one shared GCS bucket per purpose with an organization/facility path prefix**, not a bucket per organization — this requires zero changes to `ai-backend`'s single-bucket security allowlist, avoids per-org GCP provisioning/IAM overhead, and keeps isolation consistent with how every other part of this design already works (application-level query/path scoping, not infrastructure-level).

## Role hierarchy

Replace today's `role: enum['admin', 'staff']` with:

```
super_admin      — platform operator. No organization, no facility. Created ONLY by a script (backend/scripts/seedSuperAdmin.js) — no API route creates this role, ever.
org_admin        — owns one Organization. organization required, facility null.
facility_admin   — manages one Facility under an org. organization + facility both required.
staff            — base operational role (today's "staff", kept as-is to minimize churn). organization + facility both required.
```

## New models

**`backend/src/models/Organization.js`** (new):
```js
{
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, trim: true, lowercase: true }, // safe GCS path segment + human-legible id
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  createdBy: { type: ObjectId, ref: 'User', default: null },
  timestamps: true
}
```
No `ownerId` field — "who owns this org" is derived via `User.find({ organization, role: 'org_admin' })`, consistent with this codebase's established anti-denormalization stance (see `BcsAnalysis`'s deliberate lack of a stored `cowsId`, resolved via `populate('cow')` instead).

**`backend/src/models/Facility.js`** (new):
```js
{
  organization: { type: ObjectId, ref: 'Organization', required: true, index: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  createdBy: { type: ObjectId, ref: 'User', default: null },
  timestamps: true
}
facilitySchema.index({ organization: 1, slug: 1 }, { unique: true }); // "Ahmedabad" can exist under two different orgs
```
No `facilityAdminId` field, same reasoning as Organization's ownership.

## `User` model changes (`backend/src/models/User.js`)

```js
role: { type: String, enum: ['super_admin', 'org_admin', 'facility_admin', 'staff'], default: 'staff' },
organization: { type: ObjectId, ref: 'Organization', default: null }, // null only for super_admin
facility: { type: ObjectId, ref: 'Facility', default: null },         // null for super_admin AND org_admin
```
Add a schema-level validator (same pattern already used for `BcsAnalysis.cowsImages`'s non-empty-array check) enforcing the nullability table above — this is data integrity, not authorization, so it's in scope even though the permission matrix is deferred:

| role | organization | facility |
|---|---|---|
| super_admin | null | null |
| org_admin | required | null |
| facility_admin | required | required |
| staff | required | required |

**JWT payload** (`backend/src/services/authService.js`, currently `{ sub, role, email, name }`) gains `organizationId`/`facilityId` (nullable strings). **`requireAuth()`** (`backend/src/middleware/auth.js`) sets `req.user` to include the same two fields. **`requireRole()`** needs to accept multiple role values (e.g. `requireRole('org_admin', 'facility_admin')`) since single-role gating rarely suffices across 4 roles — but do not build the actual per-route authorization matrix in this pass; only the middleware's *capability* to express it.

## `Cow` model changes (`backend/src/models/Cow.js`)

```js
cowsId: { type: String, required: true, trim: true },       // unique: true REMOVED
facility: { type: ObjectId, ref: 'Facility', required: true, index: true }, // NEW
```
Replace the global unique index with a compound one:
```js
cowSchema.index({ facility: 1, cowsId: 1 }, { unique: true });
```
This fixes a real bug that exists today regardless of multi-tenancy: `cowService.findOrCreateCow(cowsId)` (`backend/src/services/cowService.js`) does a bare, unscoped `Cow.findOne({ cowsId })`/`Cow.create({ cowsId })` — two different facilities both having a cow "1042" would already collide. Its signature becomes `findOrCreateCow(facilityId, cowsId)`, scoping both the lookup and the create.

**Frontend impact:** none for `staff`/`facility_admin` — `cowsId` stays a plain opaque string everywhere in the frontend (route params, query keys, display text); the backend resolves it via `Cow.findOne({ facility: req.user.facilityId, cowsId })` instead of the current unscoped lookup. This does **not** cover `org_admin`/`super_admin` viewing across facilities (no cross-facility dashboard exists yet) — flagged as future frontend work, out of scope here.

## `BcsAnalysis` / `AuditLog` / `MilkingRecord` — denormalize `organization` + `facility`

Add to all three:
```js
organization: { type: ObjectId, ref: 'Organization', required: true, index: true }, // MilkingRecord: not required, see below
facility: { type: ObjectId, ref: 'Facility', required: true, index: true },          // MilkingRecord: not required, see below
```

This intentionally breaks from the "derive, don't denormalize" pattern used for `cowsId` — but for a different reason than that removal. `cowsId` is a mutable display label read once per document via a cheap `populate`; `organization`/`facility` are **query filters** needed on every single tenant-scoped list/dashboard endpoint (a facility's pending-review worklist, its audit trail, its milking-data records), and are fixed forever at creation (a cow doesn't change facility mid-analysis). Avoiding denormalization here would mean every list query does a two-step `Cow.find({facility}, '_id')` → `X.find({cow: {$in: [...]}})`, adding real latency to the most common read paths. There's already a precedent for denormalizing a tenant field on exactly this kind of collection: `AuditLog.cowsId` is already stored directly as a historical snapshot, not derived.

Add a compound index on `BcsAnalysis`: `{ facility: 1, status: 1, createdAt: -1 }` for the reviewer worklist.

For `MilkingRecord`, make `organization`/`facility` **required** (not optional) — the uploading user's facility is already known at both `generateUploadUrl` and `importUpload` time (both routes sit behind `requireAuth()`), so the backend can pass `facilityId`/`organizationId` through to the `milking-data-importer` Cloud Function call, which stamps them onto every record it creates. This also means facility-filtering works even for records where `cow` hasn't resolved yet (today, `cow` on `MilkingRecord` isn't required either) — a real gap `organization`/`facility` closes that relying purely on `cow` never could.

Remember `MilkingRecord`'s schema is duplicated byte-for-byte in `backend/src/models/MilkingRecord.js` and `milking-data-importer/src/models/MilkingRecord.js` (the Cloud Function can't reach across the deploy boundary) — both copies need the same change, kept in sync by hand as today.

## GCS path changes (no bucket changes)

`backend/src/services/gcsService.js`: extend `buildObjectPath` to `buildObjectPath({ organizationId, facilityId, cowsId, batchTimestamp, filename })`, validating the two new segments with the existing `assertSafePathSegment` (Mongo ObjectId hex strings already satisfy its `^[A-Za-z0-9._-]{1,128}$` regex — no regex change needed), producing:
```
<organizationId>/<facilityId>/<cowsId>/<batchTimestamp>/<filename>
```
`image-compressor`'s variant-subfolder insertion (`buildVariantObjectPath`) is untouched — it just operates one level deeper in the same path, unchanged logic.

`backend/src/services/milkingGcsService.js`: same treatment for `buildMilkingObjectPath({ organizationId, facilityId, dateFolder, filename })` →
```
<organizationId>/<facilityId>/<dateFolder>/<filename>
```

**No changes needed** to `image-compressor/`, `milking-data-importer/` (both are pure bucket/path pass-throughs today, per the existing architecture), or `ai-backend/` (its `parse_gs_uri` allowlist check only cares about bucket name, which never changes under this design).

## Super admin creation script

`backend/scripts/seedSuperAdmin.js` (new, sibling to the existing `backend/scripts/seedAdmin.js` and `migrate-bcs-analysis-camelcase.js`):
- Plain `mongoose.connect(config.mongodbUrl)`, no Express app, no route.
- Prompts for a password at runtime (not a CLI arg, to avoid shell-history/process-listing leaks) and hashes it directly via `authService`'s existing bcrypt helper — no invite-token flow, no email, no `Invitation` document (deliberately different from `seedAdmin.js`'s invite-email pattern, since the super_admin's credentials are meant to be set synchronously by whoever runs the script).
- Upserts (not plain insert) `{ email, name, role: 'super_admin', status: 'active', passwordHash, organization: null, facility: null }` — idempotent, safe to re-run.

`backend/scripts/seedAdmin.js` currently creates a `role: 'admin'` user, which won't exist in the new enum — **decide at implementation time** whether to delete it or repurpose it to bootstrap an `org_admin` for a named, already-existing Organization (a chicken-and-egg problem `seedSuperAdmin.js` doesn't have, since it needs no Organization to exist first).

## Migration for existing data (design only — do not execute)

A follow-up script (same dry-run/`--execute` pattern as `backend/scripts/migrate-bcs-analysis-camelcase.js`) will need to, for the ~8 existing production documents:
1. Create one default `Organization` + one default `Facility` under it, clearly named as migration artifacts.
2. Backfill every existing `Cow` with that `facility`.
3. Backfill every existing `BcsAnalysis`/`AuditLog`/`MilkingRecord` with that `organization`/`facility` (a flat `updateMany` given the current dataset size — every existing `Cow` resolves to the same default facility).
4. Backfill existing `User` docs: `role: 'staff'` → same default org/facility. `role: 'admin'` → promote to `org_admin` of the default Organization (not `super_admin` — a `super_admin` should be a small, deliberately-provisioned set of platform operators via the new script, not an artifact of a generic migration).

This is real production-data risk and is explicitly **not** part of this implementation pass — write and dry-run it as its own reviewed step once the schema above is in place and tested.

## Explicitly deferred (next conversation, not this pass)

- The actual permission matrix — which role can do what, on which routes/UI. All routes today are `requireAuth()`-only with zero role gating beyond the 4 `/users/*` endpoints; this stays true until that follow-up.
- Whether an `org_admin` can act as a `facility_admin` for one of their own facilities without a separate User record (currently: `org_admin.facility` is always null; "which facility am I viewing" would be UI/session state, not schema, unless this changes).
- Whether a `Cow` can ever transfer between facilities (this plan treats `Cow.facility` as immutable at creation).
- Whether an `Organization`/`Facility` needs hard-delete/cascade semantics beyond the `status` soft-disable flags stubbed above.

## Critical files to modify

- `backend/src/models/Organization.js` (new), `backend/src/models/Facility.js` (new)
- `backend/src/models/User.js`, `backend/src/models/Cow.js`, `backend/src/models/BcsAnalysis.js`, `backend/src/models/AuditLog.js`
- `backend/src/models/MilkingRecord.js` **and** `milking-data-importer/src/models/MilkingRecord.js` (keep in sync by hand, as today)
- `backend/src/middleware/auth.js`, `backend/src/services/authService.js` (JWT shape)
- `backend/src/services/cowService.js` (`findOrCreateCow` signature)
- `backend/src/services/gcsService.js`, `backend/src/services/milkingGcsService.js` (path builders)
- `backend/scripts/seedSuperAdmin.js` (new)

## Verification

- `cd backend && npm test` after each model change — existing fixtures in `tests/integration/cows.test.js`, `tests/integration/bcsAnalysis.test.js`, `tests/integration/audit.test.js`, and `tests/unit/*` will need their `Cow.create`/`BcsAnalysis.create` calls updated to include a `facility` (and the two new `organization`/`facility` fields elsewhere) before they pass again — expect red tests immediately after the schema change until fixtures are updated, this is expected and not a regression signal.
- `cd milking-data-importer && npm test` after updating its duplicated `MilkingRecord` model.
- Manually verify the compound unique index behaves as intended: two `Cow.create({ facility: A, cowsId: '1042' })` + `Cow.create({ facility: B, cowsId: '1042' })` should both succeed; a second `Cow.create({ facility: A, cowsId: '1042' })` should fail with a duplicate-key error.
- Run `node scripts/seedSuperAdmin.js <email> <name>` against a local/dev Mongo and confirm the resulting `User` document has `role: 'super_admin'`, `organization: null`, `facility: null`, and can log in via the existing `/login` route.
