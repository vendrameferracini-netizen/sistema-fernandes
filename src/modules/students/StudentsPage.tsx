import {StatCard} from '../../components/ui';
import { listPrograms, type Program } from '../programs/api';
import { useEffect, useState } from 'react';
import { Plus, Search, Users, ArrowUpRight } from 'lucide-react';
import { listStudents, type Student } from './api';
import { StudentForm } from './StudentForm';
export function StudentsPage() {
  const [revision, setRevision] = useState(0);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [programState, setProgramState] = useState('Carregando programação…');
  useEffect(() => {
    let stopped = false; setProgramState('Carregando programação…');
    listPrograms(undefined, true).then(rows => { if (!stopped) { setPrograms(rows); setProgramState(''); } })
      .catch(() => { if (!stopped) setProgramState('Programação indisponível — reabra a ficha para consultar.'); });
    return () => { stopped = true; };
  }, [revision]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<Student | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let stopped = false; setLoading(true); setError('');
    listStudents().then(data => { if (!stopped) setStudents(data); }).catch(failure => {
      if (!stopped) setError(failure.message);
    }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [revision]);
  const activePrograms = new Map(programs.map(program => [program.student_id, program.name]));
  const active = students.filter(student => student.profiles.active).length;
  const visible = students.filter(student =>
    `${student.profiles.full_name} ${student.profiles.username}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')) &&
    (filter === 'all' || student.profiles.active === (filter === 'active')),
  );
  if (editing) return <StudentForm student={editing === 'new' ? undefined : editing} onCancel={() => { setEditing(null); setRevision(v => v + 1); }} onSaved={() => {
    setNotice(editing === 'new' ? 'Aluno cadastrado. Informe o usuário e a senha inicial ao aluno de forma privada.' : 'Cadastro atualizado.');
    setEditing(null); setRevision(value => value + 1);
  }} />;
  return <><div className="page-title"><div><span className="eyebrow">ACOMPANHAMENTO INDIVIDUAL</span><h1>Seus alunos.</h1><p>Cada pessoa, um planejamento. Toda a consultoria em um lugar.</p></div><button className="primary" onClick={() => { setNotice(''); setEditing('new'); }}><Plus size={18} />Novo aluno</button></div>
    {notice && <p role="status" className="notice">{notice}</p>}
    <div className="stats"><StatCard label="Alunos ativos" value={loading || error?'—':active} tone="positive"/><StatCard label="Alunos inativos" value={loading || error?'—':students.length-active} tone="neutral"/><StatCard label="Total de alunos" value={loading || error?'—':students.length}/></div>
    <div className="list-toolbar"><label className="search-field"><Search size={18} /><input aria-label="Buscar aluno por nome ou usuário" placeholder="Buscar por nome ou usuário" value={query} onChange={e => setQuery(e.target.value)} /></label><label><span className="sr-only">Filtrar por status</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos os alunos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label></div>
    {loading ? <p role="status" className="empty">Carregando alunos…</p> : error ? <div className="empty"><p role="alert">{error}</p><button className="secondary" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></div> : !visible.length ? <div className="empty"><Users size={34} /><h2>{students.length ? 'Nenhum aluno encontrado.' : 'O próximo passo é seu primeiro aluno.'}</h2><p>{students.length ? 'Tente outro nome ou altere o filtro.' : 'Cadastre um aluno e comece a organizar os acompanhamentos.'}</p></div> : <div className="student-list">{visible.map(student => <button className="student-row" key={student.id} onClick={() => { setNotice(''); setEditing(student); }}><span className="avatar">{student.profiles.full_name.charAt(0)}</span><span className="student-name"><strong>{student.profiles.full_name}</strong><small>{student.profiles.username}</small><small>{programState || (activePrograms.has(student.id) ? 'Programação ativa: ' + activePrograms.get(student.id) : 'Sem programação ativa')}</small></span><span className={`status ${student.profiles.active ? 'active' : ''}`}>{student.profiles.active ? 'Ativo' : 'Inativo'}</span><ArrowUpRight size={18} /></button>)}</div>}
  </>;
}
