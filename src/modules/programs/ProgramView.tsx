import { Badge, Button } from '../../components/ui';
import {Dumbbell,Play,Timer,MessageSquare,ChevronDown} from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloadImage } from '../exercises/media';
import { validateVideoUrl } from '../exercises/api';
import { displayDate, type ProgramSnapshot } from './api';
function AssignedImage({path,name}:{path:string;name:string}){
  const [url,setUrl]=useState('');const [error,setError]=useState(false);const [retry,setRetry]=useState(0);
  useEffect(()=>{let stopped=false;let local='';setUrl('');setError(false);downloadImage(path).then(blob=>{if(!stopped){local=URL.createObjectURL(blob);setUrl(local);}}).catch(()=>{if(!stopped)setError(true);});return()=>{stopped=true;if(local)URL.revokeObjectURL(local);};},[path,retry]);
  return error?<div><p>Não foi possível carregar a imagem.</p><button type="button" className="text-button" onClick={()=>setRetry(v=>v+1)}>Tentar imagem novamente</button></div>:url?<img className="exercise-image" src={url} alt={name}/>:<p role="status">Carregando imagem…</p>;
}
export function ProgramView({snapshot,showImages=true,expanded=false,onStartEntry,starting=false}:{snapshot:ProgramSnapshot;showImages?:boolean;expanded?:boolean;onStartEntry?:(id:string)=>void;starting?:boolean}){
 return <div className="program-view"><p className="program-date">Programação · Início: {displayDate(snapshot.start_date)}</p>{snapshot.entries.map(entry=><details className="workout-card" key={entry.id} open={expanded||undefined}>
 <summary><span className="workout-symbol"><Dumbbell size={24} aria-hidden="true"/></span><span className="workout-summary-copy"><strong>{entry.label} · {entry.workout.name}</strong><small>{entry.workout.items.length} {entry.workout.items.length===1?'exercício':'exercícios'} · Prescrição do Filipe</small></span><ChevronDown className="expand-icon" size={20} aria-hidden="true"/></summary>
 {onStartEntry&&<Button className="execution-start-button" disabled={starting} onClick={()=>onStartEntry(entry.id)}><Play size={18} aria-hidden="true"/>{starting?'Aguarde…':`Iniciar ${entry.label} · ${entry.workout.name}`}</Button>}
 {entry.workout.instructions&&<p className="workout-instructions"><MessageSquare size={18} aria-hidden="true"/>{entry.workout.instructions}</p>}
 {entry.workout.items.map((item,index)=>{let link='';try{link=validateVideoUrl(item.exercise.video_url??'');}catch{/* Keep invalid historical URLs non-interactive. */}
 return <section className="program-exercise" key={item.id}><header className="exercise-heading"><span className="exercise-number">{String(index+1).padStart(2,'0')}</span><h3>{item.exercise.name}</h3></header>
 {showImages&&item.exercise.image_path&&<AssignedImage path={item.exercise.image_path} name={item.exercise.name}/>}
 <div className="prescription-strip"><strong>{item.sets} séries · {item.repetitions} repetições</strong><Badge><Timer size={14} aria-hidden="true"/>Descanso: {item.rest_seconds}s</Badge></div>
 {item.exercise.instructions&&<p>{item.exercise.instructions}</p>}{item.coach_notes&&<p className="coach-note"><strong>Orientação do Filipe:</strong> {item.coach_notes}</p>}{link&&<a href={link} target="_blank" rel="noopener noreferrer" className="exercise-video"><Play size={17} aria-hidden="true"/>Ver vídeo em nova aba</a>}</section>;})}
 </details>)}</div>;
}
