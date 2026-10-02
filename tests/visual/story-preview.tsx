import {createRoot} from 'react-dom/client';
import {ShareCard} from '../../src/modules/execution/ShareCard';
import {session} from './supabase-mock';
import '../../src/styles.css';
const closed={...session,status:'completed' as const,difficulty:'balanced' as const,feedback:'PRIVADO — NUNCA NO CARD',duration_seconds:2912,ended_at:new Date().toISOString(),performed_on:'2026-10-01'};
async function sample(){const blob=await (await fetch('/filipe-oficial.png')).blob();const input=document.querySelector<HTMLInputElement>('input[type=file]')!;const transfer=new DataTransfer();transfer.items.add(new File([blob],'foto-local-de-teste.png',{type:'image/png'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}
createRoot(document.getElementById('root')!).render(<main className="dashboard"><p>PRÉVIA ISOLADA · Foto de exemplo local para simular a seleção de arquivo</p><button className="secondary" onClick={()=>void sample()}>Selecionar foto de exemplo</button><ShareCard session={closed}/></main>);
