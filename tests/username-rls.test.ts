import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
const db=new PGlite();
const coach='00000000-0000-4000-8000-000000000001';
const alice='00000000-0000-4000-8000-000000000002';
const bob='00000000-0000-4000-8000-000000000003';
let counter=10;
const uuid=()=>`00000000-0000-4000-8000-${String(counter++).padStart(12,'0')}`;
let coachSession:string; let aliceSession:string;
async function login(user:string) {
  const session=uuid();
  await db.exec(`insert into auth.sessions values('${session}','${user}');
    select public.register_app_session('${user}','${session}',(select credential_version from private.login_identities where user_id='${user}'));`);
  return session;
}
async function asUser(user:string,session:string,sql:string) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${user}'; set request.jwt.claim.session_id='${session}';`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
async function completeChange(user:string,session:string) {
  const operation=uuid();
  const result=await db.query<{v:number}>(`select public.begin_password_operation('${user}','${session}','${user}','change','${operation}',(select credential_version from private.login_identities where user_id='${user}')) as v`);
  await db.exec(`update auth.users set encrypted_password='synthetic-hash-${operation}' where id='${user}';
    select public.finish_password_operation('${user}','${operation}',${Number(result.rows[0].v)+1});`);
}
beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,encrypted_password text);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;
    grant usage on schema auth to authenticated,service_role;
    grant execute on function auth.uid(),auth.jwt() to authenticated,service_role;
    insert into auth.users values('${coach}','coach@example.test','initial'),('${alice}','alice@example.test','initial'),('${bob}','bob@example.test','initial');`);
  for(const file of ['202609230001_identity.sql','202609230002_students.sql']) await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.exec(`insert into public.profiles(id,full_name,role) values('${coach}','Filipe Fernandes','admin');
    select public.provision_student('${coach}','${alice}','alice@example.test','Alice teste','','2000-01-01','Objetivo A',current_date,'Privado A');
    select public.provision_student('${coach}','${bob}','bob@example.test','Bob teste','','2001-01-01','Objetivo B',current_date,'Privado B');`);
  await db.exec(readFileSync(new URL('../supabase/migrations/202609230003_username_access.sql',import.meta.url),'utf8'));
  coachSession=await login(coach); aliceSession=await login(alice);
},30000);
afterAll(()=>db.close());
describe.sequential('incremental username access security',()=>{
  it('keeps the two applied migrations byte-for-byte intact',()=>{
    const expected=['dee2bb60bcc6f9c8f6cb440b133ce7e50db2f3db255c7b129b6ec9610f4e6e99','8cb12dac1de3a0c3747353bde4ac22a64babc00f8b34b7f08f7fcadae717a534'];
    ['202609230001_identity.sql','202609230002_students.sql'].forEach((file,i)=>expect(createHash('sha256').update(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url))).digest('hex')).toBe(expected[i]));
  });
  it('preserves existing identities, student records and private notes',async()=>{
    expect((await db.query('select id from public.students')).rows).toHaveLength(2);
    expect((await db.query(`select username from public.profiles where id='${coach}'`)).rows).toEqual([{username:'filipe'}]);
    expect((await db.query('select * from public.student_admin_notes')).rows).toHaveLength(2);
  });
  it('requires unique canonical usernames and still forbids a second administrator',async()=>{
    await expect(db.exec(`update public.profiles set username='filipe' where id='${alice}'`)).rejects.toThrow();
    await expect(db.exec(`update public.profiles set username='FiLiPe' where id='${alice}'`)).rejects.toThrow();
    await expect(db.exec(`update public.profiles set role='admin' where id='${alice}'`)).rejects.toThrow();
  });
  it('blocks both admin and student data before initial password change',async()=>{
    expect((await asUser(alice,aliceSession,'select * from public.students')).rows).toEqual([]);
    expect((await asUser(coach,coachSession,'select * from public.students')).rows).toEqual([]);
    expect((await asUser(alice,aliceSession,'select must_change_password from public.my_access_profile()')).rows).toEqual([{must_change_password:true}]);
  });
  it('prevents clients reading login maps or clearing forced-change flags',async()=>{
    await expect(asUser(alice,aliceSession,'select * from private.login_identities')).rejects.toThrow();
    await expect(asUser(alice,aliceSession,`update public.profiles set must_change_password=false where id='${alice}'`)).rejects.toThrow();
    await expect(asUser(alice,aliceSession,`select public.lookup_login('filipe')`)).rejects.toThrow();
    await expect(asUser(alice,aliceSession,`select public.finish_password_operation('${alice}','${uuid()}',1)`)).rejects.toThrow();
  });
  it('does not permit releasing a temporary account without an actual Auth password change',async()=>{
    const op=uuid();
    const {rows}=await db.query<{v:number}>(`select public.begin_password_operation('${alice}','${aliceSession}','${alice}','change','${op}',1) as v`);
    await expect(db.exec(`select public.finish_password_operation('${alice}','${op}',${Number(rows[0].v)+1})`)).rejects.toThrow();
    await db.exec(`update auth.users set encrypted_password='new-synthetic-hash' where id='${alice}'; select public.finish_password_operation('${alice}','${op}',${Number(rows[0].v)+1});`);
    expect((await asUser(alice,aliceSession,'select * from public.students')).rows).toEqual([]);
    aliceSession=await login(alice);
    expect((await asUser(alice,aliceSession,'select id from public.students')).rows).toEqual([{id:alice}]);
  });
  it('allows coach access only after changing password and signing in again',async()=>{
    await completeChange(coach,coachSession);
    expect((await asUser(coach,coachSession,'select * from public.students')).rows).toEqual([]);
    coachSession=await login(coach);
    expect((await asUser(coach,coachSession,'select * from public.students')).rows).toHaveLength(2);
  });
  it('keeps cross-student data, notes and audit private after login',async()=>{
    expect((await asUser(alice,aliceSession,`select * from public.students where id='${bob}'`)).rows).toEqual([]);
    expect((await asUser(alice,aliceSession,'select * from public.student_admin_notes')).rows).toEqual([]);
    expect((await asUser(alice,aliceSession,'select * from public.admin_audit')).rows).toEqual([]);
  });
  it('rejects fabricated sessions even for the correct user',async()=>{
    const fake=uuid();
    expect((await db.query(`select public.register_app_session('${alice}','${fake}',3) as ok`)).rows).toEqual([{ok:false}]);
    expect((await asUser(alice,fake,'select * from public.students')).rows).toEqual([]);
  });
  it('rejects students resetting others and the coach resetting another administrator',async()=>{
    await expect(db.exec(`select public.begin_password_operation('${alice}','${aliceSession}','${bob}','reset','${uuid()}',1)`)).rejects.toThrow();
    await expect(db.exec(`select public.begin_password_operation('${coach}','${coachSession}','${coach}','reset','${uuid()}',3)`)).rejects.toThrow();
  });
  it('reset blocks old tokens immediately, rejects concurrent changes and forces another change',async()=>{
    const op=uuid();
    const {rows}=await db.query<{v:number}>(`select public.begin_password_operation('${coach}','${coachSession}','${alice}','reset','${op}',3) as v`);
    expect((await asUser(alice,aliceSession,'select * from public.students')).rows).toEqual([]);
    await expect(db.exec(`select public.begin_password_operation('${alice}','${aliceSession}','${alice}','change','${uuid()}',3)`)).rejects.toThrow();
    await db.exec(`update auth.users set encrypted_password='reset-synthetic-hash' where id='${alice}'; select public.finish_password_operation('${alice}','${op}',${Number(rows[0].v)+1});`);
    aliceSession=await login(alice);
    expect((await asUser(alice,aliceSession,'select * from public.students')).rows).toEqual([]);
    await completeChange(alice,aliceSession); aliceSession=await login(alice);
    expect((await asUser(alice,aliceSession,'select id from public.students')).rows).toEqual([{id:alice}]);
  });
  it('direct Auth password changes cannot bypass forced-change enforcement',async()=>{
    await db.exec(`update auth.users set encrypted_password='direct-api-change' where id='${alice}'`);
    expect((await asUser(alice,aliceSession,'select * from public.students')).rows).toEqual([]);
    aliceSession=await login(alice);
    expect((await asUser(alice,aliceSession,'select * from public.students')).rows).toEqual([]);
  });
  it('protects technical identity from direct email changes',async()=>{
    await expect(db.exec(`update auth.users set email='attacker@example.test' where id='${alice}'`)).rejects.toThrow();
  });
  it('rate limit counters persist across requests and enforce the maximum',async()=>{
    for(let i=0;i<3;i++) expect((await db.query(`select public.consume_auth_limit('test',3,60) as allowed`)).rows).toEqual([{allowed:true}]);
    expect((await db.query(`select public.consume_auth_limit('test',3,60) as allowed`)).rows).toEqual([{allowed:false}]);
    await expect(asUser(alice,aliceSession,`select public.consume_auth_limit('test',10000,60)`)).rejects.toThrow();
  });
  it('disables the legacy provision RPC and blocks anonymous access',async()=>{
    await db.exec('set role service_role');
    try { await expect(db.query(`select public.provision_student('${coach}','${alice}','x@example.test','Aluno','','2000-01-01','',current_date,'')`)).rejects.toThrow(); }
    finally { await db.exec('reset role'); }
    await db.exec('set role anon');
    try { await expect(db.query('select * from public.students')).rejects.toThrow(); }
    finally { await db.exec('reset role'); }
  });
});
