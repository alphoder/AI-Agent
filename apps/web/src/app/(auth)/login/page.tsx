'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-8 rounded-lg border p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold">AI Avatar Training Platform</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your organization credentials
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="tenant"
              className="block text-sm font-medium text-foreground"
            >
              Organization Identifier
            </label>
            <input
              id="tenant"
              type="text"
              value={tenantSlug}
              onChange={(e) => {
                setTenantSlug(e.target.value);
                setError('');
              }}
              placeholder="e.g., acme"
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Continue with SSO
          </button>
        </form>
      </div>
    </div>
  );
}
