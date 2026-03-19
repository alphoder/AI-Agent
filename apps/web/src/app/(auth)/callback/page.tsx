'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { setAccessToken } from '@/lib/auth';
import { useAuth } from '@/hooks/use-auth';
import apiClient from '@/lib/api-client';

export default function CallbackPage() {
  const router = useRouter();
  const { setUser } = useAuth();

  useEffect(() => {
    async function handleCallback() {
      // Extract access token from URL fragment
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.slice(1));
      const accessToken = params.get('access_token');

      if (!accessToken) {
        router.push('/login');
        return;
      }

      // Store token
      setAccessToken(accessToken);

      // Fetch user info
      try {
        const { data } = await apiClient.get('/auth/me');
        setUser(data.data);

        // Route based on role
        if (data.data.role === 'admin') {
          router.push('/scenarios');
        } else {
          router.push('/dashboard');
        }
      } catch {
        router.push('/login');
      }
    }

    handleCallback();
  }, [router, setUser]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="mt-4 text-sm text-muted-foreground">
          Processing authentication...
        </p>
      </div>
    </div>
  );
}
