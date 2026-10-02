-- Incremental replacement of the execution experience. Migration 008 is already applied.
-- Existing snapshots, series records and audits remain unchanged; new sessions need no set logs.
begin;
alter table public.workout_sessions add column difficulty text check(difficulty in ('easy','balanced','hard'));
alter table public.workout_sessions add column feedback text check(char_length(feedback)<=2000);
alter table public.workout_sessions add column execution_mode text not null default 'legacy_sets' check(execution_mode in ('legacy_sets','simple'));
alter table public.workout_sessions alter column execution_mode set default 'simple';
alter table public.workout_sessions add column duration_seconds bigint generated always as (case when ended_at is not null then greatest(0,floor(extract(epoch from ended_at-started_at)))::bigint end) stored;
alter table public.workout_sessions add column performed_on date generated always as ((started_at at time zone 'America/Sao_Paulo')::date) stored;
alter table public.workout_sessions drop constraint workout_sessions_status_check;
alter table public.workout_sessions add constraint workout_sessions_status_check check(status in ('in_progress','completed','abandoned','not_completed'));
alter table public.execution_audit drop constraint execution_audit_action_check;
alter table public.execution_audit add constraint execution_audit_action_check check(action in ('execution.started','execution.resumed','set.saved','execution.completed','execution.abandoned','execution.not_completed'));
-- Old clients cannot keep writing individual results or bypass the feedback finalization.
revoke all on function public.save_execution_set(uuid,uuid,uuid,integer,text,integer,numeric) from public,anon,authenticated;
revoke all on function public.finish_execution(uuid,uuid,integer,text) from public,anon,authenticated;
create or replace function public.start_execution(request_id uuid,program uuid,expected_version integer,entry uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; body jsonb; replay uuid; active public.workout_sessions; p public.student_programs; content jsonb; selected jsonb; item jsonb; item_id uuid; target uuid; image text; stored_id uuid;
begin
 owner_id:=private.lock_execution_student();
 body:=jsonb_build_object('action','start','program',program,'version',expected_version,'entry',entry);
 replay:=private.execution_replay(owner_id,request_id,body); if replay is not null then return replay; end if;
 select * into active from public.workout_sessions where student_id=owner_id and status='in_progress' for update;
 if found then
  if active.program_id=program and active.entry_id=entry then
   perform private.record_execution(owner_id,request_id,body,active.id,'execution.resumed','{}'); return active.id;
  end if;
  raise exception 'Resume or close your current execution first' using errcode='55000';
 end if;
 select * into p from public.student_programs where id=program and student_id=owner_id and status='active' for share;
 if not found or p.version is distinct from expected_version then raise exception 'Program changed' using errcode='40001'; end if;
 if p.start_date>(clock_timestamp() at time zone 'America/Sao_Paulo')::date then raise exception 'Program has not started yet' using errcode='22023'; end if;
 select snapshot into content from public.program_revisions where program_id=program and version=expected_version;
 select e into selected from jsonb_array_elements(content->'entries') e where (e->>'id')::uuid=entry;
 if selected is null then raise exception 'Workout not assigned' using errcode='22023'; end if;
 target:=gen_random_uuid();
 insert into public.workout_sessions(id,student_id,program_id,program_version,entry_id,workout_id,workout_version,snapshot)
 values(target,owner_id,program,expected_version,entry,(selected->>'workout_id')::uuid,(selected->>'workout_version')::integer,
 jsonb_build_object('schema_version',1,'program_name',content->>'name','program_start_date',content->>'start_date','entry',selected));
 for item in select e from jsonb_array_elements(selected->'workout'->'items') e loop
  insert into public.session_items(session_id,source_item_id,exercise_id,position,snapshot)
  values(target,(item->>'id')::uuid,(item->>'exercise_id')::uuid,(item->>'position')::integer,item) returning id into item_id;
 end loop;
 for image in select distinct i.snapshot->'exercise'->>'image_path' from public.session_items i where i.session_id=target and nullif(i.snapshot->'exercise'->>'image_path','') is not null loop
  select id into stored_id from storage.objects where bucket_id='exercise-images' and name=image for share;
  if not found then raise exception 'Execution image unavailable' using errcode='P0002'; end if;
  insert into public.execution_media values(target,stored_id,image);
 end loop;
 perform private.record_execution(owner_id,request_id,body,target,'execution.started',jsonb_build_object('program_version',expected_version));
 return target;
end;
$$;
revoke all on function public.start_execution(uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.start_execution(uuid,uuid,integer,uuid) to authenticated;


create function public.finish_execution_feedback(request_id uuid,target uuid,expected_version integer,outcome text,perceived_difficulty text,comment text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; body jsonb; replay uuid; s public.workout_sessions; ended timestamptz; result jsonb;
begin
 owner_id:=private.lock_execution_student();
 body:=jsonb_build_object('action','finish_feedback','target',target,'version',expected_version,'outcome',outcome,'difficulty',perceived_difficulty,'comment',comment);
 replay:=private.execution_replay(owner_id,request_id,body); if replay is not null then return replay; end if;
 select * into s from public.workout_sessions where id=target and student_id=owner_id for update;
 if not found then raise exception 'Execution access denied' using errcode='42501'; end if;
 if s.status<>'in_progress' then raise exception 'Execution closed' using errcode='55000'; end if;
 if s.version is distinct from expected_version then raise exception 'Execution changed' using errcode='40001'; end if;
 if outcome is null or outcome not in ('completed','not_completed') then raise exception 'Invalid outcome' using errcode='22023'; end if;
 if perceived_difficulty is null or perceived_difficulty not in ('easy','balanced','hard') then raise exception 'Invalid difficulty' using errcode='22023'; end if;
 if char_length(comment)>2000 then raise exception 'Comment exceeds 2000 characters' using errcode='22023'; end if;
 ended:=clock_timestamp();
 result:=jsonb_build_object('elapsed_seconds',greatest(0,floor(extract(epoch from ended-s.started_at))),'outcome',outcome);
 -- Legacy set logs are archival evidence, not inferred exercise outcomes. Do not rewrite them.
 update public.workout_sessions set status=outcome,difficulty=perceived_difficulty,feedback=nullif(btrim(comment),''),ended_at=ended,summary=result,version=version+1 where id=target;
 perform private.record_execution(owner_id,request_id,body,target,'execution.'||outcome,jsonb_build_object('summary',result,'difficulty',perceived_difficulty,'feedback',nullif(btrim(comment),'')));
 return target;
end;
$$;
revoke all on function public.finish_execution_feedback(uuid,uuid,integer,text,text,text) from public,anon;
grant execute on function public.finish_execution_feedback(uuid,uuid,integer,text,text,text) to authenticated;
commit;
