# AI Avatar Training Platform

A production-grade, multi-tenant AI avatar training and assessment platform. Learners practice real-world scenarios through real-time conversations with AI-powered avatars, scored against customizable rubrics.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENTS                                     │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│   │  Admin UI     │  │  Learner UI  │  │  LMS (LTI 1.3)          │  │
│   │  (Next.js)    │  │  (Next.js)   │  │  Canvas/Moodle/BB       │  │
│   └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
└──────────┼─────────────────┼───────────────────────┼────────────────┘
           │                 │                       │
           ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       NGINX INGRESS (TLS)                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   Web App         │ │   API Gateway    │ │   AI Service      │
│   (Next.js 14)    │ │   (Express)      │ │   (FastAPI)       │
│   Port 3000       │ │   Port 4000      │ │   Port 8000       │
│                   │ │                  │ │                   │
│ • Admin Dashboard │ │ • Auth/SSO/JWT   │ │ • STT (Deepgram)  │
│ • Learner Room    │ │ • CRUD APIs      │ │ • LLM (GPT-4o)    │
│ • Session UI      │ │ • LTI 1.3        │ │ • RAG (Pinecone)  │
│ • Analytics       │ │ • Rate Limiting  │ │ • Guardrails       │
│                   │ │ • RBAC           │ │ • Avatar (Simli)   │
│                   │ │ • Multi-tenant   │ │ • Scoring          │
└──────────────────┘ └────────┬─────────┘ └────────┬──────────┘
                              │                    │
        ┌─────────────────────┼────────────────────┼──────────┐
        ▼                     ▼                    ▼          ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐
│  PostgreSQL   │  │    Redis      │  │   LiveKit     │  │  S3/MinIO │
│  16 (RLS)     │  │    7          │  │   (WebRTC)    │  │          │
│               │  │               │  │               │  │          │
│ • Tenants     │  │ • Sessions    │  │ • Audio/Video │  │ • Images │
│ • Users       │  │ • Rate Limit  │  │ • Data Chan.  │  │ • Docs   │
│ • Scenarios   │  │ • Cache       │  │               │  │ • PDFs   │
│ • Sessions    │  │ • Tokens      │  │               │  │          │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui, Zustand |
| API Gateway | Node.js, Express, Zod, Ajv |
| AI Service | Python 3.11, FastAPI, OpenAI, Deepgram, Pinecone |
| Database | PostgreSQL 16 with Row-Level Security |
| Cache | Redis 7 |
| WebRTC | LiveKit |
| Avatar | Simli / HeyGen |
| Storage | AWS S3 / MinIO (dev) |
| Auth | SAML 2.0 / OIDC SSO, RS256 JWT |
| LMS | LTI 1.3 Tool Provider |
| Monorepo | pnpm + Turborepo |
| CI/CD | GitHub Actions |
| Infrastructure | Docker, Kubernetes, AWS EKS |

## Prerequisites

- Node.js >= 20
- pnpm >= 9
- Python >= 3.11
- Docker & Docker Compose
- Git

## Local Development Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd ai-avatar-training-platform

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your API keys

# 3. Start infrastructure services
docker compose up -d

# 4. Install dependencies
pnpm install

# 5. Build shared packages
pnpm --filter @avatar-platform/shared build

# 6. Run database migrations
cd apps/api && pnpm migrate up && cd ../..

# 7. Seed development data
cd apps/api && pnpm seed && cd ../..

# 8. Set up Python environment
cd apps/ai-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..

