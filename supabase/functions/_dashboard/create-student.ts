// Dashboard deployment: create-student. Generated from the shared sources.
export function normalizeUsername(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_INPUT');
  const username = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,39}$/.test(username)) throw new Error('INVALID_INPUT');
  return username;
}
export function validateSecret(value: unknown, initial = true): string {
  if (typeof value !== 'string' || value.length < (initial ? 12 : 1) || value.length > 128) throw new Error('INVALID_INPUT');
  return value; // Never trim or normalize a password.
}
export function verifiedSessionId(token: string): string {
  // Call only AFTER getUser(token) or successful Auth signInWithPassword.
  const segment = token.split('.')[1];
  if (!segment) throw new Error('UNAUTHORIZED');
  const payload = JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')));
  if (!/^[0-9a-f-]{36}$/i.test(payload.session_id ?? '')) throw new Error('UNAUTHORIZED');
  return payload.session_id;
}

import { createClient } from 'npm:@supabase/supabase-js@2.117.0';


type Environment = (name: string) => string | undefined;
type Action = 'login' | 'create' | 'reset' | 'change';
class Failure extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const denied = () => new Failure(401, 'INVALID_CREDENTIALS', 'Usuário ou senha incorretos.');
const unavailable = () => new Failure(503, 'UNAVAILABLE', 'Não foi possível concluir. Tente novamente mais tarde.');
const pending = () => new Failure(409, 'OPERATION_PENDING', 'A alteração precisa ser conferida pelo responsável pelo Supabase. Não repita a operação.');

