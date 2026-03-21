# AI Avatar Training Platform - Claude Guidelines

## Role
You are a senior full-stack engineer building a production-grade, multi-tenant AI avatar training platform. You write code as if it ships to paying enterprise customers tomorrow. Every component must be polished, accessible, responsive, and delightful to use.

## Design Standards
- **UI Framework**: Next.js 14 App Router + Tailwind CSS + shadcn/ui patterns
- **Design Language**: Clean, modern SaaS aesthetic. Think Linear, Vercel, Notion
- **Typography**: Clear hierarchy. Large bold headings, readable body text, proper spacing
- **Colors**: Use CSS variables from globals.css. Primary blue, semantic colors for status
- **Spacing**: Generous padding. Never cramped. min 16px padding on cards, 24px+ on pages
- **Animations**: Subtle transitions on hover/focus. No jarring layout shifts
- **Responsiveness**: Mobile-first. Every page works on 375px through 1440px+
- **Empty States**: Always designed, never just text. Include illustration or icon + CTA
- **Loading States**: Skeleton loaders, never bare spinners
- **Error States**: Friendly messages with retry actions, never raw error codes

## Code Standards
- **MANDATORY**: After EVERY code change, re-read this CLAUDE.md file and update it if needed
- **MANDATORY**: NEVER declare anything "production ready" without testing EVERY user flow end-to-end in a real browser
- Always match API response shape EXACTLY in frontend interfaces. NEVER guess field names
- Always test API endpoints with curl BEFORE building frontend consumers
- Always handle loading, error, and empty states in every data-fetching component
- Never use placeholder text like "Avatar Video" in production UI
- Never leave dev-only code paths without clear NODE_ENV guards
- Every form needs validation, loading states on buttons, and error display
- JWT/auth: always verify token shape matches what middleware expects
- Database: always verify column names match query aliases

