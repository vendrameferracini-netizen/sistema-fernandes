import {Smile,Meh,Frown,CheckCircle2} from 'lucide-react';
import {PageHeader,Button} from '../../components/ui';
import { ShareCard } from './ShareCard';
import { useEffect, useRef, useState } from 'react';
import { ProgramView } from '../programs/ProgramView';
import { finishExecution, getExecution, type Difficulty, type Execution } from './api';
function ElapsedTime({startedAt}:{startedAt:string}){const [now,setNow]=useState(Date.now);useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);const seconds=Math.max(0,Math.floor((now-Date.parse(startedAt))/1000));return <div className="elapsed-time"><span>Tempo decorrido</span><strong>{Math.floor(seconds/3600).toString().padStart(2,'0')}:{Math.floor(seconds/60%60).toString().padStart(2,'0')}:{(seconds%60).toString().padStart(2,'0')}</strong><small>Inclui seus intervalos</small></div>;}
const difficulties={easy:'Fácil',balanced:'Na medida',hard:'Difícil'};
export function ExecutionPanel({initial,onExit,onDirty,allowShare=true,onHistory,onFinished}:{initial:Execution;onExit:()=>void;onDirty:(value:boolean)=>void;allowShare?:boolean;onHistory?:()=>void;onFinished?:(session:Execution)=>void}){
 const [session,setSession]=useState(initial);
 const [confirm,setConfirm]=useState(false);
 const [outcome,setOutcome]=useState<'completed'|'not_completed'|''>('');
 const [difficulty,setDifficulty]=useState<Difficulty|''>('');
 const [comment,setComment]=useState('');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const inFlight=useRef(false);const request=useRef<{signature:string;key:string}|null>(null);
 const closed=session.status!=='in_progress';
 const dirty=!closed&&(Boolean(outcome||difficulty||comment)||busy);
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 async function reload(){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{setSession(await getExecution(session.id));}catch(e){setError((e as Error).message);}finally{inFlight.current=false;setBusy(false);}}
 async function finish(){if(!outcome||!difficulty||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
 try{const signature=JSON.stringify([session.id,session.version,outcome,difficulty,comment]);if(request.current?.signature!==signature)request.current={signature,key:crypto.randomUUID()};const finished=await finishExecution(request.current.key,session,outcome,difficulty,comment);setSession(finished);onFinished?.(finished);setConfirm(false);}
 catch(e){setError((e as Error).message);}finally{inFlight.current=false;setBusy(false);}}
 return <section className="execution-panel"><PageHeader eyebrow={closed?'RESUMO DO TREINO':'TREINO EM ANDAMENTO'} title={session.snapshot.entry.label+' · '+session.snapshot.entry.workout.name} description={session.snapshot.program_name}/>{!closed&&<ElapsedTime startedAt={session.started_at}/>} 
 <p>Início: {new Date(session.started_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>
 {closed?<div className={'notice execution-celebration '+(session.status==='completed'?'is-completed':'is-incomplete')}><span className="eyebrow"><CheckCircle2 size={18} aria-hidden="true"/> TREINO REGISTRADO</span><strong>{session.status==='completed'?'Treino concluído':'Treino não concluído'}</strong>
 <p>Término: {session.ended_at?new Date(session.ended_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'}</p>
 <p>Duração: {Math.floor((session.duration_seconds??session.summary?.elapsed_seconds??0)/60)} min {(session.duration_seconds??session.summary?.elapsed_seconds??0)%60} s (inclui intervalos).</p>
 {session.difficulty&&<p>Dificuldade: {difficulties[session.difficulty]}</p>}{session.feedback&&<p className="execution-comment">{session.feedback}</p>}
 <p>Treino salvo no seu histórico.</p></div>:<p>Consulte a prescrição enquanto treina. Seu início já está salvo; ao voltar, você retomará este treino.</p>}
 {closed&&session.status==='completed'&&allowShare&&<ShareCard session={session}/>}
 <ProgramView expanded snapshot={{name:session.snapshot.program_name,start_date:session.snapshot.program_start_date,status:'active',entries:[session.snapshot.entry]}}/>
 {error&&<div className="notice"><p role="alert">{error}</p><button disabled={busy} onClick={()=>void reload()}>Conferir execução no servidor</button></div>}
 {closed?<div className="program-actions"><Button onClick={onExit}>Voltar à programação</Button>{onHistory&&<Button tone="neutral" onClick={onHistory}>Ver meu histórico</Button>}</div>:confirm?<form className="execution-feedback notice" aria-label="Como foi seu treino?" onSubmit={e=>{e.preventDefault();void finish();}}>
 <h3>Como foi seu treino?</h3><fieldset disabled={busy}><legend>Resultado do treino</legend>
 <label className="outcome-positive"><input type="radio" name="outcome" value="completed" checked={outcome==='completed'} onChange={()=>setOutcome('completed')} required/> Concluí o treino</label>
 <label className="outcome-negative"><input type="radio" name="outcome" value="not_completed" checked={outcome==='not_completed'} onChange={()=>setOutcome('not_completed')} required/> Não consegui concluir</label></fieldset>
 <fieldset disabled={busy}><legend>Dificuldade percebida</legend>{(Object.entries(difficulties) as [Difficulty,string][]).map(([value,label])=><label key={value}><span className="difficulty-icon" aria-hidden="true">{value==='easy'?<Smile size={24}/>:value==='balanced'?<Meh size={24}/>:<Frown size={24}/>}</span><input type="radio" name="difficulty" checked={difficulty===value} onChange={()=>setDifficulty(value)} required/> {label}</label>)}</fieldset>
 <label htmlFor="execution-comment">{outcome==='not_completed'?'Motivo ou comentário (opcional)':'Comentário (opcional)'}</label>
 <textarea id="execution-comment" disabled={busy} maxLength={2000} value={comment} onChange={e=>setComment(e.target.value)}/>
 <p>A duração será calculada automaticamente ao confirmar. O registro será permanente.</p>
 <div className="form-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setConfirm(false)}>Continuar treinando</button><button className="primary" disabled={busy||!outcome||!difficulty}>{busy?'Salvando…':'Enviar feedback'}</button></div>
 </form>:<button className="primary execution-finish" onClick={()=>setConfirm(true)}>Finalizar treino</button>}
 </section>;
}