async function readInput(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader();
  if (!reader) throw new Failure(400, 'INVALID_INPUT', 'Confira os campos informados.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    size += part.value.length;
    if (size > 16384) { await reader.cancel(); throw new Failure(413, 'TOO_LARGE', 'Dados muito extensos.'); }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  try {
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    return input;
  } catch { throw new Failure(400, 'INVALID_INPUT', 'Confira os campos informados.'); }
}
function field(input: Record<string,unknown>, key: string, max: number, min = 0): string {
  const value = input[key] ?? '';
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new Error('INVALID_INPUT');
  return value.trim();
}
function date(value: unknown, optional = false): string | null {
  if (optional && !value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('INVALID_INPUT');
  return value;
}

export function makeAccessHandler(action: Action, env: Environment) {
  return async (request: Request): Promise<Response> => {
    const origins = (env('APP_ORIGINS') ?? env('APP_URL') ?? '').split(',').map(x => x.trim()).filter(Boolean);
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
      'Access-Control-Allow-Origin': origins.includes(origin ?? '') ? origin! : origins[0] ?? '',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers });
    try {
      if (!origins.length) throw unavailable();
      if (origin && !origins.includes(origin)) throw new Failure(403, 'ORIGIN', 'Origem não permitida.');
      if (request.method === 'OPTIONS') return new Response(null,{ status:204, headers });
      if (request.method !== 'POST') throw new Failure(405, 'METHOD', 'Método não permitido.');
      const url = env('SUPABASE_URL'); const secret = env('SUPABASE_SERVICE_ROLE_KEY');
      const publicKey = env('SUPABASE_ANON_KEY') ?? env('APP_PUBLISHABLE_KEY');
      if (!url || !secret || !publicKey) throw unavailable();
      const options = { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } };
      const server = createClient(url,secret,options);
      const auth = createClient(url,publicKey,options); // Isolated client: sign-in never replaces service credentials.
      async function rpc(name: string, args: Record<string, unknown>) {
        const { data, error } = await server.rpc(name,args);
        if (error) throw unavailable();
        return data;
      }
      async function limit(key: string, maximum = 10, seconds = 900) {
        const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
        const bucket = Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
        if (!await rpc('consume_auth_limit',{bucket_key:bucket,maximum,seconds}))
          throw new Failure(429,'RATE_LIMIT','Muitas tentativas. Aguarde alguns minutos.');
      }
      await limit('global:' + action, 300, 60);
      const input = await readInput(request);

      if (action === 'login') {
        let username: string; let password: string;
        try { username=normalizeUsername(input.username); password=validateSecret(input.password,false); }
        catch { throw denied(); }
        await limit('login:' + username);
        const identity = await rpc('lookup_login',{login_name:username});
        // Unknown, inactive and pending users follow the same password-validation path.
        const { data, error } = await auth.auth.signInWithPassword({
          email:identity?.email ?? 'unavailable@sistema-fernandes.invalid',password,
        });
        if (error || !identity || !data.session || data.user?.id !== identity.id) {
          if (data.session) await auth.auth.signOut({scope:'local'});
          throw denied();
        }
        const sessionId = verifiedSessionId(data.session.access_token);
        const registered = await rpc('register_app_session',{subject:identity.id,session:sessionId,expected_version:identity.version});
        if (!registered) { await auth.auth.signOut({scope:'local'}); throw denied(); }
        return json(200,{access_token:data.session.access_token,refresh_token:data.session.refresh_token});
      }

      const token = request.headers.get('Authorization')?.replace(/^Bearer /,'');
      if (!token) throw denied();
      const verified = await server.auth.getUser(token);
      if (verified.error || !verified.data.user) throw denied();
      const actorId=verified.data.user.id; const actorSession=verifiedSessionId(token);
      const actor = await rpc('access_context',{subject:actorId,session:actorSession});
      if (!actor) throw new Failure(401,'SESSION_INVALID','Entre novamente para continuar.');
      if (action !== 'change' && (actor.role !== 'admin' || actor.must_change_password))
        throw new Failure(403,'FORBIDDEN','Acesso permitido apenas ao administrador.');
      await limit(action + ':' + actorId, action === 'create' ? 30 : 10);

      if (action === 'create') {
        const username=normalizeUsername(input.username); const password=validateSecret(input.password);
        const name=field(input,'full_name',160,2); const phone=field(input,'phone',32);
        const objective=field(input,'objective',1000); const notes=field(input,'notes',5000);
        const birth=date(input.birth_date,true); const start=date(input.start_date);
        if (birth && (birth<'1900-01-01' || birth>new Date().toISOString().slice(0,10))) throw new Error('INVALID_INPUT');
        const { data: duplicate, error: lookupError } = await server.from('profiles').select('id').eq('username',username).maybeSingle();
        if (lookupError) throw unavailable();
        if (duplicate) throw new Failure(409,'USERNAME_TAKEN','Este usuário já está em uso.');
        const technicalEmail=crypto.randomUUID() + '@sistema-fernandes.invalid';
        const { data, error } = await server.auth.admin.createUser({email:technicalEmail,password,email_confirm:true});
        if (error || !data.user) throw new Failure(422,'CREATE_FAILED','Não foi possível criar o acesso. Confira a senha e tente novamente.');
        const { error: provisionError } = await server.rpc('provision_username_student',{
          actor:actorId,actor_session:actorSession,student:data.user.id,login_name:username,technical_email:technicalEmail,
          student_name:name,student_phone:phone,student_birth:birth,student_objective:objective,student_start:start,student_notes:notes,
        });
        if (provisionError) throw new Failure(409,'PROVISIONING_PENDING','O acesso foi criado, mas o cadastro precisa ser concluído pelo responsável pelo Supabase. Não repita o cadastro.');
        return json(201,{id:data.user.id});
      }

      const newPassword=validateSecret(input.password);
      let targetId=actorId; let version=actor.version;
      if (action === 'reset') {
        const identity=await rpc('lookup_login',{login_name:normalizeUsername(input.username)});
        if (!identity || identity.id !== input.student_id) throw new Failure(409,'TARGET_INVALID','Confira se o aluno está ativo e se o cadastro está correto.');
        targetId=identity.id; version=identity.version;
      } else {
        const currentPassword=validateSecret(input.current_password,false);
        if (currentPassword === newPassword) throw new Failure(400,'SAME_PASSWORD','Escolha uma senha diferente da senha atual.');
        const checked=await auth.auth.signInWithPassword({email:actor.email,password:currentPassword});
        if (checked.error || checked.data.user?.id !== actorId) throw denied();
        await auth.auth.signOut({scope:'local'});
      }
      const operation=crypto.randomUUID();
      const startVersion=await rpc('begin_password_operation',{
        actor:actorId,actor_session:actorSession,target:targetId,kind:action,operation,expected_version:version,
      });
      // No password or token is written to logs, tables or audit payloads.
      try {
        const changed=await server.auth.admin.updateUserById(targetId,{password:newPassword});
        if (changed.error) throw pending();
        // Auth trigger must observe exactly one password change since begin.
        await rpc('finish_password_operation',{target:targetId,operation,expected_version:Number(startVersion)+1});
      } catch { throw pending(); }
      return json(200,{success:true,sign_in_required:true});
    } catch (error) {
      if (error instanceof Failure) return json(error.status,{code:error.code,error:error.message});
      if (error instanceof Error && error.message==='INVALID_INPUT') return json(400,{code:'INVALID_INPUT',error:'Confira os campos. Use usuário de 3 a 40 caracteres e senha de 12 a 128 caracteres.'});
      return json(503,{code:'UNAVAILABLE',error:'Não foi possível concluir. Verifique o resultado antes de tentar novamente.'});
    }
  };
}


Deno.serve(makeAccessHandler('create',name=>Deno.env.get(name)));
