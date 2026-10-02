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
const uuid=()=>crypto.randomUUID();
async function fixture(){
 const exercise=uuid(),workout=uuid(),program=uuid(),entry=uuid(),item=uuid();const path=exercise+'/'+uuid()+'.png';
 await db.exec(`insert into storage.objects(bucket_id,name) values('exercise-images','${path}');insert into public.exercises(id,name,muscle_group,image_path) values('${exercise}','Supino','Peitoral','${path}');`);
 const prescription=[{id:item,exercise_id:exercise,sets:3,repetitions:'8–10',rest_seconds:60,coach_notes:'Controle'},{id:uuid(),exercise_id:exercise,sets:3,repetitions:'12',rest_seconds:90,coach_notes:''}];
 await asUser(coach,`select public.save_workout('${workout}','Treino A','','${JSON.stringify(prescription)}',0)`);
 await asUser(coach,`select public.save_student_program('${program}','${student}','Programa','2020-01-01','${JSON.stringify([{id:entry,label:'Treino A',workout_id:workout,workout_version:1}])}',0)`);
 await asUser(coach,`select public.transition_student_program('${program}',1,'activate',${currentProgram?`'${currentProgram.id}'`:'null'},${currentProgram?.version??'null'})`);
 currentProgram={id:program,version:2};return {exercise,workout,program,entry,path,prescription};
}
let currentProgram:{id:string;version:number}|null=null;
async function start(p:{program:string;entry:string},key=uuid(),version=2){const r=await asUser(student,`select public.start_execution('${key}','${p.program}',${version},'${p.entry}') as id`);return (r.rows[0] as {id:string}).id;}
async function bundle(id:string){return (await asUser(student,`select public.get_execution('${id}') as result`)).rows[0] as {result:any};}
async function save(id:string,set:any,status:string,reps:number|null,load:number|null,key=uuid()){return asUser(student,`select public.save_execution_set('${key}','${id}','${set.id}',${set.version},'${status}',${reps??'null'},${load??'null'})`);}
async function finish(id:string,version:number,status='completed',key=uuid()){return asUser(student,`select public.finish_execution('${key}','${id}',${version},'${status}')`);}

it('migrates existing results without deletion and finalizes simply with immutable snapshots',async()=>{
 const p=await fixture();const legacy=await start(p);let old=(await bundle(legacy)).result;await save(legacy,old.items[0].sets[0],'completed',8,10);old=(await bundle(legacy)).result;
 await db.exec(readFileSync(new URL('../supabase/migrations/202609250009_simple_execution.sql',import.meta.url),'utf8'));
 expect((await bundle(legacy)).result.items).toEqual(old.items);
 await expect(save(legacy,old.items[0].sets[1],'completed',8,10)).rejects.toMatchObject({code:'42501'});
 await expect(finish(legacy,old.version)).rejects.toMatchObject({code:'42501'});
 const complete=(id:string,v:number,status='completed',difficulty='balanced',key=uuid(),comment='null')=>asUser(student,`select public.finish_execution_feedback('${key}','${id}',${v},'${status}','${difficulty}',${comment})`);
 for(const [status,difficulty] of [['bad','easy'],['completed','bad']])await expect(complete(legacy,old.version,status,difficulty)).rejects.toMatchObject({code:'22023'});
 await expect(complete(legacy,old.version,'completed','easy',uuid(),"'"+'a'.repeat(2001)+"'")).rejects.toMatchObject({code:'22023'});
 await expect(complete(legacy,1)).rejects.toMatchObject({code:'40001'});
 const key=uuid();await complete(legacy,old.version,'not_completed','hard',key,"'Sem tempo'");await complete(legacy,old.version,'not_completed','hard',key,"'Sem tempo'");
 let closed=(await bundle(legacy)).result;expect(closed).toMatchObject({status:'not_completed',difficulty:'hard',feedback:'Sem tempo',execution_mode:'legacy_sets'});expect(closed.items).toEqual(old.items);expect(closed.snapshot).toEqual(old.snapshot);expect(closed.duration_seconds).toBeGreaterThanOrEqual(0);expect(closed.performed_on).toBeTruthy();
 expect((await db.query(`select * from public.execution_audit where session_id='${legacy}' and action='execution.not_completed'`)).rows).toHaveLength(1);
 await expect(complete(legacy,closed.version)).rejects.toMatchObject({code:'55000'});
 const id=await start(p);expect(await start(p)).toBe(id);let s=(await bundle(id)).result;expect(s.execution_mode).toBe('simple');expect(s.items.every((i:any)=>i.sets===null)).toBe(true);expect(s.snapshot.entry.workout.items[0].sets).toBe(3);
 const snapshot=s.snapshot;await asUser(coach,`select public.save_workout('${p.workout}','Alterado','','${JSON.stringify(p.prescription.map(r=>({...r,sets:5})))}',1)`);expect((await bundle(id)).result.snapshot).toEqual(snapshot);
 const other=uuid(),authSession=uuid();await db.exec(`insert into auth.users values('${other}','other@test.invalid','hash');insert into public.profiles(id,full_name,username,role,must_change_password) values('${other}','Other','other','student',false);insert into private.login_identities(user_id,auth_email) values('${other}','other@test.invalid');insert into auth.sessions values('${authSession}','${other}');select public.register_app_session('${other}','${authSession}',1);set role authenticated;set request.jwt.claim.sub='${other}';set request.jwt.claim.session_id='${authSession}';`);
 expect((await db.query('select * from public.workout_sessions')).rows).toHaveLength(0);expect((await db.query(`select * from storage.objects where name='${p.path}'`)).rows).toHaveLength(0);await expect(db.query(`select public.finish_execution_feedback('${uuid()}','${id}',1,'completed','easy',null)`)).rejects.toMatchObject({code:'42501'});await db.exec('reset role');
 await complete(id,s.version);closed=(await bundle(id)).result;expect(closed.status).toBe('completed');expect(closed.feedback).toBeNull();expect(closed.snapshot).toEqual(snapshot);expect((await asUser(student,'select * from public.workout_sessions')).rows).toHaveLength(2);
});

