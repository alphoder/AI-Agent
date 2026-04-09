'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function LoginPageInner() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const [devEmail, setDevEmail] = useState('');
  const [devLoading, setDevLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenantSlug.trim()) {
      setError('Please enter your organization identifier');
      return;
    }

    // Redirect to SSO init endpoint
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
        return;
      }

      // Store token in localStorage AND cookie (cookie needed for Next.js middleware SSR)
      const token = data.data.accessToken;
      localStorage.setItem('access_token', token);
      document.cookie = `access_token=${token}; path=/; max-age=900; samesite=strict`;

      if (redirectTo) {
        router.push(redirectTo);
      } else if (data.data.user?.role === 'admin') {
        router.push('/overview');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Failed to connect to API');
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Left branding panel ── */}
      <div className="relative hidden w-1/2 overflow-hidden bg-[hsl(var(--foreground))] lg:flex lg:flex-col lg:justify-between">
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

        {/* Content */}
        <div className="relative z-10 flex flex-1 flex-col justify-between p-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="text-white">
              <LogoMark className="h-9 w-9" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              Avatar Platform
            </span>
          </div>

          {/* Hero text */}
          <div className="max-w-md">
            <h1 className="text-4xl font-bold leading-[1.15] tracking-tight text-white">
              Train with AI.
              <br />
              <span className="text-white/60">Perform in reality.</span>
            </h1>
            <p className="mt-5 text-base leading-relaxed text-white/40">
              Practice high-stakes conversations with AI-powered avatars.
              Get instant feedback, build confidence, and master every scenario.
            </p>
          </div>

          {/* Bottom testimonial / stat */}
          <div className="max-w-sm">
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
      </div>

      {/* ── Right form panel ── */}
      <div className="flex w-full flex-col lg:w-1/2">
        {/* Mobile logo (shown only on small screens) */}
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

            {/* Error */}
            {error && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Dev login */}
            {true && (
              <>
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
              </>
            )}

            {/* Footer */}
            <p className="mt-10 text-center text-xs text-muted-foreground/50">
              By continuing, you agree to the platform terms of service.
            </p>
          </div>
        </div>
      </div>
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
