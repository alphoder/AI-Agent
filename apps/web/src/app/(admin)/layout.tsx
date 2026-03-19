'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/admin/sidebar';
import AdminHeader from '@/components/admin/header';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split('.')[1];
    if (!base64) return null;
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.replace('/login');
      return;
    }

    const payload = decodeJwtPayload(token);
    if (!payload || payload.role !== 'admin') {
      router.replace(payload ? '/dashboard' : '/login');
      return;
    }

    setAuthorized(true);
  }, [router]);

  // Close sidebar on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSidebarOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((prev) => !prev), []);

  if (!authorized) {
    return (
      <div className="flex min-h-screen bg-background">
        {/* Sidebar skeleton */}
        <aside className="hidden lg:block w-64 border-r bg-muted/40">
          <div className="animate-pulse space-y-4 p-5 pt-6">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-muted" />
              <div className="space-y-1.5 flex-1">
                <div className="h-3.5 w-3/4 rounded bg-muted" />
                <div className="h-2.5 w-1/2 rounded bg-muted" />
              </div>
            </div>
            <div className="pt-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-9 w-full rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </aside>
        <div className="flex-1 flex flex-col">
          <div className="h-14 border-b bg-muted/20 animate-pulse" />
          <main className="flex-1 p-6">
            <div className="animate-pulse space-y-4 max-w-7xl mx-auto">
              <div className="h-8 w-1/3 rounded bg-muted" />
              <div className="h-64 w-full rounded-lg bg-muted" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r bg-muted/40">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <AdminSidebar />
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r bg-background shadow-xl transition-transform duration-300 ease-in-out lg:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AdminSidebar onNavigate={closeSidebar} />
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader onToggleSidebar={toggleSidebar} />
        <main className="flex-1 p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
