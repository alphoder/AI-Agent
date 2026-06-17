'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = error.message
    ? error.message.length > 200
      ? error.message.slice(0, 200) + '...'
      : error.message
    : 'An unexpected error occurred.';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold text-foreground">Something went wrong</h1>
      <p className="mt-2 max-w-md text-center text-sm text-muted-foreground">{message}</p>
      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
        <Link
          href="/dashboard"
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
