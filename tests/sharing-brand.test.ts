import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
const db = new PGlite();
const coach = '00000000-0000-4000-8000-000000000001';
const student = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';
async function asUser(id: string, sql: string) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'; set request.jwt.claim.session_id='${id===student?'00000000-0000-4000-8000-000000000004':session}';`);
  try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated,anon;
    grant select,insert,update,delete on storage.objects to authenticated,anon;
    create schema auth;
    create table auth.users(id uuid primary key,email text,encrypted_password text);
    create table auth.sessions(id uuid primary key,user_id uuid);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;
    grant usage on schema auth to authenticated;
    insert into auth.users values('${coach}','coach@test.invalid','hash'),('${student}','student@test.invalid','hash');`);
  for (const file of ['202609230001_identity.sql','202609230002_students.sql','202609230003_username_access.sql','202609240004_exercises.sql','202609240005_exercise_images_video.sql','202609240006_workout_editor.sql','202609240007_student_programs.sql','202609250008_workout_execution.sql']) {
    await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
  }
  await db.exec(`insert into public.profiles(id,full_name,username,role,must_change_password) values
    ('${coach}','Coach','filipe','admin',false),('${student}','Student','student','student',false);
    insert into private.login_identities(user_id,auth_email) values('${coach}','coach@test.invalid');
    insert into auth.sessions values('${session}','${coach}');
    select public.register_app_session('${coach}','${session}',1);`);
}, 30000);
beforeAll(async()=>{
 await db.exec(`insert into public.students(id) values('${student}');
 insert into private.login_identities(user_id,auth_email) values('${student}','student@test.invalid');
 insert into auth.sessions values('00000000-0000-4000-8000-000000000004','${student}');
 select public.register_app_session('${student}','00000000-0000-4000-8000-000000000004',1);`);
});
afterAll(() => db.close());

beforeAll(async()=>{await db.exec(readFileSync(new URL('../supabase/migrations/202610010011_sharing_brand.sql',import.meta.url),'utf8'));});
it('protects branding writes, exposes only the current image to students and audits atomically',async()=>{
 const a='institutional/00000000-0000-4000-8000-000000000010.png',b='institutional/00000000-0000-4000-8000-000000000011.png';
 await asUser(coach,`insert into storage.objects(bucket_id,name,metadata) values('institutional-images','${a}','{"mimetype":"image/png","size":1200}'),('institutional-images','${b}','{"mimetype":"image/png","size":1200}')`);
 await expect(asUser(student,`select public.set_sharing_brand('${a}',0)`)).rejects.toThrow();
 await asUser(coach,`select public.set_sharing_brand('${a}',0)`);
 expect((await asUser(student,`select name from storage.objects where bucket_id='institutional-images'`)).rows).toEqual([{name:a}]);
 await expect(asUser(coach,`select public.set_sharing_brand('${b}',0)`)).rejects.toThrow();
 await asUser(coach,`select public.set_sharing_brand('${b}',1)`);
 expect((await asUser(student,`select name from storage.objects where bucket_id='institutional-images'`)).rows).toEqual([{name:b}]);
 expect((await asUser(coach,'select * from public.sharing_brand_audit')).rows).toHaveLength(2);
 expect((await asUser(student,'select * from public.sharing_brand_audit')).rows).toHaveLength(0);
 await db.exec(`update public.profiles set active=false where id='${student}'`);
 expect((await asUser(student,`select name from storage.objects where bucket_id='institutional-images'`)).rows).toHaveLength(0);
});
