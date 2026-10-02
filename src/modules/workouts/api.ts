import { requireSupabase } from '../../lib/supabase';
export type Workout = { id: string; name: string; instructions: string; version: number; updated_at: string };
export type WorkoutItem = { id: string; exercise_id: string; sets: number; repetitions: string; rest_seconds: number; coach_notes: string };
export type WorkoutDetail = Workout & { workout_items: (WorkoutItem & {position:number})[] };
export async function listWorkouts(): Promise<Workout[]> {
  const rows: Workout[] = [];
  for (let offset=0;;offset+=500) {
    const {data,error} = await requireSupabase().from('workouts').select('id,name,instructions,version,updated_at').order('name').order('id').range(offset,offset+499);
    if (error) throw new Error('Não foi possível carregar os treinos. Tente novamente.');
    rows.push(...data as Workout[]);
    if (data.length<500) return rows;
  }
}
export async function getWorkout(id: string): Promise<WorkoutDetail> {
  const {data,error} = await requireSupabase().from('workouts')
    .select('id,name,instructions,version,updated_at,workout_items(id,exercise_id,position,sets,repetitions,rest_seconds,coach_notes)').eq('id',id).single();
  if(error || !data) throw new Error('Não foi possível abrir o treino. Atualize a lista e tente novamente.');
  return {...data, workout_items:[...data.workout_items].sort((a,b)=>a.position-b.position)} as WorkoutDetail;
}
export function validateWorkout(name: string, instructions: string, items: WorkoutItem[]) {
  if(name.trim().length<2 || name.trim().length>160 || instructions.trim().length>5000) throw new Error('Informe um nome de 2 a 160 caracteres e orientações de até 5.000 caracteres.');
  if(items.length<1 || items.length>100) throw new Error('Adicione de 1 a 100 exercícios ao treino.');
  for(const item of items) {
    if(!Number.isInteger(item.sets) || item.sets<1 || item.sets>100 || !Number.isInteger(item.rest_seconds) || item.rest_seconds<0 || item.rest_seconds>3600 || !item.repetitions.trim() || item.repetitions.trim().length>80 || item.coach_notes.trim().length>2000) throw new Error('Confira as séries, repetições, descanso e orientações de cada exercício.');
  }
}
function saveError(code?: string) {
  return new Error(code==='40001' ? 'O treino mudou ou esta operação já foi salva. Volte à lista e reabra o cadastro antes de continuar.' : 'Não foi possível confirmar o salvamento. Seus campos foram mantidos. Confira a lista antes de repetir a operação.');
}
export async function saveWorkout(target: string, name: string, instructions: string, items: WorkoutItem[], version: number) {
  validateWorkout(name,instructions,items);
  const {error}=await requireSupabase().rpc('save_workout',{target,workout_name:name.trim(),general_instructions:instructions.trim(),items:items.map(({id,exercise_id,sets,repetitions,rest_seconds,coach_notes})=>({id,exercise_id,sets,repetitions:repetitions.trim(),rest_seconds,coach_notes:coach_notes.trim()})),expected_version:version});
  if(error) throw saveError(error.code);
}
export async function duplicateWorkout(source: Workout,target: string,name: string) {
  if(name.trim().length<2 || name.trim().length>160) throw new Error('Informe um nome de 2 a 160 caracteres para a cópia.');
  const {error}=await requireSupabase().rpc('duplicate_workout',{source_id:source.id,target,source_version:source.version,new_name:name.trim()});
  if(error) throw saveError(error.code);
}
