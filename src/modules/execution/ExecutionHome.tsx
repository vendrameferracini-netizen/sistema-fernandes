import { ExecutionActivity } from './ExecutionActivity';
import {BottomNavigation,QuickAccess,Button,type StudentView} from '../../components/ui';
import type {ReactNode} from 'react';
import { useEffect, useRef, useState } from 'react';
import { StudentProgram } from '../programs/StudentProgram';
import { getExecution, latestExecution, startExecution, type Execution } from './api';
import { ExecutionPanel } from './ExecutionPanel';
export function ExecutionHome({studentId,onDirty,profileContent}:{studentId:string;onDirty:(value:boolean)=>void;profileContent?:ReactNode}){
 const [view,setView]=useState<StudentView>('home');
 const [session,setSession]=useState<Execution|null>(null);const [recent,setRecent]=useState<string|null>(null);const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 const inFlight=useRef(false);const request=useRef<{key:string;signature:string}|null>(null);
 useEffect(()=>{let stopped=false;setLoading(true);setError('');async function load(){try{const last=await latestExecution(studentId);const active=last?.status==='in_progress'?await getExecution(last.id):null;if(!stopped){setSession(active);setRecent(last?.id??null);}}catch(e){if(!stopped)setError((e as Error).message);}finally{if(!stopped)setLoading(false);}}void load();return()=>{stopped=true;};},[studentId,revision]);
 async function start(program:string,version:number,entry:string){if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');onDirty(true);
 try{const signature=JSON.stringify([program,version,entry]);if(request.current?.signature!==signature)request.current={key:crypto.randomUUID(),signature};const id=await startExecution(request.current.key,program,version,entry);setSession(await getExecution(id));setView('workouts');request.current=null;}
 catch(e){setError((e as Error).message);}finally{inFlight.current=false;setBusy(false);onDirty(false);}}
 async function openRecent(){if(!recent||inFlight.current)return;inFlight.current=true;setBusy(true);try{setSession(await getExecution(recent));setView('workouts');}catch(e){setError((e as Error).message);}finally{inFlight.current=false;setBusy(false);}}
 if(loading)return <p role="status">Conferindo seu treino em andamento…</p>;

 return <div className="student-experience">
 <BottomNavigation value={view} onChange={setView} disabled={busy}/>
 {view==='home'&&session?.status==='in_progress'&&<section className="featured-workout"><span className="eyebrow">SEU TREINO JÁ COMEÇOU</span><h2>{session.snapshot.entry.workout.name}</h2><p>Retome de onde parou. Seu horário de início está preservado.</p><Button onClick={()=>setView('workouts')}>Continuar treino</Button></section>}
 <div hidden={(view!=='home'&&view!=='workouts')||(view==='home'&&session?.status==='in_progress')}>
 {session?<ExecutionPanel key={session.id} initial={session} onFinished={setSession} onDirty={onDirty} onHistory={()=>setView('history')} onExit={()=>{setSession(null);request.current=null;setView('home');setRevision(v=>v+1);}}/>:<>
 {error&&<div className="notice"><p role="alert">{error}</p><button className="secondary" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Conferir execução no servidor</button></div>}
 <StudentProgram studentId={studentId} featured={view==='home'} onStart={(program,entry)=>void start(program.id,program.version,entry)} starting={busy}/>
 {recent&&<button className="text-button" disabled={busy} onClick={()=>void openRecent()}>Consultar resumo da última execução</button>}</>}
 </div>
 {view==='home'&&<QuickAccess onChange={setView}/>}
 {(view==='history'||view==='progress'||view==='calendar')&&<ExecutionActivity key={view} studentId={studentId} initialSection={view==='progress'?'stats':view==='calendar'?'calendar':'history'}/>}
 {view==='profile'&&<section className="student-profile"><span className="eyebrow">SEU ESPAÇO</span><h2>Meu perfil</h2>{profileContent??<p>Seu acesso individual à consultoria.</p>}</section>}
 </div>;
}
