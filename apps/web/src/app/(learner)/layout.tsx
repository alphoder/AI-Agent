'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AssistantWidget } from '@/components/assistant/assistant-widget';
import { AppSidebar } from '@/components/layout/app-sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);

  // First-run: send users who haven't completed onboarding to /welcome.
  useEffect(() => {
    if (!user) return;
    const done = (user.metadata as { onboarding?: { completed?: boolean } } | null)?.onboarding?.completed;
    if (!done) router.replace('/welcome');
  }, [user, router]);

  // The live session is its own full-bleed immersive (dark) view.
  const immersive = pathname?.startsWith('/session/');
  if (immersive) return <div className="dark">{children}</div>;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <AppSidebar />
      <main className="lg:pl-64">
        <div key={pathname} className="mx-auto max-w-6xl px-4 py-8 sm:px-6 page-enter">{children}</div>
      </main>
      <AssistantWidget />
    </div>
  );
}
