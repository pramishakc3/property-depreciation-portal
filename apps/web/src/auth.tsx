import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@pdp/shared';
import { api } from './api';

interface AuthState {
  /** undefined while checking the session, null when signed out */
  user: User | null | undefined;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    api.get<{ user: User | null }>('/auth/session').then((s) => setUser(s.user)).catch(() => setUser(null));
  }, []);

  const value: AuthState = {
    user,
    login: async (email, password) => setUser(await api.post<User>('/auth/login', { email, password })),
    logout: async () => {
      await api.post('/auth/logout');
      setUser(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const canEdit = (user: User | null | undefined) => user?.role === 'admin' || user?.role === 'surveyor';
