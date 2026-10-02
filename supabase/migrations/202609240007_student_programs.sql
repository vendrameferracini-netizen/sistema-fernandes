-- Assignment and read-only student display. No execution or performance records.
begin;
create table public.student_programs (
  id uuid primary key,
  student_id uuid not null references public.students(id) on delete restrict,
  name text not null check(char_length(btrim(name)) between 2 and 160),
  start_date date not null check(start_date between date '1900-01-01' and date '2200-12-31'),
  status text not null default 'draft' check(status in ('draft','active','ended')),
  version integer not null check(version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((status='ended')=(ended_at is not null))
);
create unique index student_program_one_active on public.student_programs(student_id) where status='active';
create index student_program_student_idx on public.student_programs(student_id,created_at desc);
create table public.program_entries (
  id uuid primary key,
  program_id uuid not null references public.student_programs(id),
  position integer not null check(position between 1 and 26),
  label text not null check(char_length(btrim(label)) between 1 and 80),
  workout_id uuid not null,
  workout_version integer not null,
  foreign key(workout_id,workout_version) references public.workout_revisions(workout_id,version),
  unique(program_id,position) deferrable initially deferred
);
create table public.program_revisions (
  program_id uuid not null references public.student_programs(id),
  version integer not null,
  snapshot jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(program_id,version)
);
create table public.program_media (
  program_id uuid not null,
  version integer not null,
  object_id uuid not null references storage.objects(id) on delete restrict,
  image_path text not null,
  foreign key(program_id,version) references public.program_revisions(program_id,version),
  primary key(program_id,version,object_id)
);
create index program_media_path_idx on public.program_media(image_path);
create table public.program_audit (
  id bigint generated always as identity primary key,
  program_id uuid not null,
  version integer not null,
  actor_id uuid not null references public.profiles(id),
  action text not null check(action in ('program.created','program.updated','program.activated','program.ended','program.replaced')),
  replacement_id uuid references public.student_programs(id),
  occurred_at timestamptz not null default now(),
  foreign key(program_id,version) references public.program_revisions(program_id,version)
);
alter table public.student_programs enable row level security;
alter table public.program_entries enable row level security;
alter table public.program_revisions enable row level security;
alter table public.program_media enable row level security;
alter table public.program_audit enable row level security;
revoke all on public.student_programs,public.program_entries,public.program_revisions,public.program_media,public.program_audit from public,anon,authenticated;
grant select on public.student_programs,public.program_entries,public.program_revisions,public.program_audit to authenticated;

create function private.can_read_program(target uuid,revision integer default null) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.student_programs p where p.id=target and p.status='active'
    and (revision is null or p.version=revision) and private.is_active_student(p.student_id));
$$;
revoke all on function private.can_read_program(uuid,integer) from public,anon;
grant execute on function private.can_read_program(uuid,integer) to authenticated;
create policy student_programs_read on public.student_programs for select to authenticated
using ((select private.is_admin()) or private.can_read_program(id));
create policy program_entries_read on public.program_entries for select to authenticated
using ((select private.is_admin()) or private.can_read_program(program_id));
create policy program_revisions_read on public.program_revisions for select to authenticated
using ((select private.is_admin()) or private.can_read_program(program_id,version));
create policy program_audit_read on public.program_audit for select to authenticated using ((select private.is_admin()));

create function private.can_read_program_image(path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.program_media m where m.image_path=path
    and private.can_read_program(m.program_id,m.version));
