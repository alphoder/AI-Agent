# AI Avatar Training Platform - Comprehensive Code Review v2

**Review Date:** 2026-03-19 (Second Pass)
**Reviewer:** Claude Opus 4.6 (Automated Scheduled Review)
**Scope:** Full codebase deep-dive across API, Frontend, AI Service, Infrastructure, CI/CD, Tests

---

## Executive Summary

All 10 build prompts have been implemented. The platform is **architecturally sound and feature-complete** at ~75% production readiness. This second-pass review identified **108 total issues** across all layers, including **14 critical**, **23 high**, **38 medium**, and **33 low** severity findings.

**Previous review found 72 issues. This deeper review found 108** by examining actual code at line-level.

**Overall Score: 7/10** - Needs significant hardening before production.

---

## BLOCKING ISSUES (Must Fix Before Any Deployment)

### BLOCK-1: Exposed API Keys in .env File
- **Severity:** CRITICAL SECURITY
- **Location:** `.env` (lines 34, 39, 44, 66)
- **Details:** Real API keys for OpenAI, Deepgram, Simli, Pinecone committed to Git
- **Action:** Revoke ALL keys immediately, rotate, clean Git history with `git filter-branch`

### BLOCK-2: K8s REGISTRY Placeholder Never Substituted
- **Severity:** CRITICAL - All deployments will fail
- **Location:** `.github/workflows/deploy-staging.yaml`, `deploy-prod.yaml`
- **Details:** `sed` only replaces `IMAGE_TAG` but NOT `REGISTRY` placeholder in K8s manifests
- **Fix:** Add `sed -i "s|REGISTRY|${ECR_REGISTRY}|g"` before image tag substitution

### BLOCK-3: Missing K8s Staging/Production Directories
- **Severity:** CRITICAL - Deployments will fail
- **Location:** CI/CD references `k8s/staging/*.yaml` and `k8s/production/*.yaml` which don't exist
- **Fix:** Create `k8s/staging/`, `k8s/production/` with Kustomize overlays, or fix workflow paths

### BLOCK-4: Missing User Ownership on Session Read Endpoints
- **Severity:** CRITICAL DATA BREACH
- **Location:** `apps/api/src/routes/session.routes.ts` (lines 298-529)
- **Details:** `GET /sessions/:id`, `/transcript`, `/report`, `/report/pdf` only check tenant, NOT user ownership. Any authenticated user can read any other user's sessions, transcripts, and reports.
- **Fix:** Add `WHERE s.user_id = $X` or require `rbac('admin')` for cross-user access

### BLOCK-5: Score Endpoint Has No Auth/RBAC
- **Severity:** CRITICAL
- **Location:** `apps/api/src/routes/session.routes.ts` (lines 393-458)
- **Details:** `POST /sessions/:id/score` accepts any authenticated user. Any user can post fake scores.
- **Fix:** Implement API key auth for AI service calls, or add explicit role check

---

## BUILD PROMPT COMPLETION STATUS

| # | Build Prompt | Status | Completeness | Key Gaps |
|---|-------------|--------|-------------|----------|
| 1 | Project Scaffolding, Infrastructure, CI/CD | Complete | 85% | K8s dirs missing, registry bug, no build cache, Trivy silenced |
| 2 | Database Schema, Migrations, Multi-Tenancy, RLS | Complete | 95% | Minor: system_prompt_version never incremented |
| 3 | Authentication (SSO SAML/OIDC), JWT, RBAC | Complete | 75% | JWT race condition, empty revokeAllUserTokens(), logout no auth check, SSO page stubbed |
| 4 | Avatar Creation Module | Complete | 85% | No magic-byte re-encode, missing loading states on admin actions |
| 5 | Persona Curation with RAG | Complete | 80% | Test persona chat is placeholder, escalation triggers unused, no edit page |
| 6 | Scenario Builder Module | Complete | 70% | No scenario edit page, no multi-tab editor, no drag-reorder rubric |
| 7 | Real-Time Pipeline (STT+LLM+Avatar) | Complete | 75% | Missing PII redaction, no LLM timeout, hardcoded localhost, per-chunk guardrails broken, audio buffer never flushed |
| 8 | Learner Session Room (Frontend) | Complete | 80% | No mic waveform, no reconnection overlay, PDF download non-functional |
| 9 | LTI 1.3, Scoring, PDF Reports | Complete | 80% | No LTI platform registration endpoints, grade passback no retry queue |
| 10 | Testing, Security, Monitoring, Load Testing | Complete | 70% | E2E/load tests not in CI, Trivy/npm audit silenced, no web unit tests, SecurityContext missing from all K8s |

