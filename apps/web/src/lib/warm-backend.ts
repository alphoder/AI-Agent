const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/api\/?$/, '');

let warmed = false;

/**
 * Fire-and-forget pre-warm. Called when the visitor first lands (landing/login)
 * so the free-tier API + AI services finish their cold start (~30-60s) while the
 * person reads the page — by the time they click Start, the backend is ready.
 * Safe to call repeatedly; only fires once per page load. `keepalive` lets the
 * request survive the navigation to /login.
 */
export function warmBackend() {
  if (warmed || typeof window === 'undefined') return;
  warmed = true;
  try {
    fetch(`${API_BASE}/warmup`, { cache: 'no-store', keepalive: true }).catch(() => {});
  } catch {
    /* ignore — warming is best-effort */
  }
}
