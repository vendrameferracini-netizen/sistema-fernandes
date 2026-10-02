import { ActivityLauncher } from '../execution/ExecutionActivity';
import { ProgramManager } from '../programs/ProgramManager';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, Send, Save } from 'lucide-react';
import { resetStudentPassword, saveStudent, type Student, type StudentFormData } from './api';
export function StudentForm({ student, onCancel, onSaved }: { student?: Student; onCancel: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<StudentFormData>({
    full_name: student?.profiles.full_name ?? '', username: student?.profiles.username ?? '', password:'',
    phone: student?.phone ?? '', birth_date: student?.birth_date ?? '',
    objective: student?.objective ?? '', start_date: student?.start_date ?? new Date().toLocaleDateString('en-CA'),
    notes: student?.student_admin_notes?.notes ?? '', active: student?.profiles.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [temporary, setTemporary] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  function field<Key extends keyof StudentFormData>(key: Key, next: StudentFormData[Key]) { setValue(current => ({ ...current, [key]: next })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await saveStudent(value, student?.id); field('password',''); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  async function resetPassword(event: FormEvent) {
    event.preventDefault(); if (!student) return; setBusy(true); setError(''); setResetNotice('');
    try { await resetStudentPassword(student,temporary); setTemporary(''); setResetNotice('Senha temporária definida. O aluno deverá entrar novamente e trocar a senha.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível redefinir a senha.'); }
    finally { setBusy(false); }
  }
  return <section className="student-form" id="student-overview"><button className="text-button" onClick={onCancel} disabled={busy}><ArrowLeft size={18} />Voltar aos alunos</button><h2>{student ? 'Ficha do aluno' : 'Novo aluno'}</h2><p>{student ? 'Atualize o cadastro e as informações da consultoria.' : 'Defina o usuário e uma senha inicial. O aluno deverá trocá-la no primeiro acesso.'}</p>
    <form onSubmit={submit}><fieldset disabled={busy} className="form-grid">
      <label className="full-width">Nome completo<input required minLength={2} maxLength={160} autoComplete="name" value={value.full_name} onChange={e => field('full_name', e.target.value)} /></label>
      <label>Usuário<input aria-label="Usuário" required minLength={3} maxLength={40} pattern="[a-zA-Z][a-zA-Z0-9_]{2,39}" autoCapitalize="none" spellCheck={false} autoComplete="off" readOnly={Boolean(student)} value={value.username} onChange={e => field('username', e.target.value)} /><small>Letras, números e sublinhado. Comece com uma letra.</small></label>
      {!student && <label>Senha inicial<input aria-label="Senha inicial" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={value.password} onChange={e => field('password', e.target.value)} /><small>Informe a senha ao aluno de forma privada. Ela não poderá ser consultada depois.</small></label>}
      <label>Telefone<input type="tel" autoComplete="tel" maxLength={32} value={value.phone} onChange={e => field('phone', e.target.value)} /></label>
      <label>Data de nascimento<input type="date" min="1900-01-01" max={new Date().toLocaleDateString('en-CA')} value={value.birth_date ?? ''} onChange={e => field('birth_date', e.target.value)} /></label>
      <label>Início da consultoria<input required type="date" value={value.start_date} onChange={e => field('start_date', e.target.value)} /></label>
      <label className="full-width">Objetivo principal<textarea maxLength={1000} rows={3} value={value.objective} onChange={e => field('objective', e.target.value)} /></label>
      <label className="full-width">Observações administrativas<textarea maxLength={5000} rows={4} value={value.notes} onChange={e => field('notes', e.target.value)} /><small>Visíveis apenas para o Filipe.</small></label>
      {student && <label className="full-width">Status<select value={String(value.active)} onChange={e => field('active', e.target.value === 'true')}><option value="true">Ativo</option><option value="false">Inativo — suspender acesso aos dados</option></select><small>Desativar preserva o cadastro e os registros.</small></label>}
    </fieldset><div className="form-actions"><button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Salvando…' : student ? 'Salvar alterações' : 'Cadastrar aluno'}{student ? <Save size={18} /> : <Send size={18} />}</button></div></form>
    {student && <form onSubmit={resetPassword}><h2>Redefinir acesso</h2><p>Após confirmar a identidade do aluno, defina uma senha temporária. A senha atual nunca é exibida.</p><label>Nova senha temporária<input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={temporary} onChange={e=>setTemporary(e.target.value)} disabled={busy || !student.profiles.active} /></label><button className="secondary" disabled={busy || !student.profiles.active}>Redefinir senha do aluno</button>{!student.profiles.active && <p>Reative o aluno e reabra sua ficha para redefinir o acesso.</p>}</form>}
    {error && <p role="alert" className="feedback error">{error}</p>}{resetNotice && <p role="status" className="notice">{resetNotice}</p>}
    {student && <nav className="student-section-nav" aria-label="Seções da ficha"><a href="#student-overview">Visão geral</a><a href="#student-training">Treinos</a><a href="#student-activity">Frequência · Histórico · Feedbacks · Progresso</a></nav>}
    {student && <div id="student-activity"><h2>{student.profiles.full_name} · Acompanhamento</h2><ActivityLauncher key={student.id} studentId={student.id} admin/></div>}
    {student && <div id="student-training"><ProgramManager studentId={student.id} studentActive={student.profiles.active} /></div>}
  </section>;
}
