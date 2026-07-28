'use client';

import { usePathname } from 'next/navigation';
import { AssistantWidget } from '@/components/assistant/assistant-widget';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { WakeGuard } from '@/components/system/wake-guard';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // No first-run redirect: My Journey owns the questionnaire now, and shows it
  // in place when the user has no plan yet.

  // The live session is its own full-bleed immersive (dark) view.
  const immersive = pathname?.startsWith('/session/');
  if (immersive) return <div className="dark"><WakeGuard />{children}</div>;

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <WakeGuard />
      <AppSidebar />
      <main className="lg:pl-64">
        <div key={pathname} className="mx-auto max-w-6xl px-4 py-8 sm:px-6 page-enter">{children}</div>
      </main>
      <AssistantWidget />
    </div>
  );
}
