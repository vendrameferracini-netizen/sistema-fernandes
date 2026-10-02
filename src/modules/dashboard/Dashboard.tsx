import { ExecutionHome } from '../execution/ExecutionHome';
import { useEffect, useState } from 'react';
import { LogOut, ShieldCheck, UserRound, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../../components/Brand';
import { useAuth } from '../auth/AuthProvider';
import { requireSupabase } from '../../lib/supabase';

export function Dashboard() {
  const { profile } = useAuth();
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => { const link = (event.target as Element).closest?.('a'); if (link && !link.getAttribute('href')?.startsWith('#') && link.target !== '_blank' && !window.confirm('Há registros não confirmados. Sair pode perder essas edições. Deseja sair?')) { event.preventDefault(); event.stopPropagation(); } };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const admin = profile?.role === 'admin';
  return <div className="workspace student-workspace">
    <header className="workspace-header"><Brand /><button className="text-button" onClick={async () => { if (dirty && !window.confirm('Há registros não confirmados. Sair pode perder essas edições. Deseja sair?')) return; const result = await requireSupabase().auth.signOut(); if (result.error) setError('Não foi possível sair. Tente novamente.'); }}><LogOut size={18} />Sair</button></header>
    <main className="dashboard" id="main"><span className="eyebrow">{admin ? 'ÁREA DO COACH' : 'SUA CONSULTORIA'}</span><h1>Olá, {profile?.full_name.split(' ')[0]}!</h1><p>{admin ? 'Este é o início da sua central de acompanhamento.' : 'Bora pra mais um treino?'}</p>
      {error && <p className="feedback error" role="alert">{error}</p>}
      {profile && !admin && <ExecutionHome key={profile.id} studentId={profile.id} onDirty={setDirty} profileContent={<><div className="profile-row"><div><UserRound size={22} /><span><strong>{profile?.full_name}</strong><small>{admin ? 'Administrador' : 'Aluno'} · Acesso individual</small></span></div><Link to="/definir-senha">Alterar senha <ArrowRight size={17} /></Link></div>
      <p className="privacy-note"><ShieldCheck size={16} /> Seu perfil é verificado pela consultoria a cada acesso.</p></>}/> }

    </main>
  </div>;
}
