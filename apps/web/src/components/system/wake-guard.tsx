'use client';

import { useEffect, useState } from 'react';
import { AssistantOrb } from '@/components/assistant/assistant-orb';

/**
 * Cold-start guard. Render's free tier spins the API down after ~15 min idle, so
 * the first request after a quiet spell hangs ~30-60s and the app gets stuck on a
 * loading/idle screen. This probes the API the moment the app shell mounts:
 *   - warm  → renders nothing, app proceeds normally.
 *   - cold  → shows a "starting up" overlay, polls until the server answers, then
 *             does ONE full reload so every initial data fetch re-runs warm.
 * A sessionStorage stamp prevents reload loops if the server is still waking.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/api\/?$/, '');
const HEALTH = `${API_BASE}/health/live`;
const RELOAD_KEY = 'sc_wake_reload_at';

function probe(timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(HEALTH, { signal: ctrl.signal, cache: 'no-store' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => clearTimeout(to));
}

export function WakeGuard() {
  const [cold, setCold] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // First probe. This budget is what decides whether the overlay is ever
      // seen, so it is generous on purpose: a warm-but-slow free-tier API (or a
      // slow connection) answering in 3-6s is NOT cold, and flashing "Starting
      // things up" at someone whose backend is fine is worse than waiting.
      // Only a genuinely unreachable API should get past this.
      // ponytail: one threshold, no backoff curve — raise it if real p99 exceeds it.
      if (await probe(8000)) return;
      if (cancelled) return;

      setCold(true);
      // Poll a BOUNDED number of times, then fail open no matter what. A health
      // gate must never trap the user: if the probe keeps failing (cold start,
      // CORS, blocked storage, offline), we still reveal the app and let its own
      // retries handle things.
      // Render's cold start is 30-60s. At 6 attempts this gave up around 50s and
      // revealed a still-dead app to anyone on the slow end of that range, which
      // reads as "the site is broken" rather than "the site is waking".
      const MAX_ATTEMPTS = 10; // ~85s — past the far end of a real cold start
      for (let i = 0; i < MAX_ATTEMPTS && !cancelled; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        if (cancelled) return;
        if (await probe(6000)) {
          if (cancelled) return;
          // Server is up. Reload ONCE per session so failed initial fetches re-run
          // — but only if storage works (else a reload would loop, so just reveal).
          let alreadyReloaded = true;
          try {
            alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === '1';
            if (!alreadyReloaded) sessionStorage.setItem(RELOAD_KEY, '1');
          } catch { alreadyReloaded = true; /* storage blocked — do NOT reload */ }
          if (!alreadyReloaded) window.location.reload();
          else setCold(false);
          return;
        }
      }
      if (!cancelled) setCold(false); // gave up waiting — never trap the user
    })();

    return () => { cancelled = true; };
  }, []);

  if (!cold) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <AssistantOrb state="loading" size={96} />
        <div>
          <p className="text-lg font-medium text-foreground">Starting things up</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
            The first visit after a quiet spell can take up to a minute. Hang tight, this page will refresh on its own.
          </p>
        </div>
      </div>
    </div>
  );
}