---

## API ISSUES (apps/api) - 30 Issues

### Critical (5)

| ID | Issue | Location | Line(s) | Details |
|----|-------|----------|---------|---------|
| API-1 | No ownership on session reads | `session.routes.ts` | 298-529 | Any tenant user can read any other user's session data, transcripts, reports, PDFs |
| API-2 | Score endpoint no auth/RBAC | `session.routes.ts` | 393-458 | Any authenticated user can post fake scores to any session |
| API-3 | Learner analytics no ownership check | `analytics.routes.ts` | 265-363 | Any learner can view any other learner's analytics |
| API-4 | Fire-and-forget AI service calls | Multiple routes | - | Avatar creation, embedding, scoring use `callAIServiceBackground()` with no retry, no queue, no tracking |
| API-5 | Zod validation middleware not applied | All route files | - | `validate()` middleware exists but never used on any route |

### High (8)

| ID | Issue | Location | Line(s) | Details |
|----|-------|----------|---------|---------|
| API-6 | JWT refresh race condition | `jwt-service.ts` | 105-163 | Delete old + check + create new not atomic, concurrent requests can slip through |
| API-7 | revokeAllUserTokens() is empty | `jwt-service.ts` | 168-172 | Function body is just a comment - tokens never actually revoked on logout |
| API-8 | Logout endpoint no auth middleware | `auth.routes.ts` | 215-229 | Can trigger logout for anyone via cookie without access token validation |
| API-9 | No LTI platform registration endpoints | `lti.routes.ts` | - | Admins must manually insert platform rows into DB |
| API-10 | LTI redirect uses unvalidated config | `lti.routes.ts` | 309-331 | Redirect to `config.corsOrigins[0]` without URL validation (open redirect) |
| API-11 | LTI nonce no unique DB constraint | `lti.routes.ts` | 243-250 | Stored in Redis AND DB without deduplication |
| API-12 | Session creation doesn't validate scenario status | `session.routes.ts` | - | Users can start sessions on draft scenarios |
| API-13 | SSO callback URL from request headers | `auth.routes.ts` | 34 | Vulnerable to header injection |

### Medium (9)

| ID | Issue | Location | Line(s) | Details |
|----|-------|----------|---------|---------|
| API-14 | Avatar GET no RBAC | `avatar.routes.ts` | 139, 192 | Any user can list/view all avatars (may expose system prompts) |
| API-15 | Persona GET no RBAC | `persona.routes.ts` | 159, 209 | Any user can view persona prompts, guardrails, system instructions |
| API-16 | No access token revocation on logout | `jwt-service.ts` | - | Access token valid for 15 min after logout |
| API-17 | Missing JWT audience claim | `jwt-service.ts` | - | No `aud` to prevent cross-service token misuse |
| API-18 | Concurrent session limit race condition | `session.routes.ts` | 78-99 | Check+increment not atomic, limits can be exceeded |
| API-19 | No rate limiting on LTI endpoints | `lti.routes.ts` | 59-157 | JWKS, login, launch have no rate limits |
| API-20 | No audit log cleanup/TTL | `audit-logger.ts` | - | Table grows indefinitely |
| API-21 | Database constraint errors not handled | `error-handler.ts` | - | All non-AppError logged as "unexpected" |
| API-22 | LTI custom claims not validated | `lti.routes.ts` | 253-320 | scenario_id from JWT not checked against platform tenant |

### Low (8)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| API-23 | HS256 fallback in dev | `jwt-service.ts` | Weak algorithm when key doesn't start with `-----` |
| API-24 | Inconsistent pagination fields | Multiple | Some use `count`, others `total` |
| API-25 | No graceful shutdown for LiveKit rooms | `index.ts` | Rooms not cleaned on shutdown |
| API-26 | RAG params not in persona response | `persona.routes.ts` | Selected but not returned |
| API-27 | JSON.parse on Redis without try-catch | `lti.routes.ts` | Corrupted data crashes service |
| API-28 | No logging of failed auth IPs | `auth.ts` | Can't detect brute force attacks |
| API-29 | Health check doesn't check AI service | `app.ts` | Only checks DB+Redis |
| API-30 | No limit on refresh tokens per user | `jwt-service.ts` | Redis exhaustion possible |

---

