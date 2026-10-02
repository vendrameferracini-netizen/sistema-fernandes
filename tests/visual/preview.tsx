import {ExecutionHome} from '../../src/modules/execution/ExecutionHome';
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ExecutionPanel} from '../../src/modules/execution/ExecutionPanel';
import {ExecutionActivity} from '../../src/modules/execution/ExecutionActivity';
import {session} from './supabase-mock';
import '../../src/styles.css';
function Preview(){const [mode,setMode]=useState('home');return <div className="workspace student-workspace"><header className="workspace-header"><strong>SISTEMA <span style={{color:'var(--brand)'}}>FERNANDES</span></strong></header><main className="dashboard"><p>PRÉVIA LOCAL · DADOS FICTÍCIOS</p><nav className="program-actions"><button className="secondary" onClick={()=>setMode('home')}>Aluno</button><button className="secondary" onClick={()=>setMode('execution')}>Execução</button><button className="secondary" onClick={()=>setMode('history')}>Histórico</button><button className="secondary" onClick={()=>setMode('coach')}>Filipe</button></nav>{mode==='home'?<><h1>Olá, Aluno.</h1><p>Bom ter você por aqui. Sua evolução tem um lugar.</p><ExecutionHome studentId="demo" onDirty={()=>{}}/></>:mode==='execution'?<ExecutionPanel initial={session} onDirty={()=>{}} onExit={()=>setMode('history')}/>:<ExecutionActivity key={mode} studentId="demo" admin={mode==='coach'}/>}</main></div>;}createRoot(document.getElementById('root')!).render(<Preview/>);
