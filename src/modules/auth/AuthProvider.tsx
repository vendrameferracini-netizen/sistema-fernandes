import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { Profile } from './model';

type AuthState = {
  session: Session | null; profile: Profile | null; loading: boolean;
  error: string | null; recovery: boolean; finishRecovery: () => void; retry: () => void;
};
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    let version = 0;
    const client = supabase;
    // Defer database work outside onAuthStateChange to avoid auth lock deadlocks.
    async function synchronize(nextSession: Session | null) {
      const current = ++version;
      setSession(nextSession);
      setProfile(null);
      setError(null);
      if (!nextSession) { setLoading(false); return; }
      setLoading(true);
      try {
        const result = await client.rpc('my_access_profile').maybeSingle();
        if (disposed || current !== version) return;
        if (result.error) throw result.error;
        setProfile(result.data as Profile | null);
      } catch {
        if (!disposed && current === version) setError('Não foi possível verificar seu acesso. Tente novamente.');
      } finally {
        if (!disposed && current === version) setLoading(false);
      }
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
      queueMicrotask(() => { if (!disposed) void synchronize(nextSession); });
    });
    return () => { disposed = true; version++; subscription.unsubscribe(); };
  }, [revision]);

  return <AuthContext.Provider value={{ session, profile, loading, error, recovery,
    finishRecovery: () => setRecovery(false), retry: () => setRevision(value => value + 1) }}>
    {children}
  </AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider ausente');
  return value;
}
