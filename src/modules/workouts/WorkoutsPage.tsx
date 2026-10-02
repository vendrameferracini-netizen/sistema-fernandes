import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Copy, ClipboardList, Plus, Search } from 'lucide-react';
import { searchText } from '../exercises/api';
import { duplicateWorkout, getWorkout, listWorkouts, type Workout, type WorkoutDetail } from './api';
import { WorkoutEditor } from './WorkoutEditor';

function DuplicateForm({source,onClose,onSaved}:{source:Workout;onClose:()=>void;onSaved:()=>void}) {
  const [target]=useState(()=>crypto.randomUUID());
  const [name,setName]=useState(`${source.name.slice(0,152)} — Cópia`);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const saving=useRef(false);
  async function submit(event:FormEvent){event.preventDefault();if(saving.current)return;saving.current=true;setBusy(true);setError('');try{await duplicateWorkout(source,target,name);onSaved();}catch(failure){setError((failure as Error).message);}finally{saving.current=false;setBusy(false);}}
  return <section className="student-form"><h1>Duplicar treino</h1><p>Crie uma ficha independente a partir de {source.name}. A ficha original será preservada.</p><form onSubmit={submit}><label>Nome da cópia<input autoFocus required minLength={2} maxLength={160} disabled={busy} value={name} onChange={e=>setName(e.target.value)}/></label>{error && <p role="alert" className="feedback error">{error}</p>}<div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary" disabled={busy}>{busy?'Duplicando…':'Criar cópia'}</button></div></form></section>;
}
export function WorkoutsPage(){
  const [rows,setRows]=useState<Workout[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  const [query,setQuery]=useState('');const [revision,setRevision]=useState(0);const [notice,setNotice]=useState('');
  const [editing,setEditing]=useState<WorkoutDetail|'new'|null>(null);const [copy,setCopy]=useState<Workout|null>(null);
  const [opening,setOpening]=useState(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{let stopped=false;setLoading(true);setError('');listWorkouts().then(data=>{if(!stopped)setRows(data);}).catch(failure=>{if(!stopped)setError(failure.message);}).finally(()=>{if(!stopped)setLoading(false);});return()=>{stopped=true;};},[revision]);
  function close(){setEditing(null);setCopy(null);setRevision(value=>value+1);}
  async function open(id:string){if(opening)return;setOpening(true);setError('');setNotice('');try{const workout=await getWorkout(id);if(mounted.current)setEditing(workout);}catch(failure){if(mounted.current)setError((failure as Error).message);}finally{if(mounted.current)setOpening(false);}}
  if(editing)return <WorkoutEditor workout={editing==='new'?undefined:editing} onClose={close} onSaved={()=>{setNotice('Treino salvo.');close();}}/>;
  if(copy)return <DuplicateForm source={copy} onClose={close} onSaved={()=>{setNotice('Cópia criada. Você pode editá-la sem alterar o treino original.');close();}}/>;
  const visible=rows.filter(row=>searchText(`${row.name} ${row.instructions}`).includes(searchText(query)));
  return <><div className="page-title"><div><span className="eyebrow">PLANEJAMENTO COM MÉTODO</span><h1>Seus treinos.</h1><p>Monte fichas com uma sequência clara e orientações para cada movimento.</p></div><button className="primary" disabled={opening} onClick={()=>{setNotice('');setEditing('new');}}><Plus size={18}/>Novo treino</button></div>
    {notice && <p role="status" className="notice">{notice}</p>}
    <div className="list-toolbar"><label className="search-field"><Search size={18}/><input aria-label="Buscar treinos" placeholder="Buscar pelo nome ou orientação geral" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    {opening && <p role="status">Abrindo treino…</p>}
    {loading?<p role="status" className="empty">Carregando treinos…</p>:error?<div className="empty"><p role="alert">{error}</p><button className="secondary" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button></div>:!visible.length?<div className="empty"><ClipboardList size={34}/><h2>{rows.length?'Nenhum treino encontrado.':'Monte seu primeiro treino.'}</h2><p>{rows.length?'Tente outro termo de busca.':'Escolha os exercícios da biblioteca e personalize sua prescrição.'}</p></div>:<><p className="exercise-count" role="status">{visible.length} {visible.length===1?'treino encontrado':'treinos encontrados'}</p><div className="workout-list">{visible.map(row=><article className="workout-list-row" key={row.id}><div><h2>{row.name}</h2><p>{row.instructions || 'Sem orientação geral.'}</p></div><div className="workout-list-actions"><button className="secondary" disabled={opening} onClick={()=>void open(row.id)} aria-label={`Editar ${row.name}`}>Editar</button><button className="text-button" disabled={opening} onClick={()=>{setNotice('');setCopy(row);}} aria-label={`Duplicar ${row.name}`}><Copy size={18}/>Duplicar</button></div></article>)}</div></>}
  </>;
}
