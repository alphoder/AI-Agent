# PROJECT REVIEW V3 - Full Audit Against Notion Build Plan
**Date:** 2026-03-19
**Scope:** Complete codebase review against the 10-prompt Notion build plan
**Total Issues Found:** 165 (27 CRITICAL, 40 HIGH, 41 MEDIUM, 35 LOW, 22 PROGRESS GAPS)

---

## PART 1: PROGRESS TRACKING AGAINST 10-PROMPT BUILD PLAN

### Prompt 1: Project Scaffolding, Infrastructure, and CI/CD
| Deliverable | Status | Notes |
|---|---|---|
| Monorepo structure (pnpm + Turborepo) | DONE | Structure matches spec |
| Next.js 14 App Router frontend | DONE | All route groups exist |
| Express API backend | DONE | Full route structure |
| Python FastAPI AI service | DONE | Core modules exist |
| Shared types package | DONE | Types defined |
| Docker Compose (dev + prod + test) | DONE | All 3 compose files |
| Kubernetes manifests | PARTIAL | Missing PodDisruptionBudgets, staging/prod env separation broken |
| CI/CD pipelines | BROKEN | Deploy workflows reference non-existent k8s/staging/ and k8s/production/ dirs |
| GitHub Actions (lint, test, build, deploy) | PARTIAL | CI works, deploy is broken |
| Dependabot | DONE | All ecosystems covered |

### Prompt 2: Database Schema, Migrations, Multi-Tenancy, and RLS
| Deliverable | Status | Notes |
|---|---|---|
| 16 migration files | DONE | Extensions through RLS |
| Multi-tenant schema with tenant_id | DONE | |
| Row-level security policies | DONE | Migration 016 |
| UUIDv7 primary keys | DONE | Extension in migration 001 |
| updated_at triggers | DONE | Migration 015 |
| Seed data script | DONE | seed.ts + seed-demo.ts |

### Prompt 3: Authentication (SSO SAML/OIDC), JWT, and RBAC
| Deliverable | Status | Notes |
|---|---|---|
| SSO adapter (SAML + OIDC) | PARTIAL | OIDC code verifier not persisted (breaks PKCE flow) |
| JWT service with RS256/HS256 | DONE | |
| Token refresh with Redis family tracking | DONE | But INCR+EXPIRE not atomic |
| RBAC middleware | DONE | |
| Auth middleware | DONE | |
| Tenant middleware | DONE | Caches for 5min with no invalidation |
| Dev login bypass | DONE | NODE_ENV guarded |
| Rate limiting | PARTIAL | Only on auth + session create, not on avatar/persona/scenario/analytics routes |

### Prompt 4: Avatar Creation Module
| Deliverable | Status | Notes |
|---|---|---|
| Avatar create page (image upload) | DONE | |
| Avatar list page with pagination | DONE | |
| Avatar detail page | DONE | |
| API routes (CRUD) | DONE | |
| S3 upload for images | DONE | |
| AI service avatar provider integration | DONE | Simli + HeyGen |
| Avatar ID storage per tenant | DONE | |

### Prompt 5: Persona Curation Module with RAG Pipeline
| Deliverable | Status | Notes |
|---|---|---|
| Persona create page | DONE | |
| Persona list page | DONE | But NO pagination |
| Knowledge base document upload | DONE | |
| Document chunking | DONE | |
| Vector embedding (Pinecone) | DONE | But Pinecone ops block event loop |
| RAG retrieval during sessions | DONE | |
| Guardrails configuration | PARTIAL | Injection detection trivially bypassable |

### Prompt 6: Scenario Builder Module
| Deliverable | Status | Notes |
|---|---|---|
| Scenario create page | DONE | |
| Scenario edit page | DONE | Added in recent fix batch |
| Scenario list page | DONE | But NO pagination |
| Scenario assignment to learners | DONE | |
| Scoring rubric configuration | DONE | |

### Prompt 7: Real-Time Pipeline (STT + LLM + Avatar Streaming)
| Deliverable | Status | Notes |
|---|---|---|
| Deepgram STT streaming | DONE | With reconnect logic |
| GPT-4o streaming orchestration | DONE | |
| Avatar API streaming (Simli/HeyGen) | DONE | |
| Session orchestrator | DONE | But per-chunk guardrails create incoherent output |
| PII redaction | DONE | But patterns duplicated between stt.py and guardrails.py |
| Audio buffering on disconnect | DONE | Fixed in recent batch |
| Silence detection | DONE | |

