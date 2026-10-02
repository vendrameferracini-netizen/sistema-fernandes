-- Local preparation only. Apply after owner review. Preserves migrations 001–007.
begin;
create table public.workout_sessions (
 id uuid primary key,
 student_id uuid not null references public.students(id),
 program_id uuid not null,
 program_version integer not null,
 entry_id uuid not null,
 workout_id uuid not null,
 workout_version integer not null,
 snapshot jsonb not null,
 status text not null default 'in_progress' check(status in ('in_progress','completed','abandoned')),
 version integer not null default 1 check(version>0),
 started_at timestamptz not null default clock_timestamp(),
 ended_at timestamptz,
 summary jsonb,
 foreign key(program_id,program_version) references public.program_revisions(program_id,version),
 foreign key(workout_id,workout_version) references public.workout_revisions(workout_id,version),
 check((status='in_progress')=(ended_at is null)),
 check(ended_at is null or ended_at>=started_at)
);
create unique index one_execution_per_student on public.workout_sessions(student_id) where status='in_progress';
create index execution_student_date on public.workout_sessions(student_id,started_at desc);
create table public.session_items (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.workout_sessions(id),
 source_item_id uuid not null,
 exercise_id uuid not null references public.exercises(id),
 position integer not null,
 snapshot jsonb not null,
 unique(session_id,position)
);
create table public.set_logs (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.session_items(id),
 set_number integer not null check(set_number between 1 and 100),
 prescribed_repetitions text not null,
 status text not null default 'pending' check(status in ('pending','completed','failed','not_performed')),
 actual_repetitions integer check(actual_repetitions between 0 and 10000),
 load_kg numeric check(load_kg between 0 and 10000 and load_kg=round(load_kg,3)),
 load_unit text not null default 'kg' check(load_unit='kg'),
 recorded_at timestamptz,
 version integer not null default 0 check(version>=0),
 unique(item_id,set_number),
 check((status in ('pending','not_performed') and actual_repetitions is null and load_kg is null)
    or (status='completed' and actual_repetitions is not null and actual_repetitions>0)
    or (status='failed' and actual_repetitions is not null))
);
create table public.execution_media (
 session_id uuid not null references public.workout_sessions(id),
 object_id uuid not null references storage.objects(id) on delete restrict,
 image_path text not null,
 primary key(session_id,object_id)
);
create index execution_media_path on public.execution_media(image_path);
create table public.execution_audit (
 id bigint generated always as identity primary key,
 session_id uuid not null references public.workout_sessions(id),
 actor_id uuid not null references public.profiles(id),
 request_id uuid not null,
 action text not null check(action in ('execution.started','execution.resumed','set.saved','execution.completed','execution.abandoned')),
 details jsonb not null,
 occurred_at timestamptz not null default clock_timestamp(),
 unique(actor_id,request_id)
);
create index execution_audit_session on public.execution_audit(session_id,occurred_at);
create table private.execution_requests (
 user_id uuid not null references public.profiles(id),
 request_id uuid not null,
 payload jsonb not null,
 result_id uuid not null references public.workout_sessions(id),
 primary key(user_id,request_id)
);
alter table public.workout_sessions enable row level security;
alter table public.session_items enable row level security;
alter table public.set_logs enable row level security;
alter table public.execution_media enable row level security;
alter table public.execution_audit enable row level security;
revoke all on public.workout_sessions,public.session_items,public.set_logs,public.execution_media,public.execution_audit from public,anon,authenticated;
revoke all on private.execution_requests from public,anon,authenticated;
grant select on public.workout_sessions,public.session_items,public.set_logs,public.execution_audit to authenticated;