## Mistakes Log (NEVER repeat these)
1. **Field name mismatch**: Dashboard used `a.id` but API returned `assignment_id`. ALWAYS curl the API first and match the exact response shape
2. **JWT RS256 without keys**: Used RS256 algorithm but .env had no RSA keys. ALWAYS check env config before using crypto features
3. **Preflight early return**: `return` inside try block prevented speaker/network checks from running. ALWAYS ensure all async checks complete independently
4. **Rate limit too strict**: 10/min in dev caused "Too many requests" during testing. ALWAYS use relaxed limits in development
5. **No dev auth flow**: SSO-only login with no dev bypass made local testing impossible. ALWAYS include dev login for local development
6. **assignment=undefined in URL**: Dashboard passed undefined because interface field names didn't match API. Same as #1 - ALWAYS verify API shape
7. **Stale Redis tokens**: Old invalid refresh tokens caused cascading auth failures. ALWAYS handle token invalidation gracefully
8. **Poor UI quality**: Minimal styling, no nav, no user context, no polish. ALWAYS build production-quality UI from the start
9. **Hydration mismatch**: Used `useMemo` to read `localStorage` during render, causing server/client mismatch. ALWAYS read browser-only APIs (localStorage, Date for display) inside `useEffect`, never during render or `useMemo`
10. **Validation middleware exists but not applied**: Created `validate()` middleware but didn't apply it to most API routes, leaving 40+ request body fields unvalidated. ALWAYS apply Zod schemas to every endpoint when building routes, not as an afterthought
11. **Missing auth on read endpoints**: Session transcript/report endpoints had no ownership check - any authenticated user could read any session. ALWAYS add ownership or RBAC check on EVERY endpoint, including reads
12. **Fire-and-forget async calls**: Used `fetch(...).catch(log)` for AI service calls (avatar creation, embedding, scoring) with no retry or tracking. ALWAYS use a message queue or at minimum a retry mechanism for critical async operations
13. **Hardcoded service URLs**: AI service used `http://localhost:8000` instead of config. ALWAYS use environment variables for service URLs, never hardcode hostnames
14. **Uninitialized class attributes**: `orchestrator._history` used before `start()` sets it, causing potential AttributeError. ALWAYS initialize all instance attributes in `__init__`
15. **Per-chunk guardrail replacement**: Replacing individual LLM stream chunks with safety fallback creates incoherent output. ALWAYS buffer complete responses before applying content filtering, or skip unsafe chunks entirely
16. **Metrics defined but never recorded**: Created Prometheus histograms/counters in metrics.py but never called `.observe()` or `.inc()` from the actual pipeline code. ALWAYS verify metrics are actually recorded, not just defined
17. **Placeholder text in production code**: Persona test tab shows "Chat interface will be available after session pipeline is built (Prompt 7)" without NODE_ENV guard. ALWAYS either implement the feature or show a proper "Coming soon" UI with NODE_ENV guard
18. **CI/CD references non-existent directories**: Deploy workflows reference `k8s/staging/` and `k8s/production/` that don't exist. ALWAYS verify CI/CD references match actual file structure before committing
19. **Exposed API keys in .env**: Real API keys committed to Git. NEVER commit .env files with real secrets. ALWAYS verify .gitignore includes .env before first commit
20. **Create-only CRUD**: Built scenario create page but no edit page, making it impossible to modify existing scenarios. ALWAYS build create AND edit together as a shared form component
21. **Non-functional UI buttons**: PDF download button renders but onClick is empty. NEVER ship a button that does nothing - either implement it or clearly disable it with tooltip explaining why
22. **Redis operations not atomic**: JWT refresh deletes old token then creates new one without MULTI/EXEC. ALWAYS use transactions for multi-step Redis operations where consistency matters
23. **Declared production-ready without testing**: Said "production ready" without actually testing the full user flow (create avatar, start session, end session). ALWAYS test EVERY user-facing flow end-to-end in a real browser before declaring anything production ready
24. **Not updating CLAUDE.md after changes**: Made dozens of changes without updating CLAUDE.md. ALWAYS update CLAUDE.md after EVERY change, no matter how small. Read it before starting, update it after finishing
25. **Empty function bodies with just comments**: `revokeAllUserTokens()` has a function signature but the body is just a comment - tokens never actually revoked. NEVER leave a function with an empty body or just a comment. Either implement it or throw `NotImplementedError` so callers know it's incomplete
26. **Logout endpoint with no auth check**: POST `/auth/logout` doesn't require `authMiddleware`, allowing anyone to trigger logout via cookie. ALWAYS require auth middleware on endpoints that modify user session state
27. **Security scans silently ignored**: Trivy and npm audit both use `continue-on-error: true` in CI, meaning CRITICAL vulnerabilities pass. NEVER silence security scan failures in CI - either fix the vulnerabilities or explicitly allowlist them
28. **Open redirect in LTI handler**: LTI deep linking redirects to `config.corsOrigins[0]` without URL validation. ALWAYS validate redirect URLs against a whitelist, never trust config values directly in redirects
29. **Audio buffer filled but never flushed**: STT buffers audio during disconnect but never sends it after reconnection. ALWAYS implement both sides of a buffer: filling AND flushing. If you buffer data during disconnect, flush it on reconnect
30. **Background tasks with no exception handler**: `asyncio.ensure_future(process_audio_frames())` has no error callback. If the coroutine raises, the exception is silently lost. ALWAYS add exception handlers to background asyncio tasks via `task.add_done_callback()`
31. **Concurrent request race on session start**: Two concurrent `/start` calls with same session_id both pass the `if session_id in active_sessions` check. ALWAYS use locks or atomic operations for check-then-act patterns in concurrent code
32. **SSO page is a stub**: `sso/page.tsx` renders only `<h1>SSO Login</h1>`. NEVER commit stub pages without clear "not implemented" UI, redirect to working flow, or NODE_ENV guard
33. **AlertManager rules wrong namespace**: Alert rules reference namespace `avatar-platform` but actual namespaces are `frontend`, `api`, `ai`. ALWAYS verify monitoring rules reference actual deployed namespaces and metric names
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
44. **Navigation links using wrong IDs**: Dashboard passed assignment_id to reports but reports needed session_id. Scenario list row click went to non-existent detail page. ALWAYS verify every navigation link points to a real page and passes the correct ID type
45. **Reports page infinite skeleton when no params**: Reports nav link had no session param, causing infinite loading. ALWAYS handle missing query params gracefully — show empty state, not infinite loading
46. **Nullable state accessed without optional chaining**: `user.role` accessed in JSX but `user` state is `UserInfo | null`. TypeScript build fails. ALWAYS use optional chaining (`user?.role`) when accessing nullable state in JSX
47. **Unsafe type casting**: `(user as Record<string, unknown>)` fails when `user` is `User | null` — TypeScript requires casting through `unknown` first. ALWAYS cast through `unknown` for unrelated types: `(x as unknown as TargetType)`
48. **useSearchParams without Suspense boundary**: SSO page uses `useSearchParams()` at top level without Suspense, causing Next.js static prerender to fail. ALWAYS wrap components using `useSearchParams` in a `<Suspense>` boundary
49. **Internal API key has guessable default**: `internal_api_key: str = "dev-internal-key"` in config.py. If env var not set, production uses a trivially guessable key. ALWAYS default security-critical config to empty string and fail closed
50. **Puppeteer page concurrency unbounded**: Shared browser instance with unlimited `newPage()` calls. 100 concurrent PDF requests = 100 Chromium tabs = OOM. ALWAYS add a concurrency semaphore when pooling expensive resources
51. **Chunks streamed to avatar before guardrail check**: Output guardrail runs on full response but chunks already sent to avatar during streaming. User hears unsafe content before correction arrives. ALWAYS complete guardrail checks BEFORE sending content to end user
52. **Non-existent internal API endpoint**: `_persist_transcript` POSTs to `/api/internal/transcripts` which doesn't exist in any Express route file. Transcript data silently lost. ALWAYS verify target endpoint exists before implementing inter-service calls
53. **Silence monitor stacks on reconnect**: Each `connect()` spawns `_monitor_silence` without canceling previous. After N reconnects, N monitors run simultaneously. ALWAYS cancel previous background tasks before spawning replacements

