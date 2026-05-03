import { createContext, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useGetMe, getGetMeQueryKey, UserProfile } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const token = localStorage.getItem('mdm_token');

  const { data: meResponse, isLoading: isMeLoading, isError: isMeError } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey()
    }
  });

  const login = useCallback((newToken: string) => {
    // Clear stale cache from any previous session before setting new token
    queryClient.clear();
    localStorage.setItem('mdm_token', newToken);
    setLocation('/dashboard');
  }, [setLocation, queryClient]);

  const logout = useCallback(() => {
    localStorage.removeItem('mdm_token');
    // Clear all cached tenant data to prevent cross-session data leakage
    queryClient.clear();
    setLocation('/login');
  }, [setLocation, queryClient]);

  // If token is present but /auth/me fails (expired or invalid), clear token + cache and redirect
  useEffect(() => {
    if (token && isMeError) {
      localStorage.removeItem('mdm_token');
      queryClient.clear();
      setLocation('/login');
    }
  }, [token, isMeError, setLocation, queryClient]);

  // If no token, redirect to login (unless already on public pages)
  useEffect(() => {
    const path = window.location.pathname;
    const isPublic = path.endsWith('/login') || path.endsWith('/register');
    if (!token && !isPublic) {
      setLocation('/login');
    }
  }, [token, setLocation]);

  const isLoading = !!token && isMeLoading;

  return (
    <AuthContext.Provider value={{ user: meResponse?.user || null, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
