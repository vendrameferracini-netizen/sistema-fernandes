import { requireSupabase } from '../../lib/supabase';
import type { Exercise } from './api';
const bucket = 'exercise-images';
export const IMAGE_LIMIT = 5 * 1024 * 1024;
export async function validateImage(file: File): Promise<string> {
  const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const extension = extensions[file.type];
  if (!extension || !file.size || file.size > IMAGE_LIMIT) throw new Error('Escolha uma imagem JPEG, PNG ou WebP de até 5 MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const valid = extension === 'jpg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : extension === 'png' ? [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
    : new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP';
  if (!valid) throw new Error('O conteúdo do arquivo não corresponde ao formato da imagem.');
  return extension;
}
export async function downloadImage(path: string): Promise<Blob> {
  const { data, error } = await requireSupabase().storage.from(bucket).download(path);
  if (error || !data) throw new Error('Não foi possível carregar a imagem.');
  return data;
}
export async function removeUnusedImage(path: string) {
  const client = requireSupabase();
  const retained = await client.rpc('exercise_image_is_retained', { path });
  if (retained.error || typeof retained.data !== 'boolean') return false;
  if (retained.data) return true; // Preserve files referenced by immutable program versions.
  const { data, error } = await client.storage.from(bucket).remove([path]);
  return !error && Boolean(data?.some(item => item.name === path));
}
export async function replaceImage(file: File, exercise: Exercise) {
  const extension = await validateImage(file);
  const path = `${exercise.id}/${crypto.randomUUID()}.${extension}`;
  const client = requireSupabase();
  const { error: uploadError } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '60' });
  if (uploadError) throw new Error('Não foi possível enviar a imagem. O cadastro foi preservado.');
  const { data, error } = await client.rpc('set_exercise_image', {
    exercise_id: exercise.id, new_path: path, expected_path: exercise.image_path ?? null,
    expected_updated_at: exercise.updated_at,
  });
  if (error || typeof data !== 'string') {
    // Do not delete after an ambiguous response: the RPC may have committed.
    throw new Error('A imagem foi enviada, mas não foi possível confirmar o vínculo. Volte à lista e reabra o exercício antes de tentar novamente.');
  }
  let unusedPath: string | null = null;
  if (exercise.image_path) {
    try { if (!await removeUnusedImage(exercise.image_path)) unusedPath = exercise.image_path; }
    catch { unusedPath = exercise.image_path; }
  }
  return { path, updatedAt: data, unusedPath };
}
