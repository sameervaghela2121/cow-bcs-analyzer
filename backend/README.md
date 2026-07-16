# BCS Tracker Backend

Node/Express/MongoDB API for BCS Tracker. Integrates with the existing `ai-backend`
FastAPI service for vision scoring — see `docs/module-and-api-spec.md` at the repo root
for the full endpoint catalog and domain rules.

## Setup

    cp .env.example .env   # fill in MONGODB_URL, JWT secrets, AI_BACKEND_URL, SMTP_*
    npm install
    npm run dev

## Bootstrapping the first admin

There is no public registration. Seed the first admin directly in Mongo, e.g. via
`mongosh`, with `status: 'active'` and a bcrypt `passwordHash` — every subsequent user
is created via that admin's `POST /api/users/invite`.

## Testing

    npm test

Integration tests run against an in-memory MongoDB (`mongodb-memory-server`) and mock
both `nodemailer` and calls to `ai-backend` (`nock`) — no real SMTP or AI service
credentials are required to run the suite.
