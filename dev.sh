#!/usr/bin/env bash
# Local dev launcher: API + AI relay + web, one command, correct local env.
# ponytail: plain shell + `kill 0` over turbo/concurrently — turbo doesn't cover
# the Python service or the env override, and this needs no new dependency.
#
# DATABASE_URL is forced to the local Postgres (root .env points at Neon).
# GEMINI keys and the real GOOGLE_CLIENT_ID come from root .env — do NOT set them
# here, or you'll shadow the real values and Google sign-in breaks.
set -euo pipefail
cd "$(dirname "$0")"

export NODE_ENV=development
export PORT=4000
export DATABASE_URL="postgresql://postgres:postgres@localhost:5499/avatar_platform"
export INTERNAL_API_KEY=dev-internal-key
export WS_TICKET_SECRET=devwssecret123456
export JWT_PRIVATE_KEY=dev-private-key
export JWT_PUBLIC_KEY=dev-public-key
export AI_SERVICE_URL=http://localhost:8000
export API_GATEWAY_URL=http://localhost:4000
export CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

trap 'kill 0' EXIT   # Ctrl-C tears down all three

( cd apps/api && pnpm dev ) &
( cd apps/ai-service && ./.venv/bin/python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload ) &
( cd apps/web && pnpm dev ) &
wait