it('aggregates all history with pagination, month boundaries and owner/admin-only access',async()=>{
 await db.exec(readFileSync(new URL('../supabase/migrations/202609250010_execution_activity.sql',import.meta.url),'utf8'));
 const base=(await db.query<any>('select * from public.workout_sessions limit 1')).rows[0];
 const report=async(id=student,month='2024-02-01',page=0)=>(await asUser(id,`select public.execution_activity('${student}','${month}',${page}) as result`)).rows[0] as {result:any};
 const before=(await report()).result.stats.total;
 await db.exec(`insert into public.workout_sessions(id,student_id,program_id,program_version,entry_id,workout_id,workout_version,snapshot,status,started_at,ended_at,difficulty,feedback)
 select gen_random_uuid(),student_id,program_id,program_version,entry_id,workout_id,workout_version,snapshot,
 case when n%2=0 then 'completed' else 'not_completed' end,
 '2024-03-01 02:58:00+00'::timestamptz,'2024-03-01 02:59:00+00'::timestamptz,
 'easy','Comentário privado' from public.workout_sessions cross join generate_series(1,25) n where id='${base.id}';`);
 const r=(await report()).result;
 expect(r.stats.total).toBe(before+25);expect(r.stats.month).toBe(25);expect(r.stats.month_completed).toBe(12);expect(r.stats.month_not_completed).toBe(13);expect(r.days).toEqual([{day:'2024-02-29',total:25,completed:12}]);expect(r.history).toHaveLength(20);
 const second=(await report(student,'2024-02-01',1)).result;expect(second.history).toHaveLength(before+5);expect(new Set([...r.history,...second.history].map((row:any)=>row.id)).size).toBe(before+25);
 expect((await report(coach)).result).toEqual(r);
 await expect(report(student,'2024-02-02')).rejects.toMatchObject({code:'22023'});await expect(report(student,'2024-02-01',-1)).rejects.toMatchObject({code:'22023'});
 const other=(await db.query<any>("select id from public.profiles where username='other'")).rows[0].id;const authSession=(await db.query<any>(`select id from auth.sessions where user_id='${other}'`)).rows[0].id;
 await db.exec(`set role authenticated;set request.jwt.claim.sub='${other}';set request.jwt.claim.session_id='${authSession}';`);
 await expect(db.query(`select public.execution_activity('${student}','2024-02-01',0)`)).rejects.toMatchObject({code:'42501'});
 expect((await db.query<any>(`select public.execution_activity('${other}','2024-02-01',0) as result`)).rows[0].result.stats.total).toBe(0);
 await db.exec('reset role');
 await db.exec(`update public.profiles set active=false where id='${student}'`);await expect(report()).rejects.toMatchObject({code:'42501'});expect((await report(coach)).result.stats.total).toBe(before+25);await db.exec(`update public.profiles set active=true where id='${student}'`);
 await db.exec(`delete from auth.sessions where user_id='${student}'`);await expect(report()).rejects.toMatchObject({code:'42501'});
 await db.exec('set role anon');await expect(db.query(`select public.execution_activity('${student}','2024-02-01',0)`)).rejects.toMatchObject({code:'42501'});await db.exec('reset role');
});