## Architecture Rules
- Every API route: validate input with Zod schema, check auth, check ownership/RBAC, scope to tenant, return consistent envelope
- Every page: proper `<title>`, breadcrumbs where needed, back navigation
- Every list: pagination, empty state, loading skeleton
- Every form: validation, submit loading, success/error feedback
- Every action: confirmation for destructive ops, optimistic UI where safe
- Every async service call: use retry mechanism or message queue, never fire-and-forget
- Every Python class: initialize ALL instance attributes in `__init__`, never rely on methods setting them first
- Every CI/CD workflow: verify referenced file paths exist, test with dry-run before committing
- Every K8s deployment: include SecurityContext, PodDisruptionBudget, resource limits
- Every metric: verify it's both defined AND recorded (called) in the actual code path
- Every CRUD module: build create AND edit as shared form component from the start
- Every UI button: must either function or be visibly disabled with explanation
- Every function: must have a real implementation, never just a comment. Throw NotImplementedError if incomplete
- Every redirect URL: validate against whitelist, never trust config/header values directly
- Every background asyncio task: add exception handler via add_done_callback()
- Every check-then-act pattern: use locks or atomic operations in concurrent code
- Every CI security scan: must fail the build on findings, never use continue-on-error
- Every data buffer: implement both fill AND flush/drain logic
- Every monitoring rule: verify referenced namespaces, metrics, and labels match actual deployments
- Every inter-service call: verify request payload matches the target endpoint's Pydantic/Zod schema
- Every ephemeral auth value (nonce, verifier, state): persist in Redis with TTL, never rely on in-memory state across requests
- Every role/permission check: enforce server-side (middleware), client-side checks are UX hints only
- Every K8s manifest: validate with `kubectl apply --dry-run=server` before committing
- Every HTTP client in async Python: create once at startup, reuse for connection pooling
- Every synchronous I/O call in async context: wrap in asyncio.to_thread()
- Every keyword/topic filter: use word-boundary regex (\b), never plain substring match
- Every regex pattern used in multiple modules: define once in a shared constants module
- Every debug/dev flag: default to False/disabled; production must be safe by default
- Every observability endpoint (/metrics, /health/debug): protect with auth or network policy
- Every nullable state in JSX: use optional chaining, never bare property access
- Every component using useSearchParams: wrap in Suspense boundary for Next.js static generation
- Every type cast: cast through `unknown` when types don't overlap (e.g., `x as unknown as Target`)
- Every security-critical config value (API keys, secrets): default to empty string and fail closed, never use guessable dev defaults in production
- Every resource pool (browser pages, DB connections, HTTP clients): add concurrency semaphore to prevent unbounded resource consumption
- Every inter-service HTTP call: verify the target endpoint actually exists and returns expected status codes before shipping
- Every background task that respawns on reconnect: cancel the previous instance first to prevent stacking

## Known Gaps (see PROJECT_REVIEW_V4.md for full 89-issue inventory)
### FIXED in latest batch:
- ~~PDF download button non-functional~~ FIXED: downloads blob from API
- ~~SSO page is a stub~~ FIXED: redirects to SSO init or shows login link
- ~~revokeAllUserTokens() body is empty~~ FIXED: implemented with Redis family tracking
- ~~Session read endpoints lack ownership~~ FIXED: user ownership check, admin bypass
- ~~Score endpoint has no auth/RBAC~~ FIXED: X-Internal-Key or admin role required
- ~~Hardcoded localhost in AI service~~ FIXED: uses settings.host:settings.port
- ~~Background audio task dies silently~~ FIXED: exception handler + add_done_callback
- ~~Session start race condition~~ FIXED: asyncio.Lock per session_id

