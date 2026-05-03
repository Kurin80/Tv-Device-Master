import { createContext, useContext, ReactNode, useCallback, useEffect } from 'react';
import { useGetMe, getGetMeQueryKey, UserProfile } from '@workspace/api-client-react';
import { useLocation } from 'wouter';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [_, setLocation] = useLocation();
  const token = localStorage.getItem('mdm_token');

  const { data: meResponse, isLoading: isMeLoading } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey()
    }
  });

  const login = useCallback((newToken: string) => {
    localStorage.setItem('mdm_token', newToken);
    setLocation('/dashboard');
  }, [setLocation]);

  const logout = useCallback(() => {
    localStorage.removeItem('mdm_token');
    setLocation('/login');
  }, [setLocation]);

  const isLoading = !!token && isMeLoading;

  useEffect(() => {
    if (!token && window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      setLocation('/login');
    }
  }, [token, setLocation]);

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
