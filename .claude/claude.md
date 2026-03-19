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

## Known Gaps (see PROJECT_REVIEW.md v2 for full 108-issue inventory)
- Scenario edit page not implemented (create-only)
- PDF download button non-functional
- SSO page is a stub (just `<h1>SSO Login</h1>`)
- Mic waveform visualization missing from session room
- Reconnection overlay missing from session room
- LTI platform registration endpoints missing (manual DB required)
- revokeAllUserTokens() body is empty (tokens not revoked on logout)
- Session read endpoints lack user ownership check (data breach risk)
- Score endpoint has no auth/RBAC (any user can post scores)
- AI service metrics defined but not exported to Prometheus
- PII redaction not implemented in STT pipeline
- Audio buffer filled on disconnect but never flushed on reconnect
- E2E and load tests not integrated into CI pipeline
- SecurityContext missing from all K8s deployments
- Trivy/npm audit silenced with continue-on-error in CI

## File Structure
- `apps/web/src/components/ui/` - Reusable primitives (Button, Card, Input, etc.)
- `apps/web/src/components/layout/` - Shell, Nav, Sidebar
- `apps/web/src/components/session/` - Session-specific components
- `apps/web/src/app/(auth)/` - Login, callback
- `apps/web/src/app/(learner)/` - Dashboard, session, reports
- `apps/web/src/app/(admin)/` - Admin panel pages
