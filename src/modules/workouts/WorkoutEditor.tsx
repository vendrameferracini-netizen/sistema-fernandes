import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import { listExercises, searchText, type Exercise } from '../exercises/api';
import { saveWorkout, type WorkoutDetail, type WorkoutItem } from './api';

export function WorkoutEditor({workout,onClose,onSaved}:{workout?:WorkoutDetail;onClose:()=>void;onSaved:()=>void}) {
  const [target]=useState(()=>workout?.id ?? crypto.randomUUID());
  const [name,setName]=useState(workout?.name ?? '');
  const [instructions,setInstructions]=useState(workout?.instructions ?? '');
  const [items,setItems]=useState<WorkoutItem[]>(workout?.workout_items ?? []);
  const [library,setLibrary]=useState<Exercise[]>([]);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [libraryError,setLibraryError]=useState('');
  const [retry,setRetry]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [dirty,setDirty]=useState(false);
  const [notice,setNotice]=useState('');
  const saving=useRef(false);
  useEffect(()=>{
    let stopped=false;setLoading(true);setLibraryError('');
    listExercises().then(data=>{if(!stopped)setLibrary(data);}).catch(()=>{if(!stopped)setLibraryError('Não foi possível carregar a Biblioteca de Exercícios.');}).finally(()=>{if(!stopped)setLoading(false);});
    return ()=>{stopped=true;};
  },[retry]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const byId=new Map(library.map(exercise=>[exercise.id,exercise]));
  function close(){if(!dirty || window.confirm('Descartar as alterações não salvas deste treino?'))onClose();}
  function add(exercise:Exercise){
    if(items.length>=100)return;
    setItems(current=>[...current,{id:crypto.randomUUID(),exercise_id:exercise.id,sets:3,repetitions:'10–12',rest_seconds:60,coach_notes:''}]);
    setDirty(true);setNotice(`${exercise.name} adicionado ao final do treino.`);
  }
  function update(id:string,patch:Partial<WorkoutItem>){setItems(current=>current.map(item=>item.id===id?{...item,...patch}:item));setDirty(true);}
  function move(index:number,direction:number){
    const next=[...items];[next[index],next[index+direction]]=[next[index+direction],next[index]];
    setItems(next);setDirty(true);setNotice(`Exercício movido para a posição ${index+direction+1}.`);
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(saving.current)return;saving.current=true;setBusy(true);setError('');
    try{await saveWorkout(target,name,instructions,items,workout?.version ?? 0);setDirty(false);onSaved();}
    catch(failure){setError(failure instanceof Error?failure.message:'Não foi possível salvar o treino.');}
    finally{saving.current=false;setBusy(false);}
  }
  const matching=library.filter(exercise=>searchText(`${exercise.name} ${exercise.muscle_group} ${exercise.equipment}`).includes(searchText(query)));
  return <section className="student-form workout-editor">
    <button className="text-button" disabled={busy} onClick={close}><ArrowLeft size={18}/>Voltar aos treinos</button>
    <h1>{workout?'Editar treino':'Novo treino'}</h1><p>Monte a sequência e personalize as orientações de cada exercício.</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="form-grid">
        <label className="full-width">Nome do treino<input autoFocus required minLength={2} maxLength={160} value={name} onChange={e=>{setName(e.target.value);setDirty(true);}} placeholder="Ex.: Treino A — Peito e ombros"/></label>
        <label className="full-width">Orientação geral (opcional)<textarea rows={3} maxLength={5000} value={instructions} onChange={e=>{setInstructions(e.target.value);setDirty(true);}}/></label>
      </fieldset>
      <section className="workout-picker" aria-label="Adicionar exercícios da biblioteca"><h2>1. Escolha os exercícios</h2>
        <label>Buscar na biblioteca<input disabled={busy} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nome, grupo muscular ou equipamento"/></label>
        {loading?<p role="status">Carregando biblioteca…</p>:libraryError?<div><p role="alert">{libraryError}</p><button type="button" className="secondary" disabled={busy} onClick={()=>setRetry(value=>value+1)}>Tentar carregar biblioteca novamente</button></div>:!library.length?<p>Cadastre exercícios na Biblioteca para montar seu treino.</p>:<><p>{matching.length} exercícios encontrados. Toque em Adicionar para incluí-los na sequência.</p><div className="workout-library">{matching.map(exercise=><button className="workout-library-item" type="button" key={exercise.id} disabled={busy || items.length>=100} onClick={()=>add(exercise)} aria-label={`Adicionar ${exercise.name}`}><span><strong>{exercise.name}</strong><small>{exercise.muscle_group}{exercise.equipment?` · ${exercise.equipment}`:''}</small></span><span><Plus size={18}/>Adicionar</span></button>)}</div>{!matching.length && <p>Nenhum exercício encontrado. Tente outra busca.</p>}</>}
      </section>
      <h2>2. Organize a prescrição</h2><p>{items.length} de 100 exercícios. Use as setas para alterar a ordem. Descanso em segundos; 60 segundos = 1 minuto.</p>
      {notice && <p role="status" className="notice">{notice}</p>}
      {!items.length && <p className="empty">Adicione pelo menos um exercício da biblioteca.</p>}
      {items.map((item,index)=><fieldset disabled={busy} className="workout-card" key={item.id}>
        <legend>{index+1}. {byId.get(item.exercise_id)?.name ?? 'Exercício da biblioteca'}</legend>
        <div className="workout-order"><button type="button" disabled={busy || index===0} onClick={()=>move(index,-1)} aria-label={`Subir exercício ${index+1}`}><ArrowUp size={18}/>Subir</button><button type="button" disabled={busy || index===items.length-1} onClick={()=>move(index,1)} aria-label={`Descer exercício ${index+1}`}><ArrowDown size={18}/>Descer</button><button type="button" onClick={()=>{setItems(current=>current.filter(row=>row.id!==item.id));setDirty(true);setNotice('Exercício removido da sequência. A biblioteca permanece igual.');}} aria-label={`Remover exercício ${index+1}`}><Trash2 size={18}/>Remover</button></div>
        <div className="workout-prescription"><label>Séries<input required type="number" min={1} max={100} step={1} inputMode="numeric" value={Number.isNaN(item.sets)?'':item.sets} onChange={e=>update(item.id,{sets:e.target.valueAsNumber})}/></label><label>Repetições<input required maxLength={80} value={item.repetitions} placeholder="Ex.: 10–12" onChange={e=>update(item.id,{repetitions:e.target.value})}/></label><label>Descanso (segundos)<input required type="number" min={0} max={3600} step={1} inputMode="numeric" value={Number.isNaN(item.rest_seconds)?'':item.rest_seconds} onChange={e=>update(item.id,{rest_seconds:e.target.valueAsNumber})}/></label></div>
        <label>Orientação do coach (opcional)<textarea rows={2} maxLength={2000} value={item.coach_notes} onChange={e=>update(item.id,{coach_notes:e.target.value})}/></label>
      </fieldset>)}
      {error && <p role="alert" className="feedback error">{error}</p>}
      <div className="form-actions workout-save"><button type="button" disabled={busy} className="secondary" onClick={close}>Cancelar</button><button className="primary" disabled={busy || !items.length}><Save size={18}/>{busy?'Salvando…':'Salvar treino'}</button></div>
    </form>
  </section>;
}
