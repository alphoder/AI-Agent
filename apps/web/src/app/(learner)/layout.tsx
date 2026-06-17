'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Mic, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import apiClient from '@/lib/api-client';
import { clearAccessToken } from '@/lib/auth';
import { AssistantWidget } from '@/components/assistant/assistant-widget';
import { TutorialTour } from '@/components/onboarding/tutorial-tour';

const NAV = [
  { href: '/scenarios', label: 'Practice' },
  { href: '/reports', label: 'History' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  // Hide the chrome inside a live session for an immersive view.
  const immersive = pathname?.startsWith('/session/');

  async function onLogout() {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clearAccessToken();
    logout();
    router.push('/login');
  }

  if (immersive) return <>{children}</>;

  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="relative min-h-screen bg-background">
      {/* Soft premium background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
      </div>
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/80 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
          <Link href="/scenarios" className="flex items-center gap-2 font-semibold text-indigo-600">
            <Mic className="h-5 w-5" /> SpeakCoach
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'bg-indigo-50 text-indigo-700' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <div className="ml-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-semibold">
                {initial}
              </span>
              <button
                onClick={onLogout}
                title="Sign out"
                className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main key={pathname} className="mx-auto max-w-6xl px-4 py-8 page-enter">{children}</main>
      <AssistantWidget />
      <TutorialTour />
    </div>
  );
}
