import {Badge,Button,EmptyState} from '../../components/ui';
import {ArrowRight,Flame,Dumbbell} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getProgramRevision,listPrograms,type Program,type ProgramSnapshot } from './api';
import { ProgramView } from './ProgramView';
export function StudentProgram({studentId,onStart,starting=false,featured=false}:{studentId:string;onStart?:(program:Program,entry:string)=>void;starting?:boolean;featured?:boolean}){
  const [program,setProgram]=useState<Program|null>(null);const [snapshot,setSnapshot]=useState<ProgramSnapshot|null>(null);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
  useEffect(()=>{let stopped=false;setLoading(true);setError('');setProgram(null);setSnapshot(null);
    async function load(){try{const rows=await listPrograms(studentId,true);const current=rows[0];const content=current?await getProgramRevision(current.id,current.version):null;if(!stopped){setProgram(current??null);setSnapshot(content?.snapshot??null);}}catch{if(!stopped)setError('Não foi possível carregar sua programação. Tente atualizar.');}finally{if(!stopped)setLoading(false);}}
    void load();const refresh=()=>setRevision(v=>v+1);window.addEventListener('focus',refresh);
    return()=>{stopped=true;window.removeEventListener('focus',refresh);};
  },[studentId,revision]);
  return <section className="student-program"><div className="program-heading"><h2>Minha programação</h2><button className="text-button" disabled={loading} onClick={()=>setRevision(v=>v+1)}>Atualizar programação</button></div>{loading?<p role="status">Carregando programação…</p>:error?<p role="alert">{error}</p>:program&&snapshot?<>{featured&&snapshot.entries[0]&&<div className="featured-workout"><div className="featured-top"><span className="eyebrow"><Flame size={16} aria-hidden="true"/>SEU TREINO EM DESTAQUE</span><Badge tone="brand">Disponível</Badge></div><div className="featured-art" aria-hidden="true"><Dumbbell size={100}/></div><span className="featured-label">{snapshot.entries[0].label}</span><h3>{snapshot.entries[0].workout.name}</h3><p>{snapshot.entries[0].workout.items.length} {snapshot.entries[0].workout.items.length===1?'exercício':'exercícios'} · {program.name}</p><small>Primeiro treino da sua programação. Escolha abaixo o treino que vai realizar.</small>{onStart&&<Button disabled={starting} onClick={()=>onStart(program,snapshot.entries[0].id)}>{starting?'Aguarde…':'Iniciar treino'}<ArrowRight size={19} aria-hidden="true"/></Button>}</div>}<h3 className="section-title">{program.name}</h3><ProgramView snapshot={snapshot} onStartEntry={onStart?id=>onStart(program,id):undefined} starting={starting}/></>:<EmptyState title="Sua programação está em preparação.">O Filipe disponibilizará aqui os treinos atribuídos a você.</EmptyState>}</section>;
}
