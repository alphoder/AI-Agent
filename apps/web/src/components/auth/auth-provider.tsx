'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import apiClient from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const { setUser, setLoading, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    async function loadUser() {
      const token = getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const { data } = await apiClient.get('/auth/me');
        setUser(data.data);
      } catch {
        setUser(null);
      }
    }

    loadUser();
  }, [setUser, setLoading]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}
