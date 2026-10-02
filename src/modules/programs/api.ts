import { requireSupabase } from '../../lib/supabase';
export type Program = {id:string;student_id:string;name:string;start_date:string;status:'draft'|'active'|'ended';version:number;updated_at:string};
export type Entry = {id:string;label:string;workout_id:string;workout_version:number};
export type ProgramItem = {id:string;exercise_id:string;sets:number;repetitions:string;rest_seconds:number;coach_notes:string;exercise:{name:string;instructions:string;image_path:string|null;video_url:string}};
export type SnapshotEntry = Entry & {position:number;workout:{name:string;instructions:string;items:ProgramItem[]}};
export type ProgramSnapshot = {name:string;start_date:string;status:Program['status'];entries:SnapshotEntry[]};
export type ProgramRevision = {version:number;created_at:string;snapshot:ProgramSnapshot};
export const statusLabel = {draft:'Rascunho',active:'Ativa',ended:'Encerrada'};
export const displayDate=(value:string)=>value.split('-').reverse().join('/');
export async function listPrograms(student?:string,activeOnly=false):Promise<Program[]> {
  const result:Program[]=[];
  for(let offset=0;;offset+=500){
    let query=requireSupabase().from('student_programs').select('id,student_id,name,start_date,status,version,updated_at').order('created_at',{ascending:false}).order('id').range(offset,offset+499);
    if(student)query=query.eq('student_id',student);
    if(activeOnly)query=query.eq('status','active');
    const {data,error}=await query;
    if(error)throw new Error('Não foi possível carregar as programações.');
    result.push(...data as Program[]);if(data.length<500)return result;
  }
}
export async function getProgramRevision(id:string,version:number):Promise<ProgramRevision>{
  const {data,error}=await requireSupabase().from('program_revisions').select('version,created_at,snapshot').eq('program_id',id).eq('version',version).single();
  if(error||!data)throw new Error('Não foi possível abrir esta versão. Atualize a programação e tente novamente.');
  return data as ProgramRevision;
}
export async function listProgramRevisions(id:string):Promise<ProgramRevision[]>{
  const rows:ProgramRevision[]=[];
  for(let offset=0;;offset+=100){
    const {data,error}=await requireSupabase().from('program_revisions').select('version,created_at,snapshot').eq('program_id',id).order('version',{ascending:false}).range(offset,offset+99);
    if(error)throw new Error('Não foi possível carregar as versões anteriores.');
    rows.push(...data as ProgramRevision[]);if(data.length<100)return rows;
  }
}
function operationError(code?:string){return new Error(code==='40001'?'A programação mudou. Atualize a lista e confira os dados antes de continuar.':code==='P0002'?'Uma imagem desta versão de treino não está mais disponível. Abra o treino original, salve uma nova versão e selecione essa versão na programação.':'Não foi possível confirmar a operação. Confira os dados e atualize a lista antes de tentar novamente.');}
export async function saveProgram(target:string,student:string,name:string,start:string,entries:Entry[],version:number){
  if(name.trim().length<2||name.trim().length>160||!/^\d{4}-\d{2}-\d{2}$/.test(start)||entries.length<1||entries.length>26||entries.some(e=>!e.label.trim()||e.label.length>80))throw new Error('Confira nome, data de início e os treinos selecionados (1 a 26).');
  const {error}=await requireSupabase().rpc('save_student_program',{target,student,program_name:name.trim(),begins_on:start,entries:entries.map(({id,label,workout_id,workout_version})=>({id,label:label.trim(),workout_id,workout_version})),expected_version:version});
  if(error)throw operationError(error.code);
}
export async function transitionProgram(program:Program,transition:'activate'|'end',active?:Program){
  const {error}=await requireSupabase().rpc('transition_student_program',{target:program.id,expected_version:program.version,transition,replaces:active?.id??null,replaces_version:active?.version??null});
  if(error)throw operationError(error.code);
}