$$;
revoke all on function private.can_read_program_image(text) from public,anon;
grant execute on function private.can_read_program_image(text) to authenticated;
create policy exercise_images_assigned_read on storage.objects for select to authenticated
using(bucket_id='exercise-images' and private.can_read_program_image(name));
create function public.exercise_image_is_retained(path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  return exists(select 1 from public.program_media where image_path=path);
end;
$$;
revoke all on function public.exercise_image_is_retained(text) from public,anon;
grant execute on function public.exercise_image_is_retained(text) to authenticated;

-- Additional restriction preserves pinned objects even if cleanup is called directly.
create policy exercise_images_preserve_programs on storage.objects as restrictive for delete to authenticated
using(bucket_id <> 'exercise-images' or (private.is_admin() and not public.exercise_image_is_retained(name)));

create function private.record_program(target uuid,event text,replacement uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare p public.student_programs; contents jsonb; image text; stored_id uuid;
begin
  select * into strict p from public.student_programs where id=target;
  select jsonb_agg(jsonb_build_object('id',e.id,'label',e.label,'position',e.position,
    'workout_id',e.workout_id,'workout_version',e.workout_version,'workout',r.snapshot) order by e.position)
    into contents from public.program_entries e join public.workout_revisions r
    on r.workout_id=e.workout_id and r.version=e.workout_version where e.program_id=target;
  insert into public.program_revisions(program_id,version,created_by,snapshot)
    values(target,p.version,auth.uid(),jsonb_build_object('schema_version',1,'name',p.name,'start_date',p.start_date,'status',p.status,'entries',contents));
  for image in select distinct item->'exercise'->>'image_path'
    from jsonb_array_elements(contents) entry
    cross join lateral jsonb_array_elements(entry->'workout'->'items') item
    where nullif(item->'exercise'->>'image_path','') is not null loop
    select id into stored_id from storage.objects where bucket_id='exercise-images' and name=image for share;
    if not found then raise exception 'A workout image is no longer available; save a new workout revision first' using errcode='P0002'; end if;
    insert into public.program_media(program_id,version,object_id,image_path) values(target,p.version,stored_id,image);
  end loop;
  insert into public.program_audit(program_id,version,actor_id,action,replacement_id)
    values(target,p.version,auth.uid(),event,replacement);
end;
$$;
revoke all on function private.record_program(uuid,text,uuid) from public,anon,authenticated;

create function public.save_student_program(target uuid,student uuid,program_name text,begins_on date,entries jsonb,expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.student_programs; next_version integer;
begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  perform 1 from public.profiles where id=student and role='student' and active for update;
  if not found then raise exception 'Active student required' using errcode='22023'; end if;
  if target is null or expected_version is null or expected_version<0 or jsonb_typeof(entries) is distinct from 'array' then
    raise exception 'Invalid program' using errcode='22023'; end if;
  if jsonb_array_length(entries) not between 1 and 26 or octet_length(entries::text)>40000 then
    raise exception 'Invalid entries' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text,1));
  select * into p from public.student_programs where id=target for update;
  if (p.id is null and expected_version<>0) or (p.id is not null and
    (p.version<>expected_version or p.student_id<>student or p.status='ended')) then
    raise exception 'Program changed or ended' using errcode='40001'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e group by e->>'id' having count(*)>1) then
    raise exception 'Duplicate entry identity' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e join public.program_entries old on old.id=(e->>'id')::uuid where old.program_id<>target) then
    raise exception 'Entry belongs to another program' using errcode='22023'; end if;
  next_version:=coalesce(p.version,0)+1;
  if p.id is null then
    insert into public.student_programs(id,student_id,name,start_date,version) values(target,student,btrim(program_name),begins_on,next_version);
  else
    update public.student_programs set name=btrim(program_name),start_date=begins_on,version=next_version,updated_at=clock_timestamp() where id=target;
  end if;
  delete from public.program_entries where program_id=target;
  insert into public.program_entries(id,program_id,position,label,workout_id,workout_version)
    select (e->>'id')::uuid,target,n::integer,btrim(e->>'label'),(e->>'workout_id')::uuid,(e->>'workout_version')::integer
    from jsonb_array_elements(entries) with ordinality rows(e,n);
  perform private.record_program(target,case when p.id is null then 'program.created' else 'program.updated' end);
  return target;
end;
$$;
revoke all on function public.save_student_program(uuid,uuid,text,date,jsonb,integer) from public,anon;
grant execute on function public.save_student_program(uuid,uuid,text,date,jsonb,integer) to authenticated;

create function public.transition_student_program(target uuid,expected_version integer,transition text,replaces uuid default null,replaces_version integer default null)
returns void language plpgsql security definer set search_path='' as $$
declare p public.student_programs; old public.student_programs; owner_id uuid;
begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select student_id into owner_id from public.student_programs where id=target;
  perform 1 from public.profiles where id=owner_id and role='student' for update;
  if not found then raise exception 'Student not found' using errcode='22023'; end if;
  select * into p from public.student_programs where id=target for update;
  if p.version is distinct from expected_version then raise exception 'Program changed' using errcode='40001'; end if;
  if transition='activate' and p.status='draft' then
    if not exists(select 1 from public.profiles where id=owner_id and active) then raise exception 'Inactive student' using errcode='22023'; end if;
    select * into old from public.student_programs where student_id=owner_id and status='active' for update;
    if old.id is distinct from replaces or (old.id is not null and old.version is distinct from replaces_version) then
      raise exception 'Active program changed; confirm replacement again' using errcode='40001'; end if;
    if old.id is not null then
      update public.student_programs set status='ended',ended_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=old.id;
      perform private.record_program(old.id,'program.replaced',target);
    end if;
    update public.student_programs set status='active',version=version+1,updated_at=clock_timestamp() where id=target;
    perform private.record_program(target,'program.activated');
  elsif transition='end' and p.status='active' then
    update public.student_programs set status='ended',ended_at=clock_timestamp(),updated_at=clock_timestamp(),version=version+1 where id=target;
    perform private.record_program(target,'program.ended');
  else
    raise exception 'Invalid transition' using errcode='22023';
  end if;
end;
$$;
revoke all on function public.transition_student_program(uuid,integer,text,uuid,integer) from public,anon;
grant execute on function public.transition_student_program(uuid,integer,text,uuid,integer) to authenticated;
commit;