## FRONTEND ISSUES (apps/web) - 18 Issues

### Critical (3)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| FE-1 | PDF download button non-functional | `reports/page.tsx:470-474` | Button renders but `onClick` is missing/empty. **Still unfixed.** |
| FE-2 | No scenario edit page | `(admin)/scenarios/[id]/page.tsx` | File doesn't exist. Create-only CRUD. **Still unfixed.** |
| FE-3 | SSO page is a stub | `(auth)/sso/page.tsx:1-7` | Just `<h1>SSO Login</h1>`. Non-functional. |

### High (3)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| FE-4 | Placeholder text no NODE_ENV guard | `personas/[id]/page.tsx:247` | "Chat interface will be available after session pipeline is built (Prompt 7)". **Still unfixed.** |
| FE-5 | Missing mic waveform visualization | `session/[id]/page.tsx` | Only has on/off toggle, no waveform during session |
| FE-6 | No reconnection overlay | `session/[id]/page.tsx` | Only status text shown, no prominent UI overlay with auto-retry |

### Medium (7)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| FE-7 | Speaker check auto-passes | `session/[id]/page.tsx:119` | Can't actually test speakers without audio output |
| FE-8 | Spinner vs skeleton inconsistency | `avatars/page.tsx:96`, `personas/page.tsx:51`, `scenarios/page.tsx:75` | Bare spinner instead of skeleton grid |
| FE-9 | Error messages via alert() | `avatars/[id]/page.tsx:83` | Browser alert() instead of toast |
| FE-10 | No persona edit page | `personas/page.tsx` | Can view details but no explicit edit CTA |
| FE-11 | Admin sidebar emoji icons | `(admin)/layout.tsx` | Uses emoji instead of Lucide icons |
| FE-12 | Admin tables not responsive | `scenarios/page.tsx`, `analytics/page.tsx` | No card-view fallback for mobile |
| FE-13 | Missing form validation on criteria names | `scenarios/create/page.tsx` | Can add rubric criteria without name |

### Low (5)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| FE-14 | Hardcoded tenant slug "Acme Corp" | `sidebar.tsx:81` | Not derived from actual tenant |
| FE-15 | Pagination rapid-click not debounced | `avatars/page.tsx:150-151` | Edge disabled but no debounce |
| FE-16 | Delete confirmations use browser dialog | Admin pages | Should use styled modal |
| FE-17 | Missing breadcrumbs on detail pages | Multiple | Only "Back" links, not proper breadcrumbs |
| FE-18 | No web component unit tests | `apps/web/` | No Jest/RTL test suite, only E2E tests |

---

## AI SERVICE ISSUES (apps/ai-service) - 27 Issues

### Critical (2)

| ID | Issue | Location | Line(s) | Details |
|----|-------|----------|---------|---------|
| AI-1 | Hardcoded localhost URL | `session.py` | 179 | `http://localhost:8000/scoring/evaluate` instead of config |
| AI-2 | No timeout on S3 download | `embedding.py` | 52-56 | `await client.get(s3_url)` with no timeout, can hang indefinitely |

### High (8)

| ID | Issue | Location | Line(s) | Details |
|----|-------|----------|---------|---------|
| AI-3 | Per-chunk guardrail creates incoherent output | `orchestrator.py` | 207-215 | Single chunk replaced with full fallback mid-stream |
| AI-4 | Metrics defined but never recorded | `metrics.py` | 6-40 | No `.observe()`, `.inc()`, `.set()` calls anywhere in codebase |
| AI-5 | Fire-and-forget transcript persistence | `orchestrator.py` | 243, 275-293 | `asyncio.create_task()` with no retry if API is down |
| AI-6 | Fire-and-forget scoring trigger | `session.py` | 174-184 | Only logs on failure, no retry |
| AI-7 | Fire-and-forget LTI grade passback | `scoring.py` | 67-92 | Grade lost if API gateway unreachable |
| AI-8 | Redis operations not atomic | `orchestrator.py` | 270-273 | rpush + ltrim + expire without MULTI/EXEC |
| AI-9 | Audio buffer never flushed on reconnect | `stt.py` | 55, 158 | Audio buffered during disconnect but never sent to STT after reconnection |
| AI-10 | Process audio task dies silently | `session.py` | 85-99 | `asyncio.ensure_future()` with no exception handler |

### Medium (9)

