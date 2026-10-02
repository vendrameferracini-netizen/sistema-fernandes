import { requireSupabase } from '../../lib/supabase';
export async function accessRequest(name: string, body: Record<string, unknown>) {
  const { data, error } = await requireSupabase().functions.invoke(name,{body});
  if (error) {
    if (error.context instanceof Response) {
      const details = await error.context.json().catch(()=>null);
      if (typeof details?.error === 'string') throw new Error(details.error);
    }
    throw new Error('Não foi possível acessar o serviço. Confira sua conexão ou fale com o responsável pelo sistema.');
  }
  return data;
}
export async function loginWithUsername(username: string,password: string) {
  const tokens=await accessRequest('username-login',{username:username.trim().toLowerCase(),password});
  const {error}=await requireSupabase().auth.setSession(tokens);
  if(error) throw new Error('Não foi possível iniciar a sessão. Entre novamente.');
}
export async function changePassword(currentPassword: string,password: string) {
  await accessRequest('change-password',{current_password:currentPassword,password});
  // All earlier app sessions have already been invalidated by the database.
  await requireSupabase().auth.signOut({scope:'local'});
}
