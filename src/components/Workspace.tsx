import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { LogOut, Users, KeyRound, Dumbbell, ClipboardList, Image } from 'lucide-react';
import { Brand } from './Brand';
import { requireSupabase } from '../lib/supabase';
export function Workspace() {
  const [error, setError] = useState('');
  return <div className="workspace"><header className="workspace-header"><Brand /><div className="workspace-actions"><Link to="/definir-senha"><KeyRound size={17} /><span>Alterar senha</span></Link><button className="text-button" onClick={async () => { const { error } = await requireSupabase().auth.signOut(); if (error) setError('Não foi possível sair. Tente novamente.'); }}><LogOut size={18} />Sair</button></div></header><nav className="workspace-nav" aria-label="Administração"><NavLink to="/admin" end><Users size={18} />Alunos</NavLink><NavLink to="/admin/exercicios"><Dumbbell size={18} />Exercícios</NavLink><NavLink to="/admin/treinos"><ClipboardList size={18} />Treinos</NavLink><NavLink to="/admin/compartilhamento"><Image size={18}/>Compartilhamento</NavLink><span>FILIPE FERNANDES · ÁREA DO COACH</span></nav><main className="dashboard" id="main">{error && <p role="alert" className="feedback error">{error}</p>}<Outlet /></main></div>;
}