| ID | Issue | Location | Line(s) | Details |
|----|-------|----------|---------|---------|
| AI-11 | No LLM timeout | `llm.py` | 62-68 | No explicit timeout on OpenAI call |
| AI-12 | No Pinecone timeout | `rag.py` | 44-50, 140-148 | Embedding/query ops have no timeout |
| AI-13 | Session start race condition | `session.py` | 128-152 | Concurrent `/start` calls with same session_id not locked |
| AI-14 | Bot disconnect doesn't guarantee cleanup | `session.py` | 59-125 | Exception before `active_rooms[session_id] = room` skips cleanup |
| AI-15 | S3 response not validated | `embedding.py` | 52-56 | No `raise_for_status()` check |
| AI-16 | RAG singleton lazy init race | `embedding.py` | 16-24 | Non-thread-safe global init |
| AI-17 | STT callback exceptions swallowed | `stt.py` | 99-120 | Outer try/except catches callback errors with minimal context |
| AI-18 | No RBAC on embedding delete | `embedding.py` | 156-162 | Any caller can delete any persona's vectors |
| AI-19 | No RBAC on scoring evaluate | `scoring.py` | 99-225 | Any tenant can trigger scoring on any other tenant's sessions |

### Low (8)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| AI-20 | Silence monitor keepalive is a no-op | `stt.py:164-175` | `keep_alive()` doesn't force transcript finalization |
| AI-21 | Deepgram import stubs not checked | `stt.py:15-22` | If import fails, stubs are None but code doesn't check |
| AI-22 | No httpx connection pooling | Multiple files | Each call creates new AsyncClient |
| AI-23 | RAG store_chunks no partial failure handling | `rag.py:66-107` | Pinecone upsert failure leaves partial vectors |
| AI-24 | Hardcoded dev credentials in config.py | `config.py:30-39` | LiveKit/S3 defaults are dev creds |
| AI-25 | PII redaction not implemented | `stt.py` | Build prompt requires configurable PII redaction |
| AI-26 | Avatar 30s keepalive not implemented | `avatar.py` | Build prompt requires keepalive during silence |
| AI-27 | Response length guardrail missing | `guardrails.py` | Build prompt specifies response length check |

---

## INFRASTRUCTURE & DEVOPS ISSUES - 35 Issues

### Critical (4)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| INFRA-1 | Missing SecurityContext in all K8s deployments | `k8s/*/deployment.yaml` | No runAsNonRoot, readOnlyRootFilesystem, capabilities.drop |
| INFRA-2 | Missing staging/production K8s directories | CI/CD references | Workflows reference dirs that don't exist |
| INFRA-3 | Registry placeholder never substituted | `deploy-*.yaml` | Only IMAGE_TAG replaced, not REGISTRY |
| INFRA-4 | E2E tests not in CI pipeline | `ci.yaml` | Playwright tests exist but never run |

### High (4)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| INFRA-5 | No PodDisruptionBudgets | All K8s deployments | Node drains can evict all pods |
| INFRA-6 | No egress NetworkPolicies | `network-policies.yaml` | Only ingress defined, pods can reach any external host |
| INFRA-7 | Trivy scan continue-on-error | `ci.yaml:157` | Vulnerabilities don't fail the build |
| INFRA-8 | npm audit continue-on-error | `ci.yaml:133` | Dependency vulnerabilities pass silently |

### Medium (15)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| INFRA-9 | Load tests not in CI | `/tests/load/` | k6 scripts exist but not automated |
| INFRA-10 | HPA uses undefined custom metric | `k8s/ai/hpa.yaml:14-20` | `active_sessions` not exported by AI service |
| INFRA-11 | No env-specific K8s overlays | All K8s manifests | Same manifests for all environments |
| INFRA-12 | No web component unit tests | `apps/web/` | No Jest/RTL test suite |
| INFRA-13 | AI service resource limits low | `k8s/ai/deployment.yaml:24-29` | 512Mi may OOMKill during concurrent sessions |
| INFRA-14 | AlertManager rules wrong namespace | `alertmanager-rules.yaml:88` | References `avatar-platform` but actual namespaces are `frontend`, `api`, `ai` |
| INFRA-15 | Metrics not verified as exported | `alertmanager-rules.yaml` | References metrics that may not exist in Prometheus |
| INFRA-16 | No build cache in Docker CI | `build-push.yaml:28-36` | Every build from scratch |
| INFRA-17 | No pre-deployment smoke tests | `deploy-staging.yaml:41-45` | Only checks `/health`, no user flow validation |
| INFRA-18 | Base images not pinned | All Dockerfiles | `node:20-alpine`, `python:3.11-slim` - not reproducible |
| INFRA-19 | No Pod Security Standards labels | `namespaces.yaml` | Namespaces don't enforce PSS |
| INFRA-20 | LiveKit image uses `:latest` tag | `docker-compose.yml:39` | Non-reproducible builds |
| INFRA-21 | Missing .env.example K8s vars | `.env.example` | No CLUSTER_NAME, ENVIRONMENT, etc. |
| INFRA-22 | Grafana dashboard datasource hardcoded | `grafana-dashboards.json` | Assumes UID "prometheus" |
| INFRA-23 | No image scanning post-build | CI pipeline | Only filesystem scan, not built images |

