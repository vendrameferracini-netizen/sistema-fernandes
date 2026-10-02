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
it('retains individual prescriptions and numeric results, resumes one execution and preserves the exact source after edits',async()=>{
 const p=await fixture(),key=uuid();const id=await start(p,key);expect(await start(p,key)).toBe(id);expect(await start(p)).toBe(id);
 let s=(await bundle(id)).result;const original=s.snapshot;
 expect(s.program_version).toBe(2);expect(s.workout_version).toBe(1);expect(s.items).toHaveLength(2);
 expect(s.items[0].sets.map((r:any)=>[r.set_number,r.prescribed_repetitions,r.status])).toEqual([[1,'8–10','pending'],[2,'8–10','pending'],[3,'8–10','pending']]);
 const rows=s.items.flatMap((i:any)=>i.sets);const saveKey=uuid();
 const beforeInvalid=(await bundle(id)).result;
 const beforeAudit=(await db.query(`select * from public.execution_audit where session_id='${id}' order by id`)).rows;
 const beforeRequests=(await db.query(`select * from private.execution_requests where result_id='${id}' order by request_id`)).rows;
 for(const [status,reps,weight] of [
  ['not_performed',0,null],['not_performed',null,0],['not_performed',1,2],
  ['completed',null,null],['completed',0,null],['completed',-1,null],['completed',10001,null],
  ['failed',null,null],['failed',-1,null],['failed',10001,null],
  ['completed',8,-1],['failed',0,-1],['completed',8,10001],['failed',1,1.2345],
  ['pending',null,null],['invalid',1,null],
 ] as [string,number|null,number|null][]){
  await expect(save(id,rows[0],status,reps,weight)).rejects.toMatchObject({code:'22023'});
 }
 for(const status of ['completed','failed'])for(const special of ['NaN','Infinity','-Infinity']){
  await expect(asUser(student,`select public.save_execution_set('${uuid()}','${id}','${rows[0].id}',0,'${status}',1,'${special}'::numeric)`)).rejects.toMatchObject({code:'22023'});
 }
 await expect(asUser(student,`select public.save_execution_set('${uuid()}','${id}','${rows[0].id}',0,null,1,null)`)).rejects.toMatchObject({code:'22023'});
 expect((await bundle(id)).result).toEqual(beforeInvalid);
 expect((await db.query(`select * from public.execution_audit where session_id='${id}' order by id`)).rows).toEqual(beforeAudit);
 expect((await db.query(`select * from private.execution_requests where result_id='${id}' order by request_id`)).rows).toEqual(beforeRequests);

 await save(id,rows[0],'completed',8,12.5,saveKey);await save(id,rows[0],'completed',8,12.5,saveKey);
 await expect(save(id,rows[0],'completed',9,12.5,saveKey)).rejects.toThrow();
 await expect(save(id,rows[0],'completed',9,12.5)).rejects.toThrow('Set changed');
 await save(id,rows[1],'failed',3,12.5);
 await expect(save(id,rows[2],'completed',0,2)).rejects.toThrow();
 await expect(save(id,rows[2],'not_performed',1,2)).rejects.toThrow();
 await expect(save(id,rows[2],'failed',0,-2)).rejects.toThrow();
 await asUser(coach,`select public.save_workout('${p.workout}','Treino alterado','','${JSON.stringify(p.prescription.map(r=>({...r,sets:5})))}',1)`);
 await asUser(coach,`select public.save_student_program('${p.program}','${student}','Programa alterado','2020-01-01','${JSON.stringify([{id:p.entry,label:'Treino B',workout_id:p.workout,workout_version:2}])}',2)`);
 currentProgram!.version=3;
 expect(await start(p,uuid(),3)).toBe(id);
 await asUser(coach,`select public.transition_student_program('${p.program}',3,'end')`);currentProgram=null;
 await db.exec(`update public.exercises set image_path=null,name='Outro nome' where id='${p.exercise}'`);
 expect((await asUser(student,`select name from storage.objects where name='${p.path}'`)).rows).toHaveLength(1);
 expect((await asUser(coach,`delete from storage.objects where name='${p.path}' returning id`)).rows).toHaveLength(0);
 s=(await bundle(id)).result;expect(s.snapshot).toEqual(original);expect(s.items[0].sets[0].actual_repetitions).toBe(8);expect(s.items[0].sets[0].load_kg).toBe(12.5);
 expect(s.items[0].sets[1].status).toBe('failed');expect(s.items[0].sets[0].recorded_at).toBeTruthy();
 await expect(finish(id,1)).rejects.toThrow('Execution changed');
 const finishKey=uuid();await finish(id,s.version,'completed',finishKey);await finish(id,s.version,'completed',finishKey);
 const closed=(await bundle(id)).result;expect(closed.status).toBe('completed');expect(closed.summary).toMatchObject({total_sets:6,completed_sets:1,failed_sets:1,not_performed_sets:4});
 expect(closed.items.flatMap((i:any)=>i.sets)).toHaveLength(6);expect(closed.items[1].sets.every((r:any)=>r.status==='not_performed'&&r.actual_repetitions===null)).toBe(true);
 await expect(save(id,closed.items[0].sets[0],'completed',20,50)).rejects.toThrow('Execution closed');
 expect((await db.query(`select * from public.execution_audit where session_id='${id}' and action='set.saved'`)).rows).toHaveLength(2);
 expect((await db.query(`select * from public.execution_audit where session_id='${id}' and action='execution.completed'`)).rows).toHaveLength(1);
});
it('denies other users, future starts, direct writes and revoked access, while preserving abandonment',async()=>{
 const p=await fixture();
 await db.exec(`update public.student_programs set start_date='2200-01-01' where id='${p.program}'`);
 await expect(start(p)).rejects.toThrow('not started');
 await db.exec(`update public.student_programs set start_date='2020-01-01' where id='${p.program}'`);
 await expect(start({...p,entry:uuid()})).rejects.toThrow('not assigned');
 await expect(start(p,uuid(),1)).rejects.toThrow('Program changed');
 const id=await start(p);let s=(await bundle(id)).result;
 await expect(start({...p,entry:uuid()})).rejects.toThrow('current execution');
 const other=uuid(),otherSession=uuid();
 await db.exec(`insert into auth.users values('${other}','other@test.invalid','hash');insert into public.profiles(id,full_name,username,role,must_change_password) values('${other}','Other','other','student',false);insert into private.login_identities(user_id,auth_email) values('${other}','other@test.invalid');insert into auth.sessions values('${otherSession}','${other}');select public.register_app_session('${other}','${otherSession}',1);set role authenticated;set request.jwt.claim.sub='${other}';set request.jwt.claim.session_id='${otherSession}';`);
 for(const table of ['workout_sessions','session_items','set_logs','execution_audit'])expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0);
 expect((await db.query(`select private.is_active_student('${other}') as own, private.is_active_student('${student}') as other, private.can_read_execution('${id}') as execution`)).rows).toEqual([{own:true,other:false,execution:false}]);
 expect((await db.query(`select * from public.workout_sessions where id='${id}'`)).rows).toHaveLength(0);
 expect((await db.query(`select * from public.session_items where id='${s.items[0].id}'`)).rows).toHaveLength(0);
 expect((await db.query(`select * from public.set_logs where id='${s.items[0].sets[0].id}'`)).rows).toHaveLength(0);
 expect((await db.query(`select private.can_read_execution_image('${p.path}') as visible`)).rows).toEqual([{visible:false}]);

 expect((await db.query(`select * from storage.objects where name='${p.path}'`)).rows).toHaveLength(0);
 await expect(db.query(`select public.get_execution('${id}')`)).rejects.toThrow();
 await expect(db.query(`select public.save_execution_set('${uuid()}','${id}','${s.items[0].sets[0].id}',0,'completed',8,10)`)).rejects.toThrow();await db.exec('reset role');
 expect((await asUser(coach,`select public.get_execution('${id}')`)).rows).toHaveLength(1);
 await expect(asUser(coach,`select public.finish_execution('${uuid()}','${id}',1,'completed')`)).rejects.toThrow();
 for(const table of ['workout_sessions','session_items','set_logs','execution_audit'])await expect(asUser(student,`delete from public.${table}`)).rejects.toThrow();
 await expect(asUser(student,`select private.execution_bundle('${id}')`)).rejects.toThrow();
 await db.exec(`update public.profiles set must_change_password=true where id='${student}'`);await expect(bundle(id)).rejects.toThrow();await expect(save(id,s.items[0].sets[0],'completed',8,10)).rejects.toThrow();
 await db.exec(`update public.profiles set must_change_password=false,active=false where id='${student}'`);await expect(bundle(id)).rejects.toThrow();
 await db.exec(`update public.profiles set active=true where id='${student}'`);

 for(const [status,reps,weight] of [['not_performed',null,null],['completed',10000,10000],['completed',1,null],['failed',0,null],['failed',10000,1.234]] as [string,number|null,number|null][]){
  const current=(await bundle(id)).result.items[0].sets[0];await save(id,current,status,reps,weight);
  expect((await bundle(id)).result.items[0].sets[0]).toMatchObject({status,actual_repetitions:reps,load_kg:weight});
 }
 s=(await bundle(id)).result;
 await save(id,s.items[0].sets[0],'failed',0,0);s=(await bundle(id)).result;await finish(id,s.version,'abandoned');
 s=(await bundle(id)).result;expect(s.status).toBe('abandoned');expect(s.summary).toMatchObject({total_sets:6,completed_sets:0,failed_sets:1,not_performed_sets:5});
 const newId=await start(p);expect(newId).not.toBe(id);
 await db.exec(`delete from auth.sessions where user_id='${student}'`);await expect(bundle(newId)).rejects.toThrow();
 await db.exec('set role anon');await expect(db.query('select * from public.workout_sessions')).rejects.toThrow();await db.exec('reset role');
});
