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

## Architecture Rules
- Every API route: validate input, check auth, scope to tenant, return consistent envelope
- Every page: proper `<title>`, breadcrumbs where needed, back navigation
- Every list: pagination, empty state, loading skeleton
- Every form: validation, submit loading, success/error feedback
- Every action: confirmation for destructive ops, optimistic UI where safe

## File Structure
- `apps/web/src/components/ui/` - Reusable primitives (Button, Card, Input, etc.)
- `apps/web/src/components/layout/` - Shell, Nav, Sidebar
- `apps/web/src/components/session/` - Session-specific components
- `apps/web/src/app/(auth)/` - Login, callback
- `apps/web/src/app/(learner)/` - Dashboard, session, reports
- `apps/web/src/app/(admin)/` - Admin panel pages
