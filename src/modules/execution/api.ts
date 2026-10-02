import { requireSupabase } from '../../lib/supabase';
import type { SnapshotEntry, ProgramItem } from '../programs/api';
export type SetStatus = 'pending' | 'completed' | 'failed' | 'not_performed';
export type SetLog = {id:string;item_id:string;set_number:number;prescribed_repetitions:string;status:SetStatus;actual_repetitions:number|null;load_kg:number|null;load_unit:'kg';version:number;recorded_at:string|null};
export type ExecutionItem = {id:string;exercise_id:string;position:number;snapshot:ProgramItem;sets:SetLog[]};
export type Execution = {id:string;student_id:string;program_id:string;program_version:number;workout_version:number;status:'in_progress'|'completed'|'abandoned'|'not_completed';difficulty?:'easy'|'balanced'|'hard'|null;feedback?:string|null;duration_seconds?:number|null;performed_on?:string;version:number;started_at:string;ended_at:string|null;snapshot:{program_name:string;program_start_date:string;entry:SnapshotEntry};items:ExecutionItem[];summary:{total_sets:number;completed_sets:number;failed_sets:number;not_performed_sets:number;elapsed_seconds:number}|null};
function failure(code?:string){return new Error(code==='40001'?'O registro mudou em outra aba. Atualize os dados antes de salvar novamente.':code==='55000'?'A execução foi encerrada ou já existe um treino em andamento. Atualize para retomar.':code==='42501'?'Seu acesso não pôde ser validado. Entre novamente.':code==='22023'?'Confira os dados e a data de início da programação.':'Não foi possível confirmar. Tente novamente: a mesma solicitação não duplica o registro.');}
export async function latestExecution(student:string):Promise<{id:string;status:Execution['status']}|null>{
 const client=requireSupabase();
 const [active,recent]=await Promise.all([
  client.from('workout_sessions').select('id,status').eq('student_id',student).eq('status','in_progress').maybeSingle(),
  client.from('workout_sessions').select('id,status').eq('student_id',student).order('started_at',{ascending:false}).order('id').limit(1).maybeSingle(),
 ]);
 if(active.error||recent.error)throw failure(active.error?.code??recent.error?.code);return active.data??recent.data;
}
export async function getExecution(id:string):Promise<Execution>{
 const {data,error}=await requireSupabase().rpc('get_execution',{target:id});
 if(error||!data)throw failure(error?.code);return data as Execution;
}
export async function startExecution(key:string,program:string,version:number,entry:string){
 const {data,error}=await requireSupabase().rpc('start_execution',{request_id:key,program,expected_version:version,entry});
 if(error||typeof data!=='string')throw failure(error?.code);return data;
}
export type Difficulty = 'easy'|'balanced'|'hard';
export async function finishExecution(key:string,session:Execution,outcome:'completed'|'not_completed',difficulty:Difficulty,comment:string){
 const {error}=await requireSupabase().rpc('finish_execution_feedback',{request_id:key,target:session.id,expected_version:session.version,outcome,perceived_difficulty:difficulty,comment});
 if(error)throw failure(error.code);return getExecution(session.id);
}
