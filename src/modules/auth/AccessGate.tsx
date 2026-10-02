import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { homeFor } from './model';
import { requireSupabase } from '../../lib/supabase';
import { Brand } from '../../components/Brand';
import { useState } from 'react';

export function AccessGate({ role }: { role: 'admin' | 'student' }) {
  const { loading, session, profile, recovery } = useAuth();
  if (loading) return <div className="loading" role="status">Verificando seu acesso…</div>;
  if (!session) return <Navigate to="/entrar" replace />;
  if (recovery) return <Navigate to="/definir-senha" replace />;
  if (!profile?.active) return <Navigate to="/acesso" replace />;
  if (profile.must_change_password) return <Navigate to="/definir-senha" replace />;
  if (profile.role !== role) return <Navigate to={homeFor(profile)} replace />;
  return <Outlet />;
}

export function AccessIssue() {
  const { loading, session, profile, error, retry } = useAuth();
  const [failure, setFailure] = useState('');
  if (loading) return <div className="loading" role="status">Verificando seu acesso…</div>;
  if (!session) return <Navigate to="/entrar" replace />;
  if (profile?.active) return <Navigate to={homeFor(profile)} replace />;
  return <main className="issue"><Brand /><h1>{error ? 'Não conseguimos verificar seu acesso.' : 'Seu acesso precisa de atenção.'}</h1><p>{error || 'Seu perfil ainda não foi liberado ou está inativo. Entre em contato com o Filipe para conferir seu cadastro.'}</p>{error && <button onClick={retry} className="primary">Tentar novamente</button>}<button className="secondary" onClick={async () => { const { error } = await requireSupabase().auth.signOut(); if (error) setFailure('Não foi possível sair. Tente novamente.'); }}>Sair da conta</button>{failure && <p role="alert">{failure}</p>}</main>;
}