### Prompt 8: Learner Session Room (Frontend WebRTC + Session Lifecycle)
| Deliverable | Status | Notes |
|---|---|---|
| WebRTC video player | DONE | |
| Voice input controls | DONE | |
| Mic waveform visualization | DONE | 5-bar equalizer |
| Transcript panel | DONE | |
| Session timer | DONE | |
| Idle timeout | DONE | But threshold hardcoded, ignores config |
| Reconnection overlay | DONE | |
| Preflight checks | DONE | But AudioContext/MediaStream leak |
| End session flow | DONE | But polling loop can update unmounted component |

### Prompt 9: LTI 1.3, Scoring Engine, and PDF Reports
| Deliverable | Status | Notes |
|---|---|---|
| LTI 1.3 launch handler | DONE | But redirect leaks refresh_token in URL |
| LTI deep linking | DONE | But open redirect vulnerability |
| LTI grade passback (AGS) | DONE | |
| LTI platform registration CRUD | DONE | |
| Scoring engine | BROKEN | Self-call payload missing required fields, always 422 |
| PDF report generation | DONE | But Puppeteer per-request is DoS vector |
| Report view page | DONE | |

### Prompt 10: Testing, Security, Monitoring, Load Testing, Deployment
| Deliverable | Status | Notes |
|---|---|---|
| Unit tests (API) | DONE | 6 test files |
| Integration tests (API) | DONE | 4 test files |
| E2E tests (Playwright) | DONE | 3 spec files |
| Python unit tests | DONE | 5 test files |
| Load tests (k6) | DONE | 4 scenarios, but no WebSocket testing |
| Prometheus metrics | PARTIAL | Some metrics defined but never recorded |
| Grafana dashboards | DONE | But metric names don't match alert rules |
| Alert rules | DONE | But namespace/metric mismatches |
| Security hardening | PARTIAL | Multiple critical vulnerabilities remain |
| K8s SecurityContext | DONE | |

---

## PART 2: ALL ISSUES BY SEVERITY

### CRITICAL (27 issues)

#### Frontend (6)
| # | Issue | File | Description |
|---|---|---|---|
| FC1 | Client-side admin auth bypass | `(admin)/layout.tsx` | JWT role check done client-side only; attacker can craft any JWT payload to pass |
| FC2 | Client-side learner auth bypass | `(learner)/layout.tsx` | Same as FC1 for learner routes |
| FC3 | Tokens in localStorage (XSS risk) | `lib/auth.ts`, `login/page.tsx` | Access tokens in localStorage accessible to any XSS |
| FC4 | Token in URL hash fragment | `callback/page.tsx` | Token leaked via browser history, referrer headers |
| FC5 | AudioContext + rAF memory leak | `session/[id]/page.tsx` | Mic check resources never cleaned up |
| FC6 | Dev login exposed in prod risk | `login/page.tsx` | NODE_ENV build-time check can be misconfigured |

#### Backend API (8)
| # | Issue | File | Description |
|---|---|---|---|
| BC1 | Session limit race condition | `session.routes.ts:79-99` | Non-atomic read-check-increment allows exceeding concurrent limit |
| BC2 | Rate limit INCR+EXPIRE not atomic | `rate-limit.ts:9-12` | Process crash between commands = permanent rate limit |
| BC3 | Session INCR+EXPIRE not atomic | `session.routes.ts:99-100` | Same as BC2 for active session counter |
| BC4 | Session end lacks user ownership | `session.routes.ts:225-293` | Any tenant user can end any other user's session |
| BC5 | Zod validate() middleware never used | `validate.ts` + all routes | Built but never imported/applied to any route |
| BC6 | LTI open redirect | `lti.routes.ts:309-312` | Redirects to config value without URL validation |
| BC7 | Refresh token in LTI URL fragment | `lti.routes.ts:324-331` | Refresh token should never be in URLs |
| BC8 | User role overwritten on every login | `user-service.ts:24` | IdP role assertion blindly overwrites DB role |