create function private.can_read_execution(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workout_sessions s where s.id=target and (private.is_admin() or private.is_active_student(s.student_id)));
$$;
revoke all on function private.can_read_execution(uuid) from public,anon;
grant execute on function private.can_read_execution(uuid) to authenticated;
create policy execution_read on public.workout_sessions for select to authenticated using(private.can_read_execution(id));
create policy execution_items_read on public.session_items for select to authenticated using(private.can_read_execution(session_id));
create policy execution_sets_read on public.set_logs for select to authenticated using(exists(select 1 from public.session_items i where i.id=item_id and private.can_read_execution(i.session_id)));
create policy execution_audit_read on public.execution_audit for select to authenticated using(private.is_admin());
create function private.can_read_execution_image(path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.execution_media m where m.image_path=path and private.can_read_execution(m.session_id));
$$;
revoke all on function private.can_read_execution_image(text) from public,anon;
grant execute on function private.can_read_execution_image(text) to authenticated;
create policy execution_image_read on storage.objects for select to authenticated using(bucket_id='exercise-images' and private.can_read_execution_image(name));
create or replace function public.exercise_image_is_retained(path text) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
 return exists(select 1 from public.program_media where image_path=path) or exists(select 1 from public.execution_media where image_path=path);
end;
$$;
-- The existing restrictive DELETE policy uses exercise_image_is_retained; no bucket changes.

create function private.execution_bundle(target uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('sets',
   (select jsonb_agg(to_jsonb(l) order by l.set_number) from public.set_logs l where l.item_id=i.id)) order by i.position)
   from public.session_items i where i.session_id=s.id),'[]'::jsonb)) from public.workout_sessions s where s.id=target;
