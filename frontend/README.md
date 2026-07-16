# BCS Tracker Frontend

React frontend for BCS Tracker. Talks to the Node backend at `VITE_API_URL`
(see `backend/README.md`), which in turn calls the existing `ai-backend`
FastAPI service.

## Setup

    cp .env.example .env   # set VITE_API_URL if not http://localhost:4000/api
    npm install
    npm run dev

## Testing

    npm test

All API calls are mocked via MSW in tests — no backend needs to be running.
