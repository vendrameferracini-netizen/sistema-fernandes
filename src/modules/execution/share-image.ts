import type { Execution } from './api';
import { dateLabel, difficultyLabels, durationLabel, localDay } from './activity';
// Only these public presentation fields are passed to the renderer. No identity or feedback.
export function shareCardData(session:Execution){
 if(session.status!=='completed')throw new Error('O card está disponível para treinos concluídos.');
 return {brand:'SISTEMA FERNANDES',name:session.snapshot.entry.workout.name,date:dateLabel(session.performed_on??localDay(new Date(session.started_at))),duration:durationLabel(session.duration_seconds??session.summary?.elapsed_seconds??0),status:'TREINO CONCLUÍDO',difficulty:session.difficulty?difficultyLabels[session.difficulty]:'',phrase:'Um treino de cada vez. Uma evolução constante.'};
}

export type StoryPhoto={blob:Blob;x:number;y:number};
export async function prepareStudentPhoto(file:File):Promise<Blob>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>15*1024*1024)throw new Error('Escolha JPEG, PNG ou WebP de até 15 MB.');
 let image:ImageBitmap;try{image=await createImageBitmap(file);}catch{throw new Error('Não foi possível abrir esta foto. Tente outra imagem JPEG, PNG ou WebP.');}
 try{if(image.width*image.height>48000000)throw new Error('Esta foto é muito grande. Escolha uma versão menor.');const scale=Math.min(1,1800/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Não foi possível preparar a foto.');ctx.drawImage(image,0,0,canvas.width,canvas.height);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Não foi possível preparar a foto.')),'image/jpeg',.9));}finally{image.close();}
}
export async function renderShareCard(session:Execution,institutional?:Blob,student?:StoryPhoto):Promise<Blob>{
 const data=shareCardData(session);const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Seu navegador não conseguiu gerar o card.');
 ctx.fillStyle='#101418';ctx.fillRect(0,0,1080,1920);
 const glow=ctx.createLinearGradient(0,0,1080,1150);glow.addColorStop(0,'#57301e');glow.addColorStop(.65,'#20252a');glow.addColorStop(1,'#101418');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,1160);
 if(student){const image=await createImageBitmap(student.blob);try{const scale=Math.max(1080/image.width,1160/image.height);ctx.save();ctx.beginPath();ctx.rect(0,0,1080,1160);ctx.clip();ctx.drawImage(image,(1080-image.width*scale)*Math.max(0,Math.min(1,student.x)),(1160-image.height*scale)*Math.max(0,Math.min(1,student.y)),image.width*scale,image.height*scale);ctx.restore();}finally{image.close();}}
 else{ctx.save();ctx.strokeStyle='#ff7a2f20';ctx.lineWidth=90;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(680+i*180,180);ctx.lineTo(210+i*180,1000);ctx.stroke();}ctx.restore();ctx.fillStyle='#ffffff08';ctx.font='900 430px sans-serif';ctx.fillText('F.',70,730);}
 const overlay=ctx.createLinearGradient(0,0,0,1180);overlay.addColorStop(0,'#080b10d9');overlay.addColorStop(.32,'#080b1040');overlay.addColorStop(.55,'#10141880');overlay.addColorStop(.73,'#101418e8');overlay.addColorStop(1,'#101418');ctx.fillStyle=overlay;ctx.fillRect(0,0,1080,1180);
 ctx.fillStyle='#ff7a2f';ctx.fillRect(72,105,8,50);ctx.font='800 30px sans-serif';ctx.fillText(data.brand,104,142);
 ctx.fillStyle='#163c2b';ctx.beginPath();ctx.roundRect(72,746,400,62,31);ctx.fill();ctx.fillStyle='#9ff3c0';ctx.font='bold 24px sans-serif';ctx.fillText('✓  '+data.status,98,786);
 ctx.fillStyle='#fff';ctx.font='800 68px sans-serif';const lines:string[]=[];let line='';for(const char of Array.from(data.name)){if(ctx.measureText(line+char).width>920){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);if(lines.length>3){lines.length=3;lines[2]=lines[2].slice(0,-2)+'…';}lines.forEach((text,i)=>ctx.fillText(text,72,892+i*78));
 const block=(x:number,y:number,w:number,label:string,value:string)=>{ctx.fillStyle='#20262c';ctx.beginPath();ctx.roundRect(x,y,w,174,20);ctx.fill();ctx.fillStyle='#ff9d64';ctx.font='bold 21px sans-serif';ctx.fillText(label,x+26,y+48);ctx.fillStyle='#fff';ctx.font='bold 42px sans-serif';ctx.fillText(value,x+26,y+116,w-52);}
 const seconds=Math.max(0,Math.floor(session.duration_seconds??session.summary?.elapsed_seconds??0));const duration=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
 block(72,1170,450,'DURAÇÃO',duration);block(546,1170,462,'DATA',data.date);block(72,1366,936,'DIFICULDADE',data.difficulty||'Não informada');
 ctx.fillStyle='#d8dfe5';ctx.font='26px sans-serif';ctx.fillText('Um treino de cada vez.',72,1650);ctx.fillText('Uma evolução constante.',72,1690);
 ctx.fillStyle='#ff7a2f';ctx.fillRect(72,1760,48,4);ctx.fillStyle='#8e9aa5';ctx.font='18px sans-serif';ctx.fillText('SISTEMA FERNANDES',72,1810);
 const cx=938,cy=1755,r=60;
 if(institutional){let image:ImageBitmap|undefined;try{image=await createImageBitmap(institutional);const scale=Math.max(r*2/image.width,r*2/image.height);ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();ctx.drawImage(image,cx-image.width*scale/2,cy-image.height*scale/2,image.width*scale,image.height*scale);ctx.restore();}catch{/* Institutional signature remains readable without its optional image. */}finally{image?.close();}}
 ctx.textAlign='right';ctx.fillStyle='#f0f3f5';ctx.font='bold 24px sans-serif';ctx.fillText('Filipe Fernandes',institutional?850:1008,1750);ctx.fillStyle='#aab6bf';ctx.font='20px sans-serif';ctx.fillText('Coach',institutional?850:1008,1785);ctx.textAlign='left';
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível gerar o PNG.')),'image/png'));
}
