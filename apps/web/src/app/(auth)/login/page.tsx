'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import { Mic, Sparkles } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth';
import { useAuth } from '@/hooks/use-auth';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

function safeRedirect(target: string | null): string {
  if (target && target.startsWith('/') && !target.startsWith('//')) return target;
  return '/scenarios';
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setUser = useAuth((s) => s.setUser);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devEmail, setDevEmail] = useState('');

  const dest = safeRedirect(params.get('redirect'));

  function finish(token: string, user: unknown) {
    setAccessToken(token);
    setUser(user as never);
    router.push(dest);
  }

  async function onGoogle(credential?: string) {
    if (!credential) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/auth/google', { credential });
      finish(data.data.accessToken, data.data.user);
    } catch {
      setError('Could not sign you in with Google. Please try again.');
      setBusy(false);
    }
  }

  async function onDevLogin() {
    if (!devEmail.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/auth/dev-login', { email: devEmail.trim() });
      finish(data.data.accessToken, data.data.user);
    } catch {
      setError('Dev login failed.');
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-blue-600 to-blue-700 text-white p-12">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <Mic className="h-6 w-6" /> SpeakCoach
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-bold leading-tight">Practice speaking. Out loud. With an AI that listens and watches.</h1>
          <p className="text-blue-100 text-lg">
            Pick a scenario, turn on your mic and camera, and have a real spoken conversation. Get scored on what you said
            <span className="font-semibold"> and</span> how you carried yourself.
          </p>
          <ul className="text-blue-100 space-y-1.5 pt-2">
            <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Real-time, multilingual voice</li>
            <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Body-language feedback</li>
            <li className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Free to use</li>
          </ul>
        </div>
        <p className="text-blue-200 text-sm">No avatars. Just your voice, your presence, and honest feedback.</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2 font-semibold text-lg text-blue-600">
            <Mic className="h-6 w-6" /> SpeakCoach
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground mt-1">Use your Google account to get started.</p>
          </div>

          {error && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{error}</div>}

          <div className={busy ? 'opacity-50 pointer-events-none' : ''}>
            {GOOGLE_CLIENT_ID ? (
              <GoogleLogin
                onSuccess={(resp) => onGoogle(resp.credential)}
                onError={() => setError('Google sign-in was cancelled or failed.')}
                width="320"
              />
            ) : (
              <p className="text-sm text-amber-600">
                Set <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> to enable Google sign-in.
              </p>
            )}
          </div>

          {process.env.NODE_ENV !== 'production' && (
            <div className="pt-4 border-t border-border space-y-2">
              <p className="text-xs text-muted-foreground">Dev login (local only)</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm"
                />
                <button
                  onClick={onDevLogin}
                  disabled={busy}
                  className="rounded-lg bg-slate-900 text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  Enter
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