$$;
revoke all on function private.execution_bundle(uuid) from public,anon,authenticated;
create function public.get_execution(target uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_read_execution(target) then raise exception 'Execution access denied' using errcode='42501'; end if;
 return private.execution_bundle(target);
end;
$$;
revoke all on function public.get_execution(uuid) from public,anon;
grant execute on function public.get_execution(uuid) to authenticated;

create function private.lock_execution_student() returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
 perform 1 from public.profiles where id=owner_id and role='student' for update;
 if not found or not private.is_active_student(owner_id) then raise exception 'Active student session required' using errcode='42501'; end if;
 return owner_id;
end;
$$;
revoke all on function private.lock_execution_student() from public,anon,authenticated;
create function private.execution_replay(owner_id uuid,key uuid,body jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r private.execution_requests;
begin
 if key is null then raise exception 'Request ID required' using errcode='22023'; end if;
 select * into r from private.execution_requests where user_id=owner_id and request_id=key;
 if found then
  if r.payload is distinct from body then raise exception 'Request ID reused with different content' using errcode='22023'; end if;
  return r.result_id;
 end if;
 return null;
end;
$$;
revoke all on function private.execution_replay(uuid,uuid,jsonb) from public,anon,authenticated;
create function private.record_execution(owner_id uuid,key uuid,body jsonb,target uuid,event text,details jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into private.execution_requests(user_id,request_id,payload,result_id) values(owner_id,key,body,target);
 insert into public.execution_audit(session_id,actor_id,request_id,action,details) values(target,owner_id,key,event,details);
end;
$$;
revoke all on function private.record_execution(uuid,uuid,jsonb,uuid,text,jsonb) from public,anon,authenticated;

create function public.start_execution(request_id uuid,program uuid,expected_version integer,entry uuid) returns uuid
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
  insert into public.set_logs(item_id,set_number,prescribed_repetitions)
  select item_id,n,item->>'repetitions' from generate_series(1,(item->>'sets')::integer) n;
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

create function public.save_execution_set(request_id uuid,target uuid,set_id uuid,expected_version integer,result_status text,repetitions integer,weight numeric) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; body jsonb; replay uuid; s public.workout_sessions; previous public.set_logs; saved public.set_logs;
begin
 owner_id:=private.lock_execution_student();
 body:=jsonb_build_object('action','save_set','target',target,'set_id',set_id,'version',expected_version,'status',result_status,'repetitions',repetitions,'weight',weight);
 replay:=private.execution_replay(owner_id,request_id,body); if replay is not null then return replay; end if;
 select * into s from public.workout_sessions where id=target and student_id=owner_id for update;
 if not found then raise exception 'Execution access denied' using errcode='42501'; end if;
 if s.status<>'in_progress' then raise exception 'Execution closed' using errcode='55000'; end if;
 select l.* into previous from public.set_logs l join public.session_items i on i.id=l.item_id where l.id=set_id and i.session_id=target for update of l;
 if not found then raise exception 'Set not found' using errcode='42501'; end if;
 if previous.version is distinct from expected_version then raise exception 'Set changed' using errcode='40001'; end if;
 if result_status is null or result_status not in ('completed','failed','not_performed') then raise exception 'Invalid set status' using errcode='22023'; end if;
 -- Reject incoherent input before UPDATE; table CHECKs remain defense in depth.
 if result_status='not_performed' then
  if repetitions is not null or weight is not null then
   raise exception 'A not_performed set requires null repetitions and null weight' using errcode='22023';
  end if;
 else
  if repetitions is null or repetitions<0 or repetitions>10000 or (result_status='completed' and repetitions<1) then
   raise exception 'Completed repetitions must be 1..10000; failed repetitions must be 0..10000' using errcode='22023';
  end if;
  -- PostgreSQL numeric NaN and positive Infinity compare above finite values.
  -- Negative Infinity compares below zero; all are rejected by these bounds.
  if weight is not null and (weight<0 or weight>10000 or weight<>round(weight,3)) then
   raise exception 'Weight must be null or 0..10000 kg with at most three decimal places' using errcode='22023';
  end if;
 end if;
 update public.set_logs set status=result_status,actual_repetitions=repetitions,load_kg=weight,recorded_at=clock_timestamp(),version=version+1 where id=set_id returning * into saved;
 update public.workout_sessions set version=version+1 where id=target;
 perform private.record_execution(owner_id,request_id,body,target,'set.saved',jsonb_build_object('before',to_jsonb(previous),'after',to_jsonb(saved)));
 return target;
end;
$$;
revoke all on function public.save_execution_set(uuid,uuid,uuid,integer,text,integer,numeric) from public,anon;
grant execute on function public.save_execution_set(uuid,uuid,uuid,integer,text,integer,numeric) to authenticated;

create function public.finish_execution(request_id uuid,target uuid,expected_version integer,outcome text) returns uuid
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; body jsonb; replay uuid; s public.workout_sessions; pending_ids jsonb; result jsonb; ended timestamptz;
begin
 owner_id:=private.lock_execution_student();
 body:=jsonb_build_object('action','finish','target',target,'version',expected_version,'outcome',outcome);
 replay:=private.execution_replay(owner_id,request_id,body); if replay is not null then return replay; end if;
 select * into s from public.workout_sessions where id=target and student_id=owner_id for update;
 if not found then raise exception 'Execution access denied' using errcode='42501'; end if;
 if s.status<>'in_progress' then raise exception 'Execution closed' using errcode='55000'; end if;
 if s.version is distinct from expected_version then raise exception 'Execution changed' using errcode='40001'; end if;
 if outcome is null or outcome not in ('completed','abandoned') then raise exception 'Invalid outcome' using errcode='22023'; end if;
 ended:=clock_timestamp();
 select coalesce(jsonb_agg(l.id),'[]') into pending_ids from public.set_logs l join public.session_items i on i.id=l.item_id where i.session_id=target and l.status='pending';
 update public.set_logs l set status='not_performed',recorded_at=ended,version=l.version+1 from public.session_items i where l.item_id=i.id and i.session_id=target and l.status='pending';
 select jsonb_build_object('total_sets',count(*),'completed_sets',count(*) filter(where l.status='completed'),
 'failed_sets',count(*) filter(where l.status='failed'),'not_performed_sets',count(*) filter(where l.status='not_performed'),
 'elapsed_seconds',greatest(0,floor(extract(epoch from ended-s.started_at)))) into result
 from public.set_logs l join public.session_items i on i.id=l.item_id where i.session_id=target;
 update public.workout_sessions set status=outcome,ended_at=ended,summary=result,version=version+1 where id=target;
 perform private.record_execution(owner_id,request_id,body,target,'execution.'||outcome,jsonb_build_object('summary',result,'pending_finalized',pending_ids));
 return target;
end;
$$;
revoke all on function public.finish_execution(uuid,uuid,integer,text) from public,anon;
grant execute on function public.finish_execution(uuid,uuid,integer,text) to authenticated;
commit;
