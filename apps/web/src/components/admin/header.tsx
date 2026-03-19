'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

export default function AdminHeader() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // proceed with local logout even if API fails
    }
    logout();
    router.push('/login');
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b bg-background">
      <div className="text-sm text-muted-foreground">
        Admin Panel
      </div>
      <div className="flex items-center gap-4">
        {user && (
          <span className="text-sm font-medium">
            {user.displayName || user.email}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