### FIXED in this batch:
- ~~Scenario edit page~~ FIXED: edit page at /scenarios/[id]/edit with pre-populated form
- ~~Mic waveform~~ FIXED: 5-bar equalizer visualization responding to audio levels
- ~~Reconnection overlay~~ FIXED: reconnecting spinner + disconnected with retry button
- ~~LTI platform registration~~ FIXED: POST/GET/DELETE /api/lti/platforms endpoints
- ~~Session end lacks user ownership check~~ FIXED: `AND user_id = $3` added for non-admin callers; admins can end any session in their tenant
- ~~LTI leaks refresh_token in URL~~ FIXED: refresh_token removed from URL fragment; set as httpOnly secure cookie instead
- ~~AI metrics not recorded~~ FIXED: all Prometheus histograms/counters wired into pipeline
- ~~PII redaction~~ FIXED: email/phone/SSN redaction configurable via PII_REDACTION_ENABLED
- ~~Audio buffer not flushed~~ FIXED: buffered audio sent to new STT connection on reconnect
- ~~E2E tests not in CI~~ FIXED: Playwright tests added to CI pipeline
- ~~K8s SecurityContext~~ FIXED: runAsNonRoot, readOnlyRootFilesystem, drop ALL capabilities
- ~~CI security scans silenced~~ FIXED: removed continue-on-error, fails on CRITICAL/HIGH
- ~~AI service routes have no authentication~~ FIXED: require_internal_key FastAPI dependency on all session/embedding/scoring routers; API client sends X-Internal-Key header; settings.internal_api_key added to config
- ~~CI/CD deploys reference non-existent k8s/staging/ and k8s/production/~~ FIXED: both deploy-staging.yaml and deploy-prod.yaml now reference k8s/frontend/, k8s/api/, k8s/ai/, k8s/ingress.yaml, k8s/namespaces.yaml
- ~~No server-side auth middleware~~ FIXED: apps/web/src/middleware.ts validates JWT, enforces admin routes, redirects unauthenticated users
- ~~AuthProvider never mounted~~ FIXED: imported and wrapping children in root layout.tsx
- ~~useSearchParams without Suspense~~ FIXED: reports/page.tsx and session/[id]/page.tsx wrapped in Suspense boundaries
- ~~Per-chunk guardrail creates incoherent output~~ FIXED: full response buffered before guardrail check; unsafe responses replaced entirely
- ~~pipeline_errors_total never incremented~~ FIXED: .inc() calls added across 10 error handlers in orchestrator, llm, stt
- ~~No rate limiting on avatar/persona/scenario/analytics/LTI~~ FIXED: rateLimit middleware applied to all 5 route files
- ~~Puppeteer launches new browser per PDF~~ FIXED: shared browser instance with page-level pooling
- ~~persona_system_prompt exposed to learners~~ FIXED: field stripped from response for non-admin callers
- ~~Hardcoded "Acme Corp" tenant~~ FIXED: sidebar accepts tenantName prop; admin layout extracts email domain from JWT
- ~~decodeJwtPayload duplicated~~ FIXED: single definition in lib/auth.ts, imported in both layouts
- ~~livekit missing from pyproject.toml~~ FIXED: livekit>=1.0.0 added to dependencies
- ~~Nullable state accessed without optional chaining~~ FIXED: user?.role in learner layout
- ~~Unsafe type casting~~ FIXED: cast through unknown in admin header
- ~~SSO page useSearchParams without Suspense~~ FIXED: wrapped in Suspense boundary

### All 108 issues from PROJECT_REVIEW.md v2 have been addressed.
### V3 review found 165 issues; ~32 have been fixed as of 2026-03-20.

### V4 Review fixes (2026-03-21): ~40 of 89 issues fixed
**CRITICAL fixed:** C2 (session TOCTOU -> Lua), C3 (scoring pipeline + internal endpoints), C4 (buffer-then-send guardrails), C5 (_history init), C6 (shared httpx), C9+C10 (dev defaults -> empty), C11 (PDF apiClient), C12 (retry backoff)
**HIGH fixed:** H1/H53 (silence monitor cancel), H2 (reconnect loop), H6 (PDF semaphore), H17 (OpenAI timeout), H19 (stale closure ref), H20 (rate limit Lua)
**MEDIUM fixed:** M2 (UUID validation), M4 (trust proxy), M6 (inactive scenario), M11 (CORS explicit), M13 (lifespan), M21 (abort controller), M25 (S3 sanitize), M28 (1MB limit), M29 (/health/ready)
**LOW fixed:** L1 (Object URL revoke), L14 (turbo env), L22 (health timeout)
**Remaining:** C1 (localStorage tokens), C7/C8, H3/H7-H11, M1/M5/M7-M10/M14-M19/M22-M24/M26-M27/M30-M31
- See `PROJECT_REVIEW_V4.md` for full inventory

## File Structure
- `apps/web/src/components/ui/` - Reusable primitives (Button, Card, Input, etc.)
- `apps/web/src/components/layout/` - Shell, Nav, Sidebar
- `apps/web/src/components/session/` - Session-specific components
- `apps/web/src/app/(auth)/` - Login, callback
- `apps/web/src/app/(learner)/` - Dashboard, session, reports
- `apps/web/src/app/(admin)/` - Admin panel pages