#### AI Service (7)
| # | Issue | File | Description |
|---|---|---|---|
| AC1 | Per-chunk guardrail = incoherent output | `orchestrator.py:220-224` | Single chunk replaced but rest continues (CLAUDE.md #15) |
| AC2 | No authentication on any route | All route files | Zero auth middleware; any caller can invoke any operation |
| AC3 | Session lock dict grows unboundedly | `session.py:25` | Locks never cleaned for abandoned sessions = memory leak |
| AC4 | S3 download has no authentication | `embedding.py:54` | Plain HTTP GET with no AWS SigV4 signing |
| AC5 | Trivially bypassable injection detection | `guardrails.py:18-23` | Only 4 regex patterns; Unicode/encoding evades all |
| AC6 | `_history` used before `start()` | `orchestrator.py` | AttributeError if audio arrives before start completes |
| AC7 | LiveKit dev credentials as defaults | `config.py:30-31` | Production silently uses `devkey:devsecret` if env not set |

#### Infrastructure (6)
| # | Issue | File | Description |
|---|---|---|---|
| IC1 | Deploy workflows reference non-existent dirs | `deploy-staging.yaml`, `deploy-prod.yaml` | `k8s/staging/` and `k8s/production/` don't exist |
| IC2 | Ingress cross-namespace reference broken | `k8s/ingress.yaml:35` | K8s Ingress can't reference services in other namespaces |
| IC3 | Ingress API routes to wrong namespace | `k8s/ingress.yaml` | Ingress in `frontend` NS, API in `api` NS |
| IC4 | Build-push no CI gate | `build-push.yaml` | Images pushed without requiring CI to pass |
| IC5 | Hardcoded dev credentials in compose | `docker-compose.yml` | `postgres`/`devkey`/`minioadmin` with no warnings |
| IC6 | Prod compose uses `:latest` tags | `docker-compose.prod.yml` | MinIO and LiveKit not pinned |

### HIGH (40 issues)

#### Frontend (10)
| # | Issue | Description |
|---|---|---|
| FH1 | Dashboard API failure shows empty state, not error | No error UI when assignment fetch fails |
| FH2 | Reports page silently fails | Error logged but user sees "not available" with no retry |
| FH3 | Unvalidated image URLs from API | External URLs rendered as `img src` directly |
| FH4 | Personas list has no pagination | All personas fetched at once |
| FH5 | Scenarios list has no pagination | All scenarios fetched at once |
| FH6 | Analytics uses bare spinner (violates CLAUDE.md) | Should use skeleton loaders |
| FH7 | Stale closure in idle timeout effect | `endSession` not in useEffect dependency array |
| FH8 | Hardcoded tenant name "Acme Corp" | Admin sidebar shows static tenant |
| FH9 | session-store.ts is dead code | Zustand store imported nowhere |
| FH10 | useSearchParams without Suspense boundary | SSO, session, reports pages |

#### Backend API (10)
| # | Issue | Description |
|---|---|---|
| BH1 | No rate limiting on avatar/persona/scenario/analytics/LTI routes | Only auth and session create are rate-limited |
| BH2 | Fire-and-forget AI service calls | `callAIServiceBackground` never retries |
| BH3 | AI service calls lack auth headers | INTERNAL_API_KEY never sent |
| BH4 | SAML IdP cert is empty string | Signature validation likely disabled |
| BH5 | SSO callback doesn't check null tenant | Null pointer if tenant slug invalid |
| BH6 | OIDC code verifier not persisted | PKCE flow broken; verifier lost between requests |
| BH7 | Puppeteer PDF is DoS vector | New Chromium per request, no concurrency limit |
| BH8 | revokeAllUserTokens non-atomic iteration | Race condition during revocation |
| BH9 | Scenario GET leaks persona_system_prompt to learners | No field filtering by role |
| BH10 | Metrics endpoint publicly accessible | `/metrics` has no auth middleware |

#### AI Service (10)
| # | Issue | Description |
|---|---|---|
| AH1 | create_task without exception handler | `_persist_transcript` errors silently lost |
| AH2 | No rate limiting on any endpoint | DoS risk on session/start |
| AH3 | HeyGen provider has no retry logic | Single failure = total failure |
| AH4 | pipeline_errors_total never recorded | Metric defined but never `.inc()`'d |
| AH5 | Redis connection leaks on start() failure | Only closed in end() |
| AH6 | Silence monitor spawned recursively on reconnect | Multiple monitors can run simultaneously |
| AH7 | Scoring self-call always fails (422) | Payload missing required fields |
| AH8 | Blocked topic check is substring-based | "war" blocks "software", "warning" |
| AH9 | Dockerfile requirements.txt may be stale | Project uses pyproject.toml |
| AH10 | Missing `livekit-rtc` dependency | pyproject.toml has `livekit-api` but code imports `livekit.rtc` |

#### Infrastructure (10)
| # | Issue | Description |
|---|---|---|
| IH1 | No PodDisruptionBudgets | CLAUDE.md requires PDB for every deployment |
| IH2 | No egress network policies | Compromised pod can reach internet freely |
| IH3 | AI HPA uses custom metric only, no CPU fallback | Scaling fails if Prometheus adapter is down |
| IH4 | ExternalSecret hardcodes production path | Staging reads production secrets |
| IH5 | Missing ExternalSecrets for AI + frontend | Deployments reference missing secrets |
| IH6 | LiveKit ports published to host in prod | Should be behind ingress/LB |
| IH7 | Long-lived AWS keys instead of OIDC | Risk of credential leak |
| IH8 | No rollback in staging deploy | Bad deploy stays broken |
| IH9 | Redis has no password in dev | Accessible on shared networks |
| IH10 | AlertManager metric name mismatches | pipeline_errors mixed with http_requests |

### MEDIUM (41 issues)

#### Frontend (14)
| # | Issue | Description |
|---|---|---|
| FM1 | `decodeJwtPayload` duplicated in 2 layouts | Should use shared lib/auth.ts |
| FM2 | No `<title>` metadata on individual pages | CLAUDE.md requires proper titles |
| FM3 | No breadcrumbs on learner pages | CLAUDE.md requires breadcrumbs |
| FM4 | Cards use div+onClick instead of Link | Not keyboard-navigable, no new-tab support |
| FM5 | Delete modal has no focus trap | No role=dialog, no aria-modal |
| FM6 | Form labels missing htmlFor/id pairing | Clicking label doesn't focus input |
| FM7 | Empty states are text-only, no icon/CTA | CLAUDE.md requires designed empty states |
| FM8 | "Try Again" button navigates back | Label says retry but action is go-back |
| FM9 | AuthProvider may never set loading=false | Success path doesn't explicitly setLoading(false) |
| FM10 | Video element ref cleanup has stale ref | Should capture ref before cleanup return |
| FM11 | Date formatting is locale-dependent | Inconsistent across browsers |
| FM12 | Recharts may cause SSR hydration flash | No Suspense boundary |
| FM13 | endSession polling can update unmounted component | 15s blocking loop with no abort |
| FM14 | PDF download bypasses apiClient token refresh | Manual fetch with raw localStorage read |

#### Backend API (13)
| # | Issue | Description |
|---|---|---|
| BM1 | SSO callback redirect URL constructed unsafely | Derived from env var with string replace |
| BM2 | UUID route params not validated | Invalid UUIDs cause 500s instead of 400s |
| BM3 | Avatar PATCH accepts arbitrary config JSON | No schema on nested JSON field |
| BM4 | No `trust proxy` configuration | req.protocol unreliable behind reverse proxy |
| BM5 | LTI platform CRUD bypasses RLS | Uses db.query instead of db.tenantQuery |
| BM6 | Can assign learners to inactive scenarios | Status not checked on assignment |
| BM7 | Analytics learner history has no pagination | Returns ALL sessions |
| BM8 | SSO adapter caches clients forever | No eviction, no config change detection |
| BM9 | Error handler may leak AppError details | Sensitive SQL info in error details |
| BM10 | Rate limit disabled on Redis failure | Open-fail design |
| BM11 | LTI grade passback lacks RBAC | Any user can trigger grade passback |
| BM12 | Tenant cache doesn't invalidate on deactivation | 5-min stale window |
| BM13 | Health check has no timeout | Can hang indefinitely |

#### AI Service (12)
| # | Issue | Description |
|---|---|---|
| AM1 | FastAPI on_event("shutdown") deprecated | Should use lifespan context |
| AM2 | CORS wildcard methods+headers with credentials | Overly permissive |
| AM3 | No audio payload size limit | Memory pressure from large payloads |
| AM4 | send_audio doesn't validate connection state | Race between close callback and send |
| AM5 | Pinecone ops are synchronous, block event loop | Should use asyncio.to_thread() |
| AM6 | New httpx.AsyncClient per request | No connection pooling |
| AM7 | _reconnect can recurse without bound | Should use loop instead of recursion |
| AM8 | Scoring doesn't validate LLM JSON structure | Malformed output = silent 0.0 score |
| AM9 | No timeout on OpenAI streaming calls | Pipeline stalls indefinitely on hang |
| AM10 | file_type not validated against allowed types | Should use Literal type |
| AM11 | PII regex patterns duplicated and divergent | stt.py vs guardrails.py different patterns |
| AM12 | _latency dict shared across concurrent turns | Stale data race |

#### Infrastructure (2)
| # | Issue | Description |
|---|---|---|
| IM1 | docker-compose files use deprecated `version` field | |
| IM2 | Test compose port conflicts with dev compose | Both use 5433 |

### LOW (35 issues)

#### Frontend (12)
| # | Issue | Description |
|---|---|---|
| FL1 | LogoMark component duplicated in 3 files | Should be shared |
| FL2 | Object URL never revoked in avatar create | Blob URL memory leak |
| FL3 | formatTime helper duplicated | session page + controls-bar |
| FL4 | Scenario create has no `<form>` element | No Enter-to-submit, no semantic structure |
| FL5 | Admin header may lack AuthProvider context | useAuth without provider |
| FL6 | scoring_rubric typed as any[] | Lost type safety |
| FL7 | handleDrop creates fake event object | Fragile pattern |
| FL8 | SSO error state declared but never set | Dead code |
| FL9 | Tables not responsive on mobile | Scenarios + analytics overflow at 375px |
| FL10 | Settings loadSettings not in useEffect deps | React strict mode warning |
| FL11 | Root layout missing AuthProvider | Auth context per-layout only |
| FL12 | Idle timeout threshold hardcoded | Ignores sessionConfig.idleTimeoutSec |

#### Backend API (10)
| # | Issue | Description |
|---|---|---|
| BL1 | CSP allows unsafe-inline for styles | Weakens CSP |
| BL2 | Default env values are dev credentials | No staging guard |
| BL3 | S3 key includes user-supplied filename | Path traversal risk in key |
| BL4 | 50MB file upload in memory | Memory pressure under concurrent uploads |
| BL5 | console.error in index.ts instead of logger | Misses structured logging |
| BL6 | LTI platform total uses rows.length | Breaks if pagination added |
| BL7 | JWT algorithm detected on every call | Should compute once at startup |
| BL8 | LTI AGS context key is fragile | Last context wins |
| BL9 | express.json 10MB limit excessive | Slow-loris risk |
| BL10 | Pre-signed S3 URL expires before AI service uses it | Avatar create URL may expire |

#### AI Service (11)
| # | Issue | Description |
|---|---|---|
| AL1 | debug=True as default in config | Swagger exposed in production |
| AL2 | No /health/ready endpoint | K8s readiness probes need this |
| AL3 | LiveOptions=None fallback useless | TypeError at runtime |
| AL4 | Missing __init__.py files | Import resolution may fail |
| AL5 | Token counting imprecise | Per-delta increment unreliable |
| AL6 | conversation_history trimmed twice | Redundant but harmless |
| AL7 | No request/trace ID propagation | Can't correlate distributed logs |
| AL8 | Missing livekit-rtc dependency | Code imports it, pyproject.toml doesn't list it |
| AL9 | embed_batch no partial failure handling | Early failure loses remaining batches |
| AL10 | Shutdown doesn't wait for background tasks | In-flight work interrupted |
| AL11 | _trigger_scoring payload is incomplete | Always returns 422 (duplicate of AH7) |

#### Infrastructure (12)
| # | Issue | Description |
|---|---|---|
| IL1 | container_name prevents docker compose scaling | |
| IL2 | No Docker Compose profiles for selective startup | |
| IL3 | .gitignore missing playwright-report/ | |
| IL4 | .gitignore missing results/ (load test output) | |
| IL5 | Load test has no WebSocket testing | Core product is real-time sessions |
| IL6 | Load test jumps to 50 VUs with no ramp | Misses ramp-up issues |
| IL7 | Session create P95 threshold too generous (2.5s) | |
| IL8 | turbo.json missing env passthrough | Cache invalidation issues |
| IL9 | pnpm-workspace missing tests/ directory | |
| IL10 | Dependabot pip only scans ai-service | |
| IL11 | Prod compose deploy.resources ignored without Swarm | |
| IL12 | SSL cert expiry alert severity too low (info) | Should be warning at 14d |

---

## PART 3: WHAT COULD HAVE BEEN DONE BETTER (ARCHITECTURAL LEARNINGS)

### 1. Token Storage Strategy
**What happened:** Access tokens stored in localStorage, refresh tokens leaked in URL fragments.
**Better approach:** Use httpOnly secure cookies for token storage. The API should set cookies on login and the frontend should never touch tokens directly. This eliminates XSS token theft entirely.
**Why it matters:** A single XSS vulnerability anywhere in the app (including third-party scripts) compromises all user tokens.

### 2. Validation-First Route Design
**What happened:** Zod `validate()` middleware was built but never wired to any route. Manual `if (!field)` checks are inconsistent.
**Better approach:** Every route definition should include its Zod schema as the first middleware. Build a route factory: `createRoute({ method, path, schema, handler })` that enforces schema validation by construction, not convention.
**Why it matters:** 25+ route handlers have inconsistent or missing validation.

### 3. Inter-Service Authentication
**What happened:** AI service has zero authentication. API gateway sends requests without any auth header.
**Better approach:** Implement mTLS or shared secret (X-Internal-Key header) from day 1. The AI service should reject all requests without a valid internal key.
**Why it matters:** Any network actor can invoke AI operations, start sessions, or delete embeddings.

### 4. Per-Chunk vs Buffered Guardrails
**What happened:** Output guardrails replace individual LLM chunks, creating incoherent responses.
**Better approach:** Buffer the complete LLM response, run guardrails on the full text, and only then send to the avatar API. OR: stream directly but abort the entire response on guardrail violation and send a clean fallback.
**Why it matters:** Users receive garbled responses mixing safety fallback with normal conversation.

### 5. Atomic Redis Operations
**What happened:** Multiple places use INCR then EXPIRE as separate commands. Rate limiting, session counting, and token refresh all have this pattern.
**Better approach:** Use Lua scripts for all multi-step Redis operations. Redis executes Lua atomically, eliminating race conditions.
**Why it matters:** Process crashes between commands create permanent rate limits or phantom session counts.

### 6. Client-Side Auth Checks
**What happened:** Admin/learner layouts decode JWT client-side to check roles.
**Better approach:** Use Next.js middleware (`middleware.ts`) to validate tokens server-side before the page even renders. Client-side checks are for UX, server-side checks are for security.
**Why it matters:** Anyone can craft a base64 JWT payload to pass client-side role checks.

### 7. Scoring Pipeline Integration
**What happened:** Scoring self-calls the AI service with an incomplete payload that always 422s.
**Better approach:** The scoring trigger should either (a) call the scoring function directly (same process), or (b) send the complete payload with all required fields. Integration test this flow specifically.
**Why it matters:** No session ever receives a score. The entire scoring pipeline is broken.

### 8. Kubernetes Deployment Architecture
**What happened:** Ingress tries to reference services across namespaces, ExternalSecrets are incomplete, deploy workflows reference non-existent directories.
**Better approach:** Either (a) put all services in one namespace with network policies for isolation, or (b) create per-namespace Ingress resources. Validate all K8s manifests with `kubectl apply --dry-run=server` in CI.
**Why it matters:** Every deployment to staging or production will fail.

### 9. Connection Pooling for External APIs
**What happened:** Every HTTP call to external services (OpenAI, Deepgram, Simli, S3) creates a new client.
**Better approach:** Create clients once in the application lifespan and reuse them. This enables connection pooling and eliminates TCP/TLS handshake overhead.
**Why it matters:** At 120 concurrent sessions, this creates hundreds of unnecessary connections per second.

### 10. Observability Gap
**What happened:** Metrics defined but not recorded. Dashboard and alert rules use different metric names. No request/trace ID propagation.
**Better approach:** Define a single metrics registry, wire every metric at the point of use (not just definition), and verify with integration tests. Add OpenTelemetry trace context to all inter-service calls.
**Why it matters:** When something goes wrong in production, there's no way to trace a request through the system or know which pipeline stage failed.

---

## PART 4: PRIORITY ACTION PLAN

### Immediate (Block deployment)
1. Fix deploy workflows to reference actual k8s directories
2. Fix Ingress cross-namespace issue (separate Ingress per namespace or single namespace)
3. Add authentication to AI service routes (X-Internal-Key)
4. Fix scoring self-call payload (add required fields)
5. Wire Zod validate() middleware to all API routes
6. Add user ownership check to session end endpoint
7. Fix LTI redirect to not leak refresh token in URL
8. Make Redis operations atomic (Lua scripts)

### Short-term (Before user testing)
9. Move tokens from localStorage to httpOnly cookies
10. Add server-side auth check in Next.js middleware
11. Fix per-chunk guardrail to buffer complete response
12. Add rate limiting to all route groups
13. Add pagination to personas and scenarios lists
14. Persist OIDC code verifier in Redis
15. Add PodDisruptionBudgets to all K8s deployments
16. Fix ExternalSecrets for AI service and frontend
17. Add retry mechanism to callAIServiceBackground

### Medium-term (Before production)
18. Add egress network policies
19. Switch to OIDC for GitHub Actions AWS auth
20. Pool Puppeteer instances for PDF generation
21. Add connection pooling for httpx clients
22. Wrap Pinecone calls in asyncio.to_thread()
23. Add request/trace ID propagation (OpenTelemetry)
24. Fix all metric name mismatches between dashboard and alerts
25. Add WebSocket load testing
26. Clean up dead code (session-store.ts, duplicated helpers)
27. Add proper accessibility (focus traps, ARIA labels, semantic forms)

---

## PART 5: NEW CLAUDE.MD MISTAKES TO ADD

34. **Scoring self-call sends incomplete payload**: `_trigger_scoring` sends `{"session_id": id}` but `EvaluateRequest` requires `rubric`, `persona_context`, `scenario_objective`, `tenant_id`. The call always 422s. ALWAYS verify request payloads match the target endpoint's schema before implementing inter-service calls
35. **OIDC code verifier generated but never persisted**: `getLoginUrl()` creates a PKCE code_verifier but doesn't store it. `validateOIDCCallback()` can never verify it. ALWAYS persist ephemeral auth state (nonces, verifiers, state params) in Redis with TTL
36. **Client-side role check as sole authorization**: Admin/learner layouts decode JWT client-side but anyone can craft a valid-looking base64 payload. ALWAYS enforce authorization server-side (Next.js middleware or API), client checks are UX only
37. **Cross-namespace Ingress reference**: K8s Ingress in `frontend` namespace references service in `api` namespace. K8s Ingress can ONLY reference services in its own namespace. ALWAYS validate K8s manifests with `kubectl apply --dry-run=server`
38. **New httpx.AsyncClient per request**: Every HTTP call creates + destroys a client, preventing connection pooling. ALWAYS create HTTP clients once at app startup and reuse them
39. **Pinecone synchronous calls in async context**: `index.upsert()` and `index.delete()` block the event loop. ALWAYS use `asyncio.to_thread()` for synchronous I/O in async functions
40. **Substring-based topic blocking**: `if topic in text` makes "war" block "software". ALWAYS use word-boundary regex for keyword matching
41. **PII regex patterns duplicated and divergent**: STT and guardrails have different patterns for SSN/phone. ALWAYS define shared constants for regex patterns used in multiple modules
42. **debug=True as production default**: If env var not set, Swagger docs are exposed in production. ALWAYS default debug/dev flags to False/disabled
43. **Metrics endpoint publicly accessible**: `/metrics` has no auth, exposing internal service details. ALWAYS protect observability endpoints with auth or network policy
