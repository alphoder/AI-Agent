'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export default function SSOPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tenant = searchParams.get('tenant');
  const [error, setError] = useState('');

  useEffect(() => {
    if (tenant) {
      // Redirect to the SSO init endpoint on the API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      window.location.href = `${apiUrl}/auth/sso/init?tenant=${encodeURIComponent(tenant)}`;
    }
  }, [tenant]);

  // If no tenant provided, redirect to login with a message
  if (!tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <svg
              className="h-7 w-7 text-muted-foreground"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">SSO Sign In</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              No organization was specified. Please sign in from the main login page.
            </p>
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
          <button
            onClick={() => router.push('/login')}
            className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Show a loading state while redirecting
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Redirecting to SSO</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connecting to your organization&apos;s identity provider...
          </p>
        </div>
      </div>
    </div>
  );
}
