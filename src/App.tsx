import {lazy,Suspense} from 'react';
const SharingSettings=lazy(()=>import('./modules/branding/SharingSettings'));
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { AuthPage } from './modules/auth/AuthPage';
import { AccessGate, AccessIssue } from './modules/auth/AccessGate';
import { Dashboard } from './modules/dashboard/Dashboard';
import { Workspace } from './components/Workspace';
import { StudentsPage } from './modules/students/StudentsPage';
import { ExercisesPage } from './modules/exercises/ExercisesPage';
import { WorkoutsPage } from './modules/workouts/WorkoutsPage';

export function App() {
  const { pathname } = useLocation();
  return <><a href="#main" className="skip-link">Ir para o conteúdo</a><Routes>
    <Route path="/" element={<AuthPage key={pathname} />} />
    <Route path="/entrar" element={<AuthPage key={pathname} />} />
    <Route path="/recuperar-senha" element={<AuthPage key={pathname} />} />
    <Route path="/definir-senha" element={<AuthPage key={pathname} />} />
    <Route path="/acesso" element={<AccessIssue />} />
    <Route element={<AccessGate role="admin" />}><Route element={<Workspace />}><Route path="/admin" element={<StudentsPage />} /><Route path="/admin/exercicios" element={<ExercisesPage />} /><Route path="/admin/treinos" element={<WorkoutsPage />} /><Route path="/admin/compartilhamento" element={<Suspense fallback={<p role="status">Carregando configuração…</p>}><SharingSettings/></Suspense>} /></Route></Route>
    <Route element={<AccessGate role="student" />}><Route path="/aluno" element={<Dashboard />} /></Route>
    <Route path="*" element={<main className="issue" id="main"><h1>Página não encontrada.</h1><Link to="/">Voltar ao início</Link></main>} />
  </Routes></>;
}
