'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LogoMark } from '@/components/ui/logo-mark';

function BuildingIcon() {
  return (
    <svg
      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg
      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="ml-2 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

const LINE_1 = 'Train with AI.';
const LINE_2 = 'Perform in reality.';
const TYPE_SPEED_MS = 85;
const SLIDE_DURATION_MS = 1100;
const WELCOME_HOLD_MS = 1800;

type Phase = 'typing' | 'ready' | 'success';

function isSafeRedirect(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  if (value.startsWith('//')) return false;
  if (value === '/login' || value.startsWith('/login')) return false;
  return true;
}

function LoginPageInner() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const [devEmail, setDevEmail] = useState('');
  const [devLoading, setDevLoading] = useState(false);
  const searchParams = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const safeRedirect = isSafeRedirect(redirectParam) ? redirectParam : null;

  const [phase, setPhase] = useState<Phase>('typing');
  const [typed1, setTyped1] = useState('');
  const [typed2, setTyped2] = useState('');
  const [welcomeRole, setWelcomeRole] = useState<'admin' | 'learner' | null>(null);
  const pendingDest = useRef<string | null>(null);

  // ── Intro typewriter (slow + readable) ──
  useEffect(() => {
    let cancelled = false;
    let i = 0;
    let j = 0;
    let id1: ReturnType<typeof setInterval> | null = null;
    let id2: ReturnType<typeof setInterval> | null = null;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    let line2Timer: ReturnType<typeof setTimeout> | null = null;

    const startLine2 = () => {
      id2 = setInterval(() => {
        if (cancelled) return;
        j++;
        setTyped2(LINE_2.slice(0, j));
        if (j >= LINE_2.length) {
          if (id2) clearInterval(id2);
          readyTimer = setTimeout(() => {
            if (!cancelled) setPhase('ready');
          }, 700);
        }
      }, TYPE_SPEED_MS);
    };

    id1 = setInterval(() => {
      if (cancelled) return;
      i++;
      setTyped1(LINE_1.slice(0, i));
      if (i >= LINE_1.length) {
        if (id1) clearInterval(id1);
        line2Timer = setTimeout(startLine2, 450);
      }
    }, TYPE_SPEED_MS);

    return () => {
      cancelled = true;
      if (id1) clearInterval(id1);
      if (id2) clearInterval(id2);
      if (readyTimer) clearTimeout(readyTimer);
      if (line2Timer) clearTimeout(line2Timer);
    };
  }, []);

  // ── Success → navigate after welcome animation ──
  useEffect(() => {
    if (phase !== 'success' || !pendingDest.current) return;
    const t = setTimeout(() => {
      window.location.href = pendingDest.current!;
    }, WELCOME_HOLD_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantSlug.trim()) {
      setError('Please enter your organization identifier');
      return;
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    window.location.href = `${apiUrl}/auth/sso/init?tenant=${encodeURIComponent(tenantSlug)}`;
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDevLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl}/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: devEmail, tenant: tenantSlug || 'acme' }),
      });

      const data = await res.json();

      if (!data.success) {
        setError(data.error?.message || 'Login failed');
        setDevLoading(false);
        return;
      }

      const token = data.data.accessToken;
      localStorage.setItem('access_token', token);
      // SameSite=Lax so the cookie is sent on top-level navigations after login.
      document.cookie = `access_token=${token}; path=/; max-age=900; samesite=lax`;

      const role: 'admin' | 'learner' =
        data.data.user?.role === 'admin' ? 'admin' : 'learner';

      // Pick destination — prefer a safe ?redirect param, otherwise role default.
      // Never bounce back to /login (would cause the "log in twice" loop).
      const dest =
        safeRedirect ??
        (role === 'admin' ? '/overview' : '/dashboard');

      pendingDest.current = dest;
      setWelcomeRole(role);
      setPhase('success');
    } catch (err) {
      setError('Failed to connect to API');
      setDevLoading(false);
    }
  };

  const showCaret1 = phase === 'typing' && typed1.length < LINE_1.length;
  const showCaret2 =
    phase === 'typing' &&
    typed1.length === LINE_1.length &&
    typed2.length < LINE_2.length;

  // Branding panel: fills the screen during typing & success, half-width when ready.
  const brandingWidth = phase === 'ready' ? 'w-full lg:w-1/2' : 'w-full';

  // Form panel slides in from the right, then back out on success.
  const formTransform = phase === 'ready' ? 'translate-x-0' : 'translate-x-full';

  // Hero title — fixed positioning so the branding panel resize never reflows
  // it, and text is always left-aligned + nowrap so the typewriter doesn't
  // visually jitter as characters are appended.
  const titlePos =
    phase === 'ready'
      ? 'left-12 top-1/2 -translate-y-1/2'
      : // typing & success → centered in viewport
        'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2';

  const titleSize =
    phase === 'ready'
      ? 'text-4xl'
      : 'text-5xl sm:text-6xl md:text-7xl';

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      {/* ── Branding panel (animated width) ── */}
      <div
        className={`relative flex flex-col overflow-hidden bg-[hsl(var(--foreground))] transition-[width] ease-[cubic-bezier(0.65,0,0.35,1)] ${brandingWidth}`}
        style={{ transitionDuration: `${SLIDE_DURATION_MS}ms` }}
      >
        {/* Geometric background pattern */}
        <div className="absolute inset-0 opacity-[0.04]">
          <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Gradient orbs */}
        <div className="absolute -left-20 -top-20 h-[400px] w-[400px] rounded-full bg-[hsl(var(--primary))] opacity-20 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-[hsl(var(--primary))] opacity-10 blur-[120px]" />
        <div className="absolute bottom-1/3 left-1/3 h-[300px] w-[300px] rounded-full bg-purple-500 opacity-10 blur-[100px]" />

        {/* Logo (top-left) */}
        <div
          className={`absolute left-12 top-12 z-20 flex items-center gap-3 transition-opacity duration-700 ${
            phase === 'ready' ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="text-white">
            <LogoMark className="h-9 w-9" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-white">
            Avatar Platform
          </span>
        </div>

        {/* Bottom stat row */}
        <div
          className={`absolute bottom-12 left-12 z-20 max-w-sm transition-opacity duration-700 ${
            phase === 'ready' ? 'opacity-100 delay-500' : 'opacity-0'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[hsl(var(--foreground))] bg-white/10 text-xs font-medium text-white/70"
                >
                  {['JD', 'AK', 'SM', 'RB'][i]}
                </div>
              ))}
            </div>
            <div className="text-sm text-white/40">
              <span className="font-medium text-white/70">2,400+</span> training sessions completed
            </div>
          </div>
        </div>
      </div>

      {/* ── Hero title (fixed, animates position + size only) ── */}
      <div
        className={`pointer-events-none fixed z-30 transition-all ease-[cubic-bezier(0.65,0,0.35,1)] ${titlePos}`}
        style={{ transitionDuration: `${SLIDE_DURATION_MS}ms` }}
      >
        {phase === 'success' ? (
          <div className="text-center animate-[fadeUp_700ms_ease-out]">
            <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-white/40">
              Signed in
            </p>
            <h1 className="whitespace-nowrap text-6xl font-bold leading-[1.1] tracking-tight text-white sm:text-7xl">
              Welcome,{' '}
              <span className="text-white/50">
                {welcomeRole === 'admin' ? 'admin' : 'learner'}
              </span>
              <span className="text-white">.</span>
            </h1>
          </div>
        ) : (
          <h1
            className={`${titleSize} whitespace-nowrap text-left font-bold leading-[1.1] tracking-tight text-white transition-[font-size] ease-[cubic-bezier(0.65,0,0.35,1)]`}
            style={{ transitionDuration: `${SLIDE_DURATION_MS}ms` }}
          >
            <span className="inline-block">
              {typed1}
              {showCaret1 && (
                <span className="ml-1 inline-block h-[0.85em] w-[3px] translate-y-[0.12em] bg-white/80 animate-pulse align-baseline" />
              )}
            </span>
            <br />
            <span className="inline-block text-white/60">
              {typed2}
              {showCaret2 && (
                <span className="ml-1 inline-block h-[0.85em] w-[3px] translate-y-[0.12em] bg-white/40 animate-pulse align-baseline" />
              )}
            </span>
          </h1>
        )}
      </div>

      {/* ── Form panel (slides in from right) ── */}
      <div
        className={`absolute right-0 top-0 flex h-full w-full flex-col bg-background ease-[cubic-bezier(0.65,0,0.35,1)] lg:w-1/2 ${formTransform}`}
        style={{
          transitionProperty: 'transform',
          transitionDuration: `${SLIDE_DURATION_MS}ms`,
        }}
        aria-hidden={phase !== 'ready'}
      >
        {/* Mobile logo */}
        <div className="flex items-center gap-2.5 px-8 pt-8 lg:hidden">
          <LogoMark className="h-8 w-8 text-foreground" />
          <span className="text-base font-semibold tracking-tight text-foreground">
            Avatar Platform
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center px-8 py-12">
          <div className="w-full max-w-[400px]">
            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Welcome back
              </h2>
              <p className="mt-2 text-[15px] text-muted-foreground">
                Sign in with your organization credentials to continue.
              </p>
            </div>

            {/* SSO form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="tenant"
                  className="block text-sm font-medium text-foreground"
                >
                  Organization
                </label>
                <div className="relative">
                  <BuildingIcon />
                  <input
                    id="tenant"
                    type="text"
                    value={tenantSlug}
                    onChange={(e) => {
                      setTenantSlug(e.target.value);
                      setError('');
                    }}
                    placeholder="your-company"
                    className="block w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground shadow-sm transition-all duration-150 placeholder:text-muted-foreground/50 hover:border-muted-foreground/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="group flex w-full items-center justify-center rounded-lg bg-[hsl(var(--foreground))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--background))] shadow-sm transition-all duration-150 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:ring-offset-2"
              >
                Continue with SSO
                <ArrowRightIcon />
              </button>
            </form>

            {error && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                  Development
                </span>
              </div>
            </div>

            <form onSubmit={handleDevLogin} className="space-y-3">
              <div className="relative">
                <EnvelopeIcon />
                <input
                  type="email"
                  value={devEmail}
                  onChange={(e) => {
                    setDevEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="admin@acme.com or learner@acme.com"
                  className="block w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground shadow-sm transition-all duration-150 placeholder:text-muted-foreground/50 hover:border-muted-foreground/30 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button
                type="submit"
                disabled={devLoading}
                className="flex w-full items-center justify-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all duration-150 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                {devLoading ? (
                  <>
                    <svg
                      className="mr-2 h-4 w-4 animate-spin text-muted-foreground"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  'Dev Sign In'
                )}
              </button>
            </form>

            <p className="mt-10 text-center text-xs text-muted-foreground/50">
              By continuing, you agree to the platform terms of service.
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
