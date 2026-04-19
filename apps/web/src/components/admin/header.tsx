'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { ChevronRight, LogOut, Menu, Shield } from 'lucide-react';
import apiClient from '@/lib/api-client';

const PAGE_LABELS: Record<string, string> = {
  overview: 'Dashboard',
  learners: 'Learners',
  avatars: 'Avatars',
  personas: 'Personas',
  scenarios: 'Scenarios',
  assignments: 'Assignments',
  analytics: 'Analytics',
  settings: 'Settings',
};

interface AdminHeaderProps {
  onToggleSidebar?: () => void;
}

export default function AdminHeader({ onToggleSidebar }: AdminHeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Derive breadcrumb from pathname
  const segments = pathname.split('/').filter(Boolean);
  const currentPage = segments[0] ? PAGE_LABELS[segments[0]] || segments[0] : 'Dashboard';

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  async function handleLogout() {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // proceed with local logout even if API fails
    }
    localStorage.removeItem('access_token');
    logout();
    router.push('/login');
  }

  // User type may have display_name (snake_case from DB) or displayName (camelCase from API transform)
  const userRecord = user as unknown as Record<string, unknown> | null;
  const displayName = (userRecord?.displayName as string)
    || (userRecord?.display_name as string)
    || '';

  const initials = displayName
    ? displayName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || '?';

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b bg-background/80 backdrop-blur-lg px-6 py-3">
      {/* Left: Hamburger (mobile) + Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lg:hidden -ml-1 rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Toggle sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
          <span className="text-muted-foreground">Admin</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          <span className="font-medium text-foreground">{currentPage}</span>
        </nav>
      </div>

      {/* Right: User dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
          aria-label="User menu"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initials}
          </div>
          <span className="hidden text-sm font-medium text-foreground sm:inline">
            {displayName || user?.email || 'Admin'}
          </span>
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border bg-background shadow-lg animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-medium text-foreground">
                {displayName || 'Admin User'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {user?.email || ''}
              </p>
              <div className="mt-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  <Shield className="h-3 w-3" />
                  Administrator
                </span>
              </div>
            </div>
            <div className="p-1.5">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