# 9. Start all services in dev mode
pnpm dev
```

Services will be available at:
- **Web App**: http://localhost:3000
- **API Gateway**: http://localhost:4000
- **AI Service**: http://localhost:8000
- **LiveKit**: ws://localhost:7880
- **MinIO Console**: http://localhost:9001
- **Keycloak**: http://localhost:8080

## Project Structure

```
├── apps/
│   ├── web/                 # Next.js 14 frontend
│   │   ├── src/
│   │   │   ├── app/         # App router pages
│   │   │   │   ├── (auth)/  # Login, callback, SSO
│   │   │   │   ├── (admin)/ # Admin dashboard
│   │   │   │   └── (learner)/ # Learner experience
│   │   │   ├── components/  # UI, admin, learner, session
│   │   │   ├── hooks/       # Custom React hooks
│   │   │   ├── lib/         # Utilities, API client
│   │   │   └── stores/      # Zustand state stores
│   │   └── Dockerfile
│   ├── api/                 # Express API gateway
│   │   ├── src/
│   │   │   ├── config/      # Database, Redis, env, logger
│   │   │   ├── routes/      # Auth, avatars, personas, etc.
│   │   │   ├── middleware/  # Auth, RBAC, tenant, rate-limit
│   │   │   └── db/          # Migrations and seed
│   │   └── Dockerfile
│   └── ai-service/          # Python FastAPI AI service
│       ├── src/
│       │   ├── core/        # STT, LLM, RAG, guardrails, avatar
│       │   └── routes/      # Session, embedding, scoring
│       ├── tests/
│       └── Dockerfile
├── packages/
│   └── shared/              # TypeScript types & enums
├── k8s/                     # Kubernetes manifests
│   ├── frontend/
│   ├── api/
│   ├── ai/
│   ├── ingress.yaml
│   └── network-policies.yaml
├── .github/workflows/       # CI/CD pipelines
├── docker-compose.yml       # Local infrastructure
├── turbo.json               # Turborepo config
└── pnpm-workspace.yaml      # Workspace config
```

## Testing

```bash
# Run all tests
pnpm test

# Node.js tests (API)
cd apps/api && pnpm test

# Python tests (AI service)
cd apps/ai-service && pytest tests/ -v

# Lint
pnpm lint
```

## Deployment

### Staging (automatic on develop merge)
Merges to `develop` trigger automatic deployment to staging EKS cluster.

### Production (manual dispatch)
1. Ensure CI is green on `main`
2. Go to Actions > Deploy Production
3. Enter the git SHA to deploy
4. Type "deploy" to confirm

### Deploy Order
1. Database migrations
2. AI Service
3. API Gateway
4. Frontend
5. Smoke tests
6. Monitoring verification

### Rollback
Automatic rollback on health check failure within 5 minutes. Manual:
```bash
kubectl rollout undo deployment/<service> -n <namespace>
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_PRIVATE_KEY` | RS256 private key for signing | Yes |
| `JWT_PUBLIC_KEY` | RS256 public key for verification | Yes |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4o | Yes |
| `DEEPGRAM_API_KEY` | Deepgram API key for STT | Yes |
| `SIMLI_API_KEY` | Simli API key for avatar | Yes* |
| `HEYGEN_API_KEY` | HeyGen API key for avatar | Yes* |
| `LIVEKIT_API_KEY` | LiveKit server API key | Yes |
| `LIVEKIT_API_SECRET` | LiveKit server API secret | Yes |
| `LIVEKIT_URL` | LiveKit server WebSocket URL | Yes |
| `S3_BUCKET` | S3 bucket name | Yes |
| `S3_REGION` | S3 bucket region | Yes |
| `S3_ENDPOINT` | S3 endpoint (MinIO in dev) | Dev |
| `S3_ACCESS_KEY` | S3 access key | Yes |
| `S3_SECRET_KEY` | S3 secret key | Yes |
| `PINECONE_API_KEY` | Pinecone vector DB API key | Yes |
| `PINECONE_INDEX` | Pinecone index name | Yes |
| `NEXT_PUBLIC_API_URL` | API URL for frontend | Yes |
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit URL for frontend | Yes |

\* At least one avatar provider key required.

## Contributing

1. Create a feature branch from `develop`
2. Make changes following existing code patterns
3. Add tests for new functionality
4. Ensure CI passes (lint, type-check, tests, build)
5. Open a PR to `develop` with a clear description
6. Get code review approval
7. Squash and merge

## License

Proprietary. All rights reserved.