### Low (12)

| ID | Issue | Location | Details |
|----|-------|----------|---------|
| INFRA-24 | Hardcoded service URLs in ConfigMaps | K8s ConfigMaps | Limits flexibility |
| INFRA-25 | External Secrets 1h refresh too long | `external-secret.yaml:7` | Should be 15m for prod |
| INFRA-26 | No DOMAIN env variable | `.env.example` | Cookie domain and CORS need explicit config |
| INFRA-27 | No LOG_LEVEL env variable | `.env.example` | Can't toggle log verbosity |
| INFRA-28 | Test compose uses tmpfs (by design) | `docker-compose.test.yaml` | Correct for test isolation |
| INFRA-29 | No image tag versioning strategy | `build-push.yaml` | Only `sha` + `latest`, no semver |
| INFRA-30 | E2E test coverage incomplete | `apps/web/e2e/` | Missing reconnection, scoring, analytics flows |
| INFRA-31 | No integration test for SessionOrchestrator | `apps/ai-service/tests/` | Most critical code path has zero integration tests |
| INFRA-32 | Missing type guards for shared enums | `packages/shared/src/enums.ts` | No runtime validation helpers |
| INFRA-33 | Missing request/response pair types | `packages/shared/src/types/` | No dedicated types like `CreateAvatarRequest` |
| INFRA-34 | SSOConfig type incomplete | `types/tenant.ts` | Missing attribute_mappings, default_role fields |
| INFRA-35 | OpenAPI 3.0 spec not generated | `docs/` | Build prompt requires it, only markdown docs exist |

---

## WHAT COULD HAVE BEEN DONE BETTER

### Architecture

1. **Message queue for async operations** - Used fire-and-forget HTTP calls. Should use Redis Streams/Bull/SQS for avatar creation, embedding, scoring, and grade passback. Prevents silent failures.

2. **Atomic Redis operations** - JWT refresh and orchestrator history use multi-step Redis without transactions. Should use MULTI/EXEC or Lua scripts.

3. **Complete auth on ALL endpoints** - Several read endpoints lack ownership checks. Every endpoint should verify the requesting user has access to the requested resource.

4. **Buffer-then-filter guardrails** - Per-chunk guardrail replacement creates incoherent mid-stream output. Should buffer complete sentences or full responses before applying safety filters.

5. **Proper token revocation** - `revokeAllUserTokens()` is empty. Should maintain user->token-family mapping in Redis and revoke all on logout.

### Frontend

6. **Shared form components from the start** - Scenario and persona pages are create-only with no edit pages. Should have built `ScenarioForm` and `PersonaForm` as shared components used by both create and edit routes.

7. **Consistent loading patterns** - Some admin pages use bare spinners while others use skeleton loaders. Should have standardized from day one.

8. **SSO page implementation** - SSO page is just a stub `<h1>`. Should either implement or remove and redirect to the real SSO flow.

### Infrastructure

9. **SecurityContext everywhere** - All K8s deployments lack security hardening. Should have included `runAsNonRoot`, `readOnlyRootFilesystem`, `capabilities.drop: [ALL]` from the first manifest.

10. **Kustomize overlays from the start** - Referenced staging/production directories that don't exist. Should have set up Kustomize base/overlay structure in Build Prompt 1.

11. **Security scans as gates, not warnings** - `continue-on-error: true` on Trivy and npm audit means vulnerabilities ship. Should fail the build.

12. **E2E tests in CI from the start** - Wrote comprehensive E2E tests but never integrated them into the pipeline. Tests that don't run are useless.

---

## PRODUCTION READINESS CHECKLIST

