import { requireSupabase } from '../../lib/supabase';

export type ExerciseInput = { name: string; muscle_group: string; equipment: string; instructions: string; video_url?: string };
export type Exercise = ExerciseInput & { id: string; created_at: string; updated_at: string; image_path?: string | null };
export function validateVideoUrl(value: string): string {
  const text = value.trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (text.length > 2048 || /[\s\\]/.test(text) || url.protocol !== 'https:' || url.username || url.password || !/^https:\/\/[a-z0-9]/i.test(text)) throw new Error();
    return url.href;
  } catch { throw new Error('Informe um link HTTPS válido para o vídeo, sem usuário ou senha na URL.'); }
}
export function searchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
export async function listExercises(): Promise<Exercise[]> {
  // Read every page: the API's default row limit must not silently hide exercises.
  const all: Exercise[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await requireSupabase().from('exercises')
      .select('id,name,muscle_group,equipment,instructions,video_url,image_path,created_at,updated_at')
      .order('name').order('id').range(offset, offset + 499);
    if (error) throw new Error('Não foi possível carregar os exercícios. Tente novamente.');
    all.push(...(data ?? []) as Exercise[]);
    if (!data || data.length < 500) return all;
  }
}
export async function saveExercise(value: ExerciseInput, existing?: Exercise) {
  const fields = Object.fromEntries(Object.entries(value).map(([key, text]) => [key, text.trim()])) as ExerciseInput;
  if (fields.name.length < 2 || fields.name.length > 160 || fields.muscle_group.length < 2 || fields.muscle_group.length > 80 || fields.equipment.length > 120 || fields.instructions.length > 5000) {
    throw new Error('Confira o nome, o grupo muscular e os limites dos campos.');
  }
  const videoUrl = validateVideoUrl(value.video_url ?? '');
  const { error } = await requireSupabase().rpc('save_exercise_details', {
    exercise_id: existing?.id ?? null, exercise_name: fields.name,
    exercise_muscle_group: fields.muscle_group, exercise_equipment: fields.equipment,
    exercise_instructions: fields.instructions, expected_updated_at: existing?.updated_at ?? null,
    exercise_video_url: videoUrl,
  });
  if (error?.code === '40001') throw new Error('Este exercício foi atualizado em outra janela. Volte à lista e reabra o cadastro antes de salvar.');
  if (error) throw new Error('Não foi possível salvar o exercício. Confira sua conexão e tente novamente.');
}
