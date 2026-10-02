import {useEffect,useRef,useState} from 'react';
import type {Execution} from './api';
import type {StoryPhoto} from './share-image';
type BrandPhoto={photo?:Blob;notice:string};
export function ShareCard({session}:{session:Execution}){
 const [enabled,setEnabled]=useState(false),[student,setStudent]=useState<StoryPhoto|null>(null),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(''),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState(''),[photoNotice,setPhotoNotice]=useState(''),[retry,setRetry]=useState(0);
 const input=useRef<HTMLInputElement>(null),brand=useRef<Promise<BrandPhoto>|null>(null),selection=useRef(0);
 useEffect(()=>()=>{selection.current++;},[]);
 useEffect(()=>{setPreview('');if(!file)return;const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
 useEffect(()=>{if(!enabled)return;let stopped=false;setBusy(true);setFile(null);setError('');const timer=setTimeout(()=>{void (async()=>{try{
 const {renderShareCard}=await import('./share-image');
 if(!brand.current)brand.current=(async()=>{try{const {getSharingBrand,getBrandPhoto}=await import('../branding/api');const b=await getSharingBrand();return {photo:b.image_path?await getBrandPhoto(b.image_path):undefined,notice:''};}catch{return {notice:'Foto institucional indisponível. O card continua disponível sem ela.'};}})();
 const institutional=await brand.current;const blob=await renderShareCard(session,institutional.photo,student??undefined);
 if(!stopped){setPhotoNotice(institutional.notice);setFile(new File([blob],'treino-sistema-fernandes.png',{type:'image/png'}));}
 }catch(e){if(!stopped)setError((e as Error).message);}finally{if(!stopped)setBusy(false);}})();},180);return()=>{stopped=true;clearTimeout(timer);};},[enabled,session,student,retry]);
 async function choose(photo?:File){if(!photo)return;const current=++selection.current;setPreparing(true);setError('');try{const {prepareStudentPhoto}=await import('./share-image');const blob=await prepareStudentPhoto(photo);if(current===selection.current){setFile(null);setStudent({blob,x:.5,y:.5});setEnabled(true);}}catch(e){if(current===selection.current)setError((e as Error).message);}finally{if(current===selection.current)setPreparing(false);}}
 function position(axis:'x'|'y',value:number){setFile(null);setStudent(s=>s?{...s,[axis]:value}:null);}
 async function share(){if(!file||busy||preparing)return;setError('');try{await navigator.share({files:[file],title:'Treino concluído · Sistema Fernandes'});}catch(e){if((e as Error).name!=='AbortError')setError('Não foi possível compartilhar. Você pode salvar a imagem abaixo.');}}
 const ready=Boolean(file&&preview&&!busy&&!preparing);
 return <section className="share-training" aria-label="Compartilhar conquista"><h3>Personalize seu resultado</h3><p>Sua foto fica apenas neste navegador, para este Story. Seu comentário para o Filipe não aparece no card.</p>
 <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Selecionar minha foto" onChange={e=>{const photo=e.target.files?.[0];e.target.value='';void choose(photo);}}/>
 <div className="program-actions"><button type="button" className="secondary" disabled={preparing} onClick={()=>input.current?.click()}>{preparing?'Preparando foto…':student?'Trocar foto':'Adicionar minha foto'}</button>{student&&<button type="button" className="text-button" disabled={preparing} onClick={()=>{selection.current++;setFile(null);setStudent(null);}}>Remover foto</button>}</div>
 {student&&<fieldset className="story-framing"><legend>Ajustar enquadramento</legend><label>Posição horizontal<input type="range" min="0" max="1" step="0.01" value={student.x} onChange={e=>position('x',Number(e.target.value))}/></label><label>Posição vertical<input type="range" min="0" max="1" step="0.01" value={student.y} onChange={e=>position('y',Number(e.target.value))}/></label><small>Deslize para escolher a parte da foto que aparece no Story.</small></fieldset>}
 {!enabled&&<button type="button" className="primary" onClick={()=>setEnabled(true)}>Gerar card do treino</button>}
 {busy&&<p role="status">Atualizando prévia…</p>}{ready&&<><img className="share-preview" src={preview} alt="Prévia do card do treino concluído"/><div className="program-actions">{typeof navigator.canShare==='function'&&navigator.canShare({files:[file!]})&&<button type="button" className="primary" onClick={()=>void share()}>Compartilhar</button>}<a className="secondary" href={preview} download={file!.name}>Salvar imagem</a></div><p>Stories · 1080 × 1920. A imagem salva é exatamente esta prévia.</p></>}
 {photoNotice&&<p role="status">{photoNotice}</p>}{error&&<div><p role="alert">{error}</p>{enabled&&!busy&&<button type="button" className="secondary" onClick={()=>{brand.current=null;setRetry(v=>v+1);}}>Atualizar prévia</button>}</div>}
 </section>;
}
