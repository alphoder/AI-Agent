'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { AssistantWidget } from '@/components/assistant/assistant-widget';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { WakeGuard } from '@/components/system/wake-guard';
import { NotesDock } from '@/components/notes/notes-dock';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // No first-run redirect: My Journey owns the questionnaire now, and shows it
  // in place when the user has no plan yet.

  // The live session stays dark in both themes: it is a stage, not a document, and
  // a white screen on a five-minute call is glare. `.dark` here re-declares the
  // tokens for this subtree, so it works whatever the user picked.
  const immersive = pathname?.startsWith('/session/');
  if (immersive) return <div className="dark bg-background text-foreground"><WakeGuard />{children}<Suspense fallback={null}><NotesDock /></Suspense></div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <WakeGuard />
      <AppSidebar />
      <main className="lg:pl-64">
        <div key={pathname} className="mx-auto max-w-6xl px-4 py-8 sm:px-6 page-enter">{children}</div>
      </main>
      <AssistantWidget />
      <Suspense fallback={null}><NotesDock /></Suspense>
    </div>
  );
}