### Before First Deployment (Blocking)
- [ ] Revoke and rotate all exposed API keys (BLOCK-1)
- [ ] Fix K8s registry substitution in CI/CD (BLOCK-2)
- [ ] Create staging/production K8s directories (BLOCK-3)
- [ ] Add user ownership checks to session read endpoints (BLOCK-4)
- [ ] Secure score endpoint with API key auth (BLOCK-5)
- [ ] Add ownership check to learner analytics (API-3)
- [ ] Apply Zod validation to all API routes (API-5)
- [ ] Implement revokeAllUserTokens() (API-7)
- [ ] Fix hardcoded localhost in AI service (AI-1)
- [ ] Add SecurityContexts to all K8s deployments (INFRA-1)
- [ ] Remove continue-on-error from security scans (INFRA-7, INFRA-8)

### Before Production Launch
- [ ] Implement scenario edit page (FE-2)
- [ ] Fix PDF download button (FE-1)
- [ ] Add reconnection overlay to session room (FE-6)
- [ ] Add LTI platform registration endpoints (API-9)
- [ ] Fix JWT refresh race condition with MULTI/EXEC (API-6)
- [ ] Add timeout to S3 download (AI-2)
- [ ] Fix per-chunk guardrail replacement (AI-3)
- [ ] Record all Prometheus metrics (AI-4)
- [ ] Add LLM timeout (AI-11)
- [ ] Add E2E tests to CI pipeline (INFRA-4)
- [ ] Add PodDisruptionBudgets (INFRA-5)
- [ ] Add egress NetworkPolicies (INFRA-6)
- [ ] Deploy custom metrics for AI HPA (INFRA-10)

### Post-Launch Improvements
- [ ] Add mic waveform visualization (FE-5)
- [ ] Implement PII redaction in STT (AI-25)
- [ ] Add avatar keepalive mechanism (AI-26)
- [ ] Implement escalation trigger actions (AI-10)
- [ ] Add load test baseline to CI (INFRA-9)
- [ ] Generate OpenAPI 3.0 spec (INFRA-35)
- [ ] Replace emoji icons with Lucide (FE-11)
- [ ] Add skeleton loaders to admin pages (FE-8)
- [ ] Implement SSO page or redirect (FE-3)
- [ ] Add web component unit tests (INFRA-12)

---

## TOTAL ISSUE COUNT

| Severity | Count |
|----------|-------|
| Blocking/Critical | 14 |
| High Priority | 23 |
| Medium Priority | 38 |
| Low Priority | 33 |
| **Total** | **108** |

### By Component

| Component | Critical | High | Medium | Low | Total |
|-----------|----------|------|--------|-----|-------|
| API | 5 | 8 | 9 | 8 | 30 |
| Frontend | 3 | 3 | 7 | 5 | 18 |
| AI Service | 2 | 8 | 9 | 8 | 27 |
| Infrastructure | 4 | 4 | 15 | 12 | 35 |
| **Total** | **14** | **23** | **38** | **33** | **108** |

---

## ISSUES STILL UNFIXED FROM V1 REVIEW

These issues were identified in the first review and remain unfixed:

1. FE-1: PDF download button non-functional
2. FE-2: Scenario edit page missing
3. FE-4: Placeholder text without NODE_ENV guard (persona test tab)
4. API-1/BLOCK-4: No ownership on session reads
5. API-4: Fire-and-forget AI service calls
6. API-5: Zod validation not applied
7. API-6: JWT refresh race condition
8. AI-1: Hardcoded localhost URL
9. AI-3: Per-chunk guardrail incoherence
10. AI-4: Metrics not recorded
11. All BLOCK issues
12. All INFRA K8s issues

## NEW ISSUES FOUND IN V2 (Not in V1)

1. API-3: Learner analytics no ownership check
2. API-7: revokeAllUserTokens() is empty (body was just a comment)
3. API-8: Logout endpoint has no auth middleware
4. API-10: LTI redirect open redirect vulnerability
5. API-18: Concurrent session limit race condition
6. AI-9: Audio buffer never flushed on reconnect
7. AI-10: process_audio task dies silently (no exception handler)
8. AI-13: Session start race condition
9. FE-3: SSO page is just a stub
10. INFRA-8: npm audit also continue-on-error
11. INFRA-14: AlertManager rules reference wrong namespace
12. INFRA-16: No Docker build cache
13. Multiple new medium/low severity findings

---

*This review was auto-generated by a scheduled task (v2 deep review). Issues ranked by production impact. Address blocking issues first.*
