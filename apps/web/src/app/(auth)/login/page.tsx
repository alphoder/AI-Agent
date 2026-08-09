'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GoogleLogin } from '@react-oauth/google';
import { ClerkProvider, SignInButton, useAuth as useClerkAuth } from '@clerk/nextjs';
import { Mic, Check } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { setAccessToken } from '@/lib/auth';
import { warmBackend } from '@/lib/warm-backend';
import { useAuth } from '@/hooks/use-auth';
import { AssistantOrb } from '@/components/assistant/assistant-orb';
import { Accent } from '@/components/ui/accent';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const CLERK_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';

/**
 * Clerk sign-in. Clerk only proves who you are; the moment it does, its session
 * token is traded for the app's own JWT so every downstream path (refresh
 * rotation, WS tickets, route protection) stays exactly as it was.
 */
function ClerkSignIn({ onToken, busy }: { onToken: (t: string) => void; busy: boolean }) {
  const { isSignedIn, getToken } = useClerkAuth();
  const traded = useRef(false);

  useEffect(() => {
    if (!isSignedIn || traded.current) return;
    traded.current = true;
    getToken().then((t) => { if (t) onToken(t); });
  }, [isSignedIn, getToken, onToken]);

  return (
    <SignInButton mode="modal">
      <button
        type="button"
        disabled={busy}
        className="press w-full rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
      >
        Continue with Clerk
      </button>
    </SignInButton>
  );
}

function safeRedirect(target: string | null): string {
  if (target && target.startsWith('/') && !target.startsWith('//')) return target;
  return '/journey';
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setUser = useAuth((s) => s.setUser);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dest = safeRedirect(params.get('redirect'));

  // Dev sign-in: on by default locally; in prod only when explicitly enabled.
  const devLoginOn = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEV_LOGIN === 'true';
  const [devEmail, setDevEmail] = useState('dev@speakcoach.local');
  const [devPass, setDevPass] = useState('hfihdiugweifiewjfbifbi');

  useEffect(() => { warmBackend(); }, []); // wake the backend while the user signs in

  async function finish(token: string, fallbackUser: unknown) {
    setAccessToken(token);
    // Pull the full user (incl. metadata) so the store is complete before we
    // land on the journey.
    try {
      const { data } = await apiClient.get('/auth/me');
      setUser(data.data);
    } catch {
      setUser(fallbackUser as never);
    }
    router.push(dest);
  }

  async function onDevLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/auth/dev-login', { email: devEmail, password: devPass });
      finish(data.data.accessToken, data.data.user);
    } catch (err: any) {
      setError(err?.response?.status === 404
        ? 'Dev sign-in is disabled on this environment.'
        : 'Invalid dev email or password.');
      setBusy(false);
    }
  }

  async function onClerk(token: string) {
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/auth/clerk', { token });
      finish(data.data.accessToken, data.data.user);
    } catch (err: any) {
      setError(err?.response?.status === 404
        ? 'Clerk sign-in is not configured on this environment.'
        : 'Could not sign you in with Clerk. Please try again.');
      setBusy(false);
    }
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


  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Calm grey/white brand panel with a blue Bixy — no drenched colour. */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-card p-12 lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold text-primary">
          <Mic className="h-6 w-6" /> SpeakCoach
        </div>
        <div className="relative max-w-md space-y-6">
          <div className="relative inline-flex">
            <div aria-hidden className="bixy-halo absolute inset-0 m-auto h-24 w-24" />
            <AssistantOrb state="listening" size={88} />
          </div>
          <h1 className="text-balance text-[2.75rem] font-bold leading-[1.05] tracking-tight">
            Practice speaking. <Accent>Out loud.</Accent>
          </h1>
          <p className="text-[17px] leading-relaxed text-muted-foreground">
            Real spoken conversations with an AI coach that listens to what you say and watches how you carry yourself — then scores both.
          </p>
          <ul className="space-y-2.5 text-sm text-foreground/80">
            {['Real-time, multilingual voice', 'Live body-language feedback', 'Always free'].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-3 w-3" strokeWidth={3} /></span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted-foreground">No avatars. Just your voice, your presence, and honest feedback.</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-2 text-lg font-semibold text-primary lg:hidden">
            <Mic className="h-6 w-6" /> SpeakCoach
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sign in with Google to start practising.</p>
          </div>

          {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

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

          {CLERK_KEY && (
            <>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <ClerkProvider publishableKey={CLERK_KEY}>
                <ClerkSignIn onToken={onClerk} busy={busy} />
              </ClerkProvider>
            </>
          )}

          {/* Dev / demo sign-in — admin + learner in one account */}
          {devLoginOn && (
            <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
              <div className="flex items-center gap-2">
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dev</span>
                <p className="text-xs text-muted-foreground">Sign in without Google — full admin + learner access.</p>
              </div>
              <form onSubmit={onDevLogin} className="space-y-2">
                <input
                  type="email" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} autoComplete="username"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                />
                <input
                  type="password" value={devPass} onChange={(e) => setDevPass(e.target.value)} autoComplete="current-password"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                />
                <button type="submit" disabled={busy}
                  className="press w-full rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60">
                  {busy ? 'Signing in…' : 'Dev sign in'}
                </button>
              </form>
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
