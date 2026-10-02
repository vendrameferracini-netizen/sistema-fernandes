import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Dumbbell, Plus, Save, Search } from 'lucide-react';
import { ExerciseImage } from './ExerciseImage';
import { listExercises, saveExercise, searchText, validateVideoUrl, type Exercise, type ExerciseInput } from './api';

function ExerciseForm({ exercise, onCancel, onSaved }: { exercise?: Exercise; onCancel: () => void; onSaved: () => void }) {
  const [value, setValue] = useState<ExerciseInput>({ name: exercise?.name ?? '', muscle_group: exercise?.muscle_group ?? '', equipment: exercise?.equipment ?? '', instructions: exercise?.instructions ?? '', video_url: exercise?.video_url ?? '' });
  const [record, setRecord] = useState(exercise);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function field(key: keyof ExerciseInput, text: string) { setValue(current => ({ ...current, [key]: text })); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { await saveExercise(value, record); onSaved(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  let videoLink = '';
  try { videoLink = validateVideoUrl(value.video_url ?? ''); } catch { /* Invalid drafts are shown on submit. */ }
  return <section className="student-form">
    <button className="text-button" onClick={onCancel} disabled={busy}><ArrowLeft size={18} />Voltar à biblioteca</button>
    <h1>{exercise ? 'Editar exercício' : 'Novo exercício'}</h1>
    <p>Organize as orientações que fazem parte do seu método.</p>
    <form onSubmit={submit}><fieldset disabled={busy} className="form-grid">
      <label className="full-width">Nome do exercício<input autoFocus required minLength={2} maxLength={160} value={value.name} onChange={e => field('name', e.target.value)} /></label>
      <label>Grupo muscular<input required minLength={2} maxLength={80} placeholder="Ex.: Peitoral" value={value.muscle_group} onChange={e => field('muscle_group', e.target.value)} /></label>
      <label>Equipamento (opcional)<input maxLength={120} placeholder="Ex.: Halteres" value={value.equipment} onChange={e => field('equipment', e.target.value)} /></label>
      <label className="full-width">Orientações de execução (opcional)<textarea rows={6} maxLength={5000} value={value.instructions} onChange={e => field('instructions', e.target.value)} /></label>
      <label className="full-width">Link do vídeo (opcional)<input type="url" maxLength={2048} placeholder="https://www.youtube.com/watch?v=..." value={value.video_url ?? ''} onChange={e => field('video_url', e.target.value)} /><small>Link externo HTTPS do YouTube ou de outro provedor. O vídeo não é enviado ao sistema.</small></label>
      {videoLink && <a className="text-button full-width" href={videoLink} target="_blank" rel="noopener noreferrer">Abrir vídeo em nova aba</a>}
    </fieldset>
    {error && <p role="alert" className="feedback error">{error}</p>}
    <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancelar</button><button className="primary" disabled={busy}><Save size={18} />{busy ? 'Salvando…' : exercise ? 'Salvar alterações' : 'Cadastrar exercício'}</button></div>
    </form>
    {record ? <ExerciseImage exercise={record} disabled={busy} onBusy={setBusy} onChanged={(image_path, updated_at) => setRecord(current => current ? { ...current, image_path, updated_at } : current)} /> : <p>Após cadastrar o exercício, abra Editar para adicionar a imagem.</p>}
  </section>;
}

export function ExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let stopped = false; setLoading(true); setError('');
    listExercises().then(data => { if (!stopped) setExercises(data); })
      .catch(() => { if (!stopped) setError('Não foi possível carregar os exercícios. Tente novamente.'); })
      .finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [revision]);
  function close() { setEditing(null); setRevision(current => current + 1); }
  if (editing) return <ExerciseForm exercise={editing === 'new' ? undefined : editing} onCancel={close} onSaved={() => {
    setNotice(editing === 'new' ? 'Exercício cadastrado.' : 'Exercício atualizado.'); close();
  }} />;
  const visible = exercises.filter(exercise => searchText(`${exercise.name} ${exercise.muscle_group} ${exercise.equipment}`).includes(searchText(query)));
  return <>
    <div className="page-title"><div><span className="eyebrow">SEU MÉTODO, EM CADA MOVIMENTO</span><h1>Biblioteca de exercícios.</h1><p>Organize exercícios e orientações para o seu acompanhamento.</p></div><button className="primary" onClick={() => { setNotice(''); setEditing('new'); }}><Plus size={18} />Novo exercício</button></div>
    {notice && <p role="status" className="notice">{notice}</p>}
    <div className="list-toolbar"><label className="search-field"><Search size={18} /><input aria-label="Buscar exercícios" placeholder="Buscar por nome, grupo muscular ou equipamento" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
    {loading ? <p role="status" className="empty">Carregando exercícios…</p> : error ? <div className="empty"><p role="alert">{error}</p><button className="secondary" onClick={() => setRevision(current => current + 1)}>Tentar novamente</button></div> : <>
      <p role="status" className="exercise-count">{visible.length} {visible.length === 1 ? 'exercício encontrado' : 'exercícios encontrados'}</p>
      {!visible.length ? <div className="empty"><Dumbbell size={34} /><h2>{exercises.length ? 'Nenhum exercício encontrado.' : 'Sua biblioteca começa aqui.'}</h2><p>{exercises.length ? 'Tente outro nome, grupo muscular ou equipamento.' : 'Cadastre seu primeiro exercício e suas orientações de execução.'}</p></div> : <div className="student-list">{visible.map(exercise => <button className="student-row" key={exercise.id} onClick={() => { setNotice(''); setEditing(exercise); }}><span className="avatar"><Dumbbell size={22} /></span><span className="student-name"><strong>{exercise.name}</strong><small>{exercise.muscle_group}{exercise.equipment ? ` · ${exercise.equipment}` : ''}</small></span><span className="status">Editar</span><ArrowUpRight size={18} /></button>)}</div>}
    </>}
  </>;
}
