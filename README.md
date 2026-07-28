# SpeakCoach — AI voice & body-language practice

A free, self-serve web app for practising real-world conversations **out loud**. Pick a
scenario, turn on your mic and camera, and have a real spoken conversation with an AI
coach. Afterwards you get scored on **what you said** (against a rubric) and **how you
carried yourself** (body language read in real time from your webcam).

- **Voice-only** — no avatars. The coach talks back with a natural voice.
- **Gemini is the whole brain** — Gemini Live does speech-in → reasoning → voice-out in one
  stream (fast, multilingual). Gemini Flash reads body language and scores the session.
- **Webcam = body language, not storage** — frames are analysed on the fly into short text
  notes; the video is never stored.
- **Google sign-in only.** No SSO, no orgs, no admin/learner roles.
- **Free-tier stack** — Postgres + Gemini + Google OAuth. No Redis, LiveKit, S3, or paid SDKs.

> Looking for the file-and-line map of the codebase? See [`docs/CODEMAP.md`](docs/CODEMAP.md).

## Architecture

```
Browser (Next.js, Vercel)                API (Express)            Providers
─────────────────────────                ─────────────            ─────────
Google sign-in ───────────────────────►  • Google auth + JWT  ──► Google OAuth
Scenario library / create                 • scenarios (Postgres)   Postgres (Neon/Supabase)
Voice session:                            • sessions / scoring
  • mic PCM16 ─┐                          • internal callbacks
  • webcam self-view + frame /8s          
               ▼
        AI Service (FastAPI) ── Gemini Live WS  (STT + LLM + native voice, multilingual)
          /ws/session         ── Gemini Flash    (per-frame body-language note)
          /scoring/evaluate   ── Gemini Flash    (rubric + body-language report)
```

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router), Tailwind, `@react-oauth/google` |
| API gateway | Node 20, Express, raw `pg`, `google-auth-library`, JWT |
| AI service | Python 3.11, FastAPI, `websockets`, Gemini Live + Gemini Flash |
| Database | PostgreSQL (node-pg-migrate; ownership-scoped, no RLS) |
| Auth | Google OAuth (ID token) → app JWT + Postgres refresh tokens |
| Monorepo | pnpm + Turborepo |

## Local development

```bash
# 1. Install
pnpm install

# 2. Start Postgres
docker compose up -d postgres

# 3. Configure env
cp .env.example .env   # fill GEMINI_API_KEY, GOOGLE_CLIENT_ID, etc.

# 4. Build shared types, migrate, seed the public scenario library
pnpm --filter @avatar-platform/shared build
cd apps/api && pnpm migrate up && pnpm seed && cd ../..

# 5. AI service deps
cd apps/ai-service && python -m venv .venv && source .venv/bin/activate && pip install -e . && cd ../..

# 6. Run everything
pnpm dev
```

- Web: http://localhost:3000 · API: http://localhost:4000 · AI: http://localhost:8000
- For local sign-in without Google, use the **dev login** box on `/login` (non-production only).

## Environment variables

| Variable | Used by | Notes |
|----------|---------|-------|
| `DATABASE_URL` | api | PostgreSQL connection string |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | api | PEM in prod (RS256); any string in dev (HS256) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api | Verify Google ID tokens |
| `GEMINI_API_KEY` | ai | Gemini Live + Flash |
| `AI_SERVICE_URL` | api | Base URL of the AI service |
| `API_GATEWAY_URL` | ai | Base URL of the API (internal callbacks) |
| `INTERNAL_API_KEY` | api + ai | Shared service-to-service key (`X-Internal-Key`) |
| `CORS_ORIGINS` | api | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_URL` | web | e.g. `http://localhost:4000/api` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | web | Google OAuth client id |

## Deployment

- **API + AI** → Render (free) via [`render.yaml`](render.yaml).
- **Web** → Vercel (set `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID`).
- **DB** → Neon or Supabase (free Postgres). Run `pnpm migrate up && pnpm seed` once.

## Project structure

```
apps/
  web/         Next.js frontend (login, scenario library, session, reports)
  api/         Express gateway (auth, scenarios, sessions, internal, migrations, seed)
  ai-service/  FastAPI (Gemini Live relay + body language + scoring)
packages/
  shared/      Shared TypeScript types & enums
docs/          ARCHITECTURE.md · CODEMAP.md · claude.md  (local-only; read these first)
```

## License

Proprietary. All rights reserved.
