import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface User {
  id: string;
  email: string;
  username: string;
  discriminator: string;
  tag: string;
  twoFactorEnabled: boolean;
  premium: boolean;
  premiumUntil: string | null;
  formerPremium: boolean;
  avatar: import('../components/Avatar').AvatarData;
  hasAvatar: boolean;
  displayName: string;
  role: 'USER' | 'ADMIN';
  theme: 'light' | 'dark' | 'system';
  timezone: string;
  dailyGoalXp: number;
  leaderboardOptIn: boolean;
  onboardingDone: boolean;
  xp: number;
  streak: number;
  longestStreak: number;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  registration: boolean;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [registration, setRegistration] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: User | null; registration: boolean }>('/auth/me');
      setUser(r.user);
      setRegistration(r.registration);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const logout = async () => {
    await api('/auth/logout', { method: 'POST', body: {} });
    setUser(null);
  };
  return <Ctx.Provider value={{ user, loading, registration, refresh, setUser, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
