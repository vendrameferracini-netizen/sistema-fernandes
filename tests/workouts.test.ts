import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, it, expect } from 'vitest';
const db = new PGlite();
const coach = '00000000-0000-4000-8000-000000000001';
const student = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';
async function asUser(id: string, sql: string) {
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${id}'; set request.jwt.claim.session_id='${session}';`);
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
  for (const file of ['202609230001_identity.sql','202609230002_students.sql','202609230003_username_access.sql','202609240004_exercises.sql','202609240005_exercise_images_video.sql','202609240006_workout_editor.sql']) {
    await db.exec(readFileSync(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
  }
  await db.exec(`insert into public.profiles(id,full_name,username,role,must_change_password) values
    ('${coach}','Coach','filipe','admin',false),('${student}','Student','student','student',false);
    insert into private.login_identities(user_id,auth_email) values('${coach}','coach@test.invalid');
    insert into auth.sessions values('${session}','${coach}');
    select public.register_app_session('${coach}','${session}',1);`);
}, 30000);
afterAll(() => db.close());
it('saves ordered prescriptions, protects revisions, duplicates independently and enforces authorization', async () => {
  const first='00000000-0000-4000-8000-000000000011';
  const second='00000000-0000-4000-8000-000000000012';
  const target='00000000-0000-4000-8000-000000000020';
  const copy='00000000-0000-4000-8000-000000000021';
  const one='00000000-0000-4000-8000-000000000031';
  const two='00000000-0000-4000-8000-000000000032';
  await db.exec(`insert into public.exercises(id,name,muscle_group) values('${first}','Supino','Peitoral'),('${second}','Remada','Costas');`);
  const items=[{id:one,exercise_id:first,sets:3,repetitions:'10–12',rest_seconds:60,coach_notes:'Controle'}, {id:two,exercise_id:second,sets:4,repetitions:'8',rest_seconds:90,coach_notes:''}];
  const call=(version:number,rows=items,id=target)=>`select public.save_workout('${id}','Treino A','Orientações','${JSON.stringify(rows)}'::jsonb,${version})`;
  await expect(asUser(student,call(0))).rejects.toThrow();
  await db.exec('set role anon');await expect(db.query(call(0))).rejects.toThrow();await db.exec('reset role');
  await asUser(coach,call(0));
  expect((await asUser(coach,'select name,version from public.workouts')).rows).toEqual([{name:'Treino A',version:1}]);
  expect((await asUser(coach,'select id,position from public.workout_items order by position')).rows).toEqual([{id:one,position:1},{id:two,position:2}]);
  const oldSnapshot=(await db.query('select snapshot from public.workout_revisions where version=1')).rows;
  await asUser(coach,call(1,[items[1],{...items[0],sets:5}]));
  expect((await db.query('select id,position,sets from public.workout_items order by position')).rows).toEqual([{id:two,position:1,sets:4},{id:one,position:2,sets:5}]);
  await expect(asUser(coach,call(1))).rejects.toThrow();
  await expect(asUser(coach,call(2,[{...items[0],sets:0}]))).rejects.toThrow();
  await expect(asUser(coach,call(2,[]))).rejects.toThrow();
  await expect(asUser(coach,call(2,[items[0],items[0]]))).rejects.toThrow();
  await expect(asUser(coach,call(2,[{...items[0],exercise_id:copy}]))).rejects.toThrow();
  expect((await db.query('select version from public.workouts')).rows).toEqual([{version:2}]);
  expect((await db.query('select * from public.workout_audit')).rows).toHaveLength(2);
  await asUser(coach,`select public.duplicate_workout('${target}','${copy}',2,'Treino A — Cópia')`);
  const copied=(await db.query<{id:string;exercise_id:string;position:number}>(`select id,exercise_id,position from public.workout_items where workout_id='${copy}' order by position`)).rows;
  expect(copied.map(row=>row.exercise_id)).toEqual([second,first]);
  expect(copied.every(row=>row.id!==one && row.id!==two)).toBe(true);
  await expect(asUser(coach,call(0,items,copy))).rejects.toThrow();
  await expect(asUser(coach,`select public.duplicate_workout('${target}','00000000-0000-4000-8000-000000000022',1,'Cópia obsoleta')`)).rejects.toThrow();
  await expect(asUser(student,`select public.duplicate_workout('${target}','00000000-0000-4000-8000-000000000022',2,'Cópia negada')`)).rejects.toThrow();
  await asUser(coach,call(2,[items[0]]));
  expect((await db.query(`select id from public.workout_items where workout_id='${copy}'`)).rows).toHaveLength(2);
  await db.exec(`update public.exercises set name='Nome novo',instructions='Instrução nova' where id='${first}'`);
  expect((await db.query(`select snapshot from public.workout_revisions where workout_id='${target}' and version=1`)).rows).toEqual(oldSnapshot);
  expect((await db.query('select action from public.workout_audit order by id')).rows).toEqual([{action:'workout.created'},{action:'workout.updated'},{action:'workout.duplicated'},{action:'workout.updated'}]);
  for(const table of ['workouts','workout_items','workout_revisions','workout_audit']){
    expect((await asUser(student,`select * from public.${table}`)).rows).toEqual([]);
    await expect(asUser(coach,`delete from public.${table}`)).rejects.toThrow();
  }
  await expect(asUser(coach,"update public.workouts set name='Bypass'")).rejects.toThrow();
  await expect(asUser(coach,`select private.persist_workout('${target}','Bypass','','[]',3,null)`)).rejects.toThrow();
  await db.exec(`update public.profiles set must_change_password=true where id='${coach}'`);
  await expect(asUser(coach,call(3))).rejects.toThrow();
  await db.exec(`update public.profiles set must_change_password=false,active=false where id='${coach}'`);
  await expect(asUser(coach,call(3))).rejects.toThrow();
  await db.exec(`update public.profiles set active=true where id='${coach}'; delete from auth.sessions;`);
  await expect(asUser(coach,call(3))).rejects.toThrow();
  expect((await asUser(coach,'select * from public.workouts')).rows).toEqual([]);
});
