'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Mic, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import apiClient from '@/lib/api-client';
import { clearAccessToken } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { NAV_GROUPS } from './nav-config';

function NavLinks({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 thin-scroll">
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{group.title}</p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors press',
                    active ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                  )}
                >
                  {active && <span aria-hidden className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary" />}
                  <item.icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} strokeWidth={2} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.soon && <span className="rounded-full border border-border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground/80">Soon</span>}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/journey" className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5 font-semibold tracking-tight">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Mic className="h-4 w-4" /></span>
      SpeakCoach
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [open, setOpen] = useState(false);

  async function onLogout() {
    try { await apiClient.post('/auth/logout'); } catch { /* ignore */ }
    clearAccessToken();
    logout();
    router.push('/login');
  }

  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();
  const Footer = (
    <div className="flex shrink-0 items-center gap-2.5 border-t border-border px-3 py-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-semibold">{initial}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user?.name || 'You'}</p>
        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
      </div>
      <button onClick={onLogout} title="Sign out" className="press rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card/40 lg:flex">
        <Brand />
        <NavLinks pathname={pathname} />
        {Footer}
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-lg lg:hidden">
        <Link href="/journey" className="flex items-center gap-2 font-semibold text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Mic className="h-4 w-4" /></span>
          SpeakCoach
        </Link>
        <button onClick={() => setOpen(true)} className="press rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-card animate-slide-in-right">
            <div className="flex items-center justify-between border-b border-border pr-2">
              <Brand />
              <button onClick={() => setOpen(false)} className="press rounded-lg p-2 text-muted-foreground hover:bg-secondary" aria-label="Close menu"><X className="h-5 w-5" /></button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            {Footer}
          </div>
        </div>
      )}
    </>
  );
}
