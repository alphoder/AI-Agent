# AI Avatar Training Platform — Architecture

> **Last updated:** 2026-03-18

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Request Flow](#request-flow)
4. [Real-Time Pipeline](#real-time-pipeline)
5. [Database Schema](#database-schema)
6. [Deployment Architecture](#deployment-architecture)
7. [Authentication Flow](#authentication-flow)

---

## System Overview

The AI Avatar Training Platform enables learners to practice conversations with AI-powered avatars in realistic training scenarios. Instructors configure personas and scenarios; learners interact via real-time video/audio; the system scores performance against rubrics.

```mermaid
graph TB
    subgraph Clients
        Browser[Web Browser]
        LMS[LMS via LTI 1.3]
    end

    subgraph Frontend
        NextJS[Next.js 14<br/>App Router]
    end

    subgraph Backend
        API[API Gateway<br/>Express/Node.js<br/>Port 4000]
        AI[AI Service<br/>FastAPI/Python<br/>Port 8000]
    end

    subgraph Infrastructure
        PG[(PostgreSQL 16<br/>+ RLS)]
        Redis[(Redis 7<br/>Cache + Counters)]
        LK[LiveKit Server<br/>WebRTC SFU]
        S3[(S3 / MinIO<br/>File Storage)]
    end

    subgraph External APIs
        OpenAI[OpenAI<br/>GPT-4]
        Deepgram[Deepgram<br/>STT]
        Simli[Simli / HeyGen<br/>Avatar Rendering]
        Pinecone[Pinecone<br/>Vector DB]
    end

    Browser --> NextJS
    LMS --> API
    NextJS --> API
    NextJS --> LK
    API --> PG
    API --> Redis
    API --> AI
    API --> S3
    AI --> OpenAI
    AI --> Deepgram
    AI --> Simli
    AI --> Pinecone
    AI --> LK
    AI --> PG
```

---

## Monorepo Structure

The project uses a pnpm workspace monorepo managed by Turborepo.

```
ai-avatar-training-platform/
├── apps/
│   ├── web/              # Next.js 14 frontend (App Router)
│   │   └── src/app/
│   │       ├── (learner)/    # Learner routes (session, dashboard)
│   │       └── (admin)/      # Admin routes (personas, scenarios, analytics)
│   ├── api/              # Express API gateway (Node.js)
│   │   └── src/
│   │       ├── routes/       # auth, session, avatar, persona, scenario, analytics, lti
│   │       ├── middleware/   # auth, rbac, tenant, rate-limit, validation
│   │       ├── services/     # jwt, sso, s3, pdf, user, role-resolver
│   │       ├── db/           # migrations (001-016), seed data
│   │       └── config/       # env, database, redis, livekit, logger
│   └── ai-service/       # FastAPI AI/ML service (Python)
│       └── src/
│           ├── session/      # Session orchestration, STT/TTS pipeline
│           ├── scoring/      # Rubric-based LLM scoring
│           ├── rag/          # Document embedding, retrieval
│           └── guardrails/   # Content safety, topic boundaries
├── packages/
│   └── shared/           # Shared TypeScript types and utilities
├── k8s/                  # Kubernetes manifests
│   ├── api/              # API deployment, service, HPA, configmap, external-secret
│   ├── ai/               # AI service deployment, service, HPA, configmap, external-secret
│   ├── frontend/         # Frontend deployment, service, HPA, configmap
│   ├── monitoring/       # Prometheus, Grafana configs
│   ├── ingress.yaml      # NGINX Ingress rules
│   ├── namespaces.yaml   # Namespace definitions
│   └── network-policies.yaml
├── tests/
│   └── load/             # k6 load testing scripts
├── docker-compose.yml    # Local development stack
├── turbo.json            # Turborepo pipeline config
└── pnpm-workspace.yaml   # Workspace definition
```

---

## Request Flow

Standard API request lifecycle from browser to response.

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next.js (SSR/RSC)
    participant A as API Gateway
    participant M as Middleware Stack
    participant DB as PostgreSQL
    participant R as Redis
    participant AI as AI Service

    B->>N: Page request
    N->>A: API call (fetch)
    A->>M: Auth middleware (JWT verify)
    M->>M: Tenant middleware (extract tid)
    M->>M: RBAC middleware (role check)
    M->>M: Rate limit (Redis counter)
    M->>R: Check rate limit
    R-->>M: OK / 429
    M->>A: Request authorized
    A->>DB: Query with RLS (tenant_id)
    DB-->>A: Results
    A-->>N: JSON response
    N-->>B: Rendered page

    Note over B,AI: Session creation triggers AI service
    B->>A: POST /api/sessions
    A->>DB: Insert session record
    A->>R: Increment active session counter
    A->>AI: POST /session/start (fire-and-forget)
    AI->>AI: Spawn LiveKit bot participant
    A-->>B: { sessionId, livekitToken, livekitUrl }
```

---

## Real-Time Pipeline

During an active training session, audio/video flows through LiveKit with AI processing.

```mermaid
flowchart LR
    subgraph Learner
        Mic[Microphone]
        Cam[Camera]
        Speaker[Speaker]
        Screen[Avatar Display]
    end

    subgraph LiveKit SFU
        Room[LiveKit Room]
    end

    subgraph AI Service
        STT[Deepgram STT<br/>Speech-to-Text]
        Guard[Guardrails<br/>Content Safety]
        RAG[RAG Pipeline<br/>Pinecone Retrieval]
        LLM[OpenAI GPT-4<br/>Response Generation]
        TTS[Text-to-Speech]
        Avatar[Avatar Renderer<br/>Simli / HeyGen]
    end

    subgraph Storage
        DB[(PostgreSQL<br/>Transcript Store)]
        Vec[(Pinecone<br/>Vector Store)]
    end

    Mic -->|Audio Track| Room
    Cam -->|Video Track| Room
    Room -->|Audio Stream| STT
    STT -->|Transcript| Guard
    Guard -->|Safe Text| RAG
    RAG -->|Query| Vec
    Vec -->|Context Chunks| RAG
    RAG -->|Augmented Prompt| LLM
    LLM -->|Response Text| TTS
    LLM -->|Response Text| DB
    STT -->|Learner Text| DB
    TTS -->|Audio| Avatar
    Avatar -->|Video + Audio| Room
    Room -->|Video Track| Screen
    Room -->|Audio Track| Speaker
```

### Pipeline Stages

1. **Capture:** Learner's microphone audio is published as a WebRTC track to the LiveKit room.
2. **STT (Speech-to-Text):** The AI service bot subscribes to the learner's audio track and streams it to Deepgram for real-time transcription.
3. **Guardrails:** Transcribed text passes through content safety checks and topic boundary enforcement.
4. **RAG (Retrieval-Augmented Generation):** If enabled for the persona, relevant knowledge base chunks are retrieved from Pinecone based on the conversation context.
5. **LLM:** The system prompt, conversation history, RAG context, and guardrail instructions are sent to GPT-4 for response generation.
6. **TTS + Avatar:** The response text is converted to speech and rendered as a talking avatar video stream via Simli or HeyGen.
7. **Publish:** The avatar video/audio track is published back to the LiveKit room for the learner.
8. **Store:** Both learner and AI turns are persisted to the `session_transcripts` table.

---

## Database Schema

PostgreSQL 16 with Row-Level Security (RLS) for multi-tenant data isolation.

```mermaid
erDiagram
    tenants ||--o{ users : has
    tenants ||--o{ avatars : has
    tenants ||--o{ personas : has
    tenants ||--o{ scenarios : has
    tenants ||--o{ sessions : has
    tenants ||--o{ lti_platforms : has

    users ||--o{ sessions : participates_in
    users ||--o{ scenario_assignments : assigned_to

    avatars ||--o{ personas : used_by

    personas ||--o{ scenarios : configured_in
    personas ||--o{ knowledge_base_documents : has

    scenarios ||--o{ scenario_assignments : assigned_via
    scenarios ||--o{ sessions : runs

    sessions ||--o{ session_transcripts : contains
    sessions ||--|| session_scores : scored_by

    tenants {
        uuid id PK
        text name
        text slug UK
        jsonb sso_config
        int max_concurrent_sessions
        int session_duration_limit_sec
        int idle_timeout_sec
        text avatar_provider
        timestamp created_at
        timestamp updated_at
    }

    users {
        uuid id PK
        uuid tenant_id FK
        text email
        text external_id
        text display_name
        text role "admin | instructor | learner"
        boolean is_active
        timestamp last_login_at
        jsonb metadata
        timestamp created_at
        timestamp updated_at
    }

    avatars {
        uuid id PK
        uuid tenant_id FK
        text name
        text provider "simli | heygen"
        text provider_avatar_id
        text thumbnail_url
        text status "active | inactive"
        timestamp created_at
        timestamp updated_at
    }

    personas {
        uuid id PK
        uuid tenant_id FK
        uuid avatar_id FK
        text name
        text system_prompt
        jsonb guardrails
        boolean rag_enabled
        int rag_top_k
        float rag_similarity_threshold
        float temperature
        text status "active | inactive"
        timestamp created_at
        timestamp updated_at
    }

    knowledge_base_documents {
        uuid id PK
        uuid tenant_id FK
        uuid persona_id FK
        text filename
        text s3_key
        text status "processing | ready | failed"
        int chunk_count
        timestamp created_at
    }

    scenarios {
        uuid id PK
        uuid tenant_id FK
        uuid persona_id FK
        text title
        text objective
        text opening_context
        text opening_message
        jsonb scoring_rubric
        int max_duration_sec
        int max_turns
        text status "active | draft | archived"
        timestamp created_at
        timestamp updated_at
    }

    scenario_assignments {
        uuid id PK
        uuid tenant_id FK
        uuid scenario_id FK
        uuid user_id FK
        text status "assigned | in_progress | completed"
        timestamp due_date
        timestamp created_at
        timestamp updated_at
    }

    sessions {
        uuid id PK
        uuid tenant_id FK
        uuid assignment_id FK
        uuid user_id FK
        uuid scenario_id FK
        text status "created | active | completed | error"
        text livekit_room_id
        timestamp started_at
        timestamp ended_at
        int duration_sec
        int total_turns
        timestamp created_at
    }

    session_transcripts {
        uuid id PK
        uuid session_id FK
        int turn_number
        text role "learner | ai"
        text content
        text audio_url
        int duration_ms
        text sentiment
        timestamp created_at
    }

    session_scores {
        uuid id PK
        uuid session_id FK "UK"
        float overall_score
        jsonb criteria_scores
        text[] strengths
        text[] improvements
        text narrative_feedback
        text scored_by_model
        timestamp created_at
    }

    lti_platforms {
        uuid id PK
        uuid tenant_id FK
        text client_id
        text platform_url
        text auth_endpoint
        text token_endpoint
        text jwks_url
        jsonb platform_config
        timestamp created_at
    }

    audit_logs {
        uuid id PK
        uuid tenant_id FK
        uuid user_id FK
        text action
        text resource_type
        uuid resource_id
        jsonb changes
        text ip_address
        timestamp created_at
    }
```

### Key Design Decisions

- **UUIDv7** primary keys for natural time-ordering and globally unique identifiers.
- **Row-Level Security (RLS)** on all tenant-scoped tables ensures data isolation at the database level.
- **`tenant_id`** is present on every row and enforced by RLS policies — queries always filter by tenant.
- **`scoring_rubric`** is stored as JSONB on `scenarios`, containing an array of `{ criterion_name, weight, description }`.
- **`criteria_scores`** on `session_scores` is JSONB matching the rubric structure with actual scores.

---

## Deployment Architecture

Kubernetes deployment across four namespaces with Horizontal Pod Autoscalers.

```mermaid
graph TB
    subgraph Internet
        User[End Users]
        IdP[Identity Provider<br/>SAML/OIDC]
    end

    subgraph Kubernetes Cluster
        subgraph ingress-ns[Ingress]
            NGINX[NGINX Ingress<br/>TLS Termination]
        end

        subgraph avatar-frontend[Namespace: avatar-frontend]
            FE1[Frontend Pod]
            FE2[Frontend Pod]
            FE_SVC[Service: frontend<br/>ClusterIP]
            FE_HPA[HPA: 2-8 replicas<br/>CPU target: 70%]
        end

        subgraph avatar-api[Namespace: avatar-api]
            API1[API Pod]
            API2[API Pod]
            API3[API Pod]
            API_SVC[Service: api-gateway<br/>ClusterIP]
            API_HPA[HPA: 3-12 replicas<br/>CPU target: 60%]
            API_CM[ConfigMap]
            API_ES[ExternalSecret<br/>→ AWS Secrets Manager]
        end

        subgraph avatar-ai[Namespace: avatar-ai]
            AI1[AI Service Pod]
            AI2[AI Service Pod]
            AI_SVC[Service: ai-service<br/>ClusterIP]
            AI_HPA[HPA: 2-6 replicas<br/>CPU target: 50%]
            AI_CM[ConfigMap]
            AI_ES[ExternalSecret<br/>→ AWS Secrets Manager]
        end

        subgraph monitoring-ns[Namespace: monitoring]
            Prom[Prometheus]
            Graf[Grafana]
        end

        subgraph data-ns[Data Layer]
            PG[(RDS PostgreSQL 16<br/>Multi-AZ)]
            ElastiCache[(ElastiCache Redis<br/>Cluster Mode)]
            S3_Bucket[(S3 Bucket<br/>Reports + Audio)]
        end

        subgraph realtime-ns[Real-Time]
            LK_Cloud[LiveKit Cloud<br/>or Self-Hosted]
        end
    end

    User -->|HTTPS| NGINX
    IdP -->|SAML/OIDC| NGINX
    NGINX -->|/| FE_SVC
    NGINX -->|/api/*| API_SVC
    FE_SVC --> FE1 & FE2
    API_SVC --> API1 & API2 & API3
    API1 & API2 & API3 --> PG
    API1 & API2 & API3 --> ElastiCache
    API1 & API2 & API3 --> S3_Bucket
    API1 & API2 & API3 --> AI_SVC
    AI_SVC --> AI1 & AI2
    AI1 & AI2 --> LK_Cloud
    AI1 & AI2 --> PG
    User -->|WebRTC| LK_Cloud
    Prom -->|scrape| API_SVC & AI_SVC & FE_SVC
    FE_HPA -.->|scale| FE1 & FE2
    API_HPA -.->|scale| API1 & API2 & API3
    AI_HPA -.->|scale| AI1 & AI2
```

### Network Policies

- **avatar-frontend** can only egress to `avatar-api` (API calls).
- **avatar-api** can egress to `avatar-ai`, PostgreSQL, Redis, and S3.
- **avatar-ai** can egress to external APIs (OpenAI, Deepgram, Simli), LiveKit, and PostgreSQL.
- **monitoring** can ingress from all namespaces (metrics scraping).

### Autoscaling Targets

| Service | Min Replicas | Max Replicas | CPU Target | Memory Limit |
|---------|-------------|-------------|------------|--------------|
| Frontend | 2 | 8 | 70% | 512Mi |
| API Gateway | 3 | 12 | 60% | 1Gi |
| AI Service | 2 | 6 | 50% | 2Gi |

---

## Authentication Flow

SSO-based authentication with JWT access/refresh token rotation.

```mermaid
sequenceDiagram
    participant B as Browser
    participant FE as Next.js Frontend
    participant API as API Gateway
    participant IdP as Identity Provider
    participant DB as PostgreSQL
    participant R as Redis

    Note over B,R: Initial SSO Login
    B->>FE: Visit /login
    FE->>API: GET /api/auth/sso/init?tenant=acme
    API->>DB: Lookup tenant SSO config
    DB-->>API: { sso_config }
    API-->>B: 302 Redirect to IdP

    B->>IdP: Authenticate (SAML/OIDC)
    IdP-->>B: POST /api/auth/sso/callback (SAMLResponse)
    B->>API: POST /api/auth/sso/callback
    API->>IdP: Validate assertion
    IdP-->>API: { email, groups, externalId }
    API->>API: resolveRole(groups, sso_config)
    API->>DB: Upsert user record
    DB-->>API: user
    API->>API: Sign JWT (access + refresh)
    API-->>B: Set refresh_token cookie (httpOnly)<br/>302 Redirect /callback#access_token=xxx

    Note over B,R: Authenticated API Calls
    B->>FE: Navigate to /dashboard
    FE->>API: GET /api/auth/me<br/>Authorization: Bearer {access_token}
    API->>API: Verify JWT signature
    API->>API: Extract { sub, tid, role }
    API->>DB: SELECT user WHERE id = sub
    DB-->>API: user data
    API-->>FE: { user }

    Note over B,R: Token Refresh
    B->>API: POST /api/auth/refresh<br/>(refresh_token cookie)
    API->>API: Verify refresh token
    API->>API: Rotate: issue new access + refresh
    API-->>B: Set new refresh_token cookie<br/>{ accessToken }

    Note over B,R: RBAC Enforcement
    FE->>API: GET /api/analytics/overview
    API->>API: authMiddleware (verify JWT)
    API->>API: tenantMiddleware (set tenant scope)
    API->>API: rbac('admin') — check role
    alt role === 'admin'
        API->>DB: Query with RLS
        API-->>FE: 200 { data }
    else role !== 'admin'
        API-->>FE: 403 Forbidden
    end
```

### Token Details

| Token | Type | Storage | Lifetime | Purpose |
|-------|------|---------|----------|---------|
| Access Token | JWT (signed) | Memory / URL fragment | 15 minutes | API authorization; contains `sub`, `tid`, `role` |
| Refresh Token | Opaque | httpOnly cookie (`/api/auth` path) | 7 days | Obtain new access tokens without re-authentication |

### RBAC Roles

| Role | Permissions |
|------|-------------|
| `admin` | Full access: manage tenants, users, personas, scenarios, analytics |
| `instructor` | Manage personas, scenarios, view analytics, assign scenarios to learners |
| `learner` | View assigned scenarios, start/end sessions, view own reports |
