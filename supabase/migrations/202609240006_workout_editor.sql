-- Administrative editor only. No assignments or student execution permissions.
begin;
create table public.workouts (
  id uuid primary key,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  instructions text not null default '' check (char_length(instructions)<=5000),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.workout_items (
  id uuid primary key,
  workout_id uuid not null references public.workouts(id) on delete restrict,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position integer not null check (position between 1 and 100),
  sets integer not null check (sets between 1 and 100),
  repetitions text not null check (char_length(btrim(repetitions)) between 1 and 80),
  rest_seconds integer not null check (rest_seconds between 0 and 3600),
  coach_notes text not null default '' check (char_length(coach_notes)<=2000),
  unique(workout_id,position) deferrable initially deferred
);
create index workout_items_workout_idx on public.workout_items(workout_id);
create table public.workout_revisions (
  workout_id uuid not null references public.workouts(id) on delete restrict,
  version integer not null,
  snapshot jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(workout_id,version)
);
create table public.workout_audit (
  id bigint generated always as identity primary key,
  workout_id uuid not null references public.workouts(id),
  version integer not null,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('workout.created','workout.updated','workout.duplicated')),
  source_workout_id uuid references public.workouts(id),
  occurred_at timestamptz not null default now(),
  foreign key(workout_id,version) references public.workout_revisions(workout_id,version)
);
alter table public.workouts enable row level security;
alter table public.workout_items enable row level security;
alter table public.workout_revisions enable row level security;
alter table public.workout_audit enable row level security;
revoke all on public.workouts,public.workout_items,public.workout_revisions,public.workout_audit from public,anon,authenticated;
grant select on public.workouts,public.workout_items,public.workout_revisions,public.workout_audit to authenticated;
create policy workouts_admin_read on public.workouts for select to authenticated using ((select private.is_admin()));
create policy workout_items_admin_read on public.workout_items for select to authenticated using ((select private.is_admin()));
create policy workout_revisions_admin_read on public.workout_revisions for select to authenticated using ((select private.is_admin()));
create policy workout_audit_admin_read on public.workout_audit for select to authenticated using ((select private.is_admin()));

create function private.persist_workout(
  target uuid, workout_name text, general_instructions text,
  items jsonb, expected_version integer, source_id uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare current_version integer; next_version integer; item jsonb; saved_count integer;
begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if target is null or expected_version is null or expected_version<0
    or jsonb_typeof(items) is distinct from 'array' then
    raise exception 'Invalid workout' using errcode='22023';
  end if;
  if jsonb_array_length(items) not between 1 and 100 or octet_length(items::text)>500000 then
    raise exception 'Invalid exercise count or size' using errcode='22023';
  end if;
  -- Serialize creation/retries and edits for this target UUID.
  perform pg_advisory_xact_lock(hashtextextended(target::text,0));
  select version into current_version from public.workouts where id=target for update;
  if (current_version is null and expected_version<>0)
    or (current_version is not null and current_version<>expected_version) then
    raise exception 'Workout changed; reload' using errcode='40001';
  end if;
  if exists(select 1 from jsonb_array_elements(items) x group by x->>'id' having count(*)>1) then
    raise exception 'Duplicate item identifier' using errcode='22023';
  end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) is distinct from 'object'
      or item->>'id' is null or item->>'exercise_id' is null
      or jsonb_typeof(item->'sets') is distinct from 'number'
      or jsonb_typeof(item->'rest_seconds') is distinct from 'number'
      or jsonb_typeof(item->'repetitions') is distinct from 'string'
      or jsonb_typeof(item->'coach_notes') is distinct from 'string' then
      raise exception 'Invalid item' using errcode='22023';
    end if;
    if exists(select 1 from public.workout_items where id=(item->>'id')::uuid and workout_id<>target) then
      raise exception 'Item belongs to another workout' using errcode='22023';
    end if;
    if exists(select 1 from public.workout_items where id=(item->>'id')::uuid and exercise_id<>(item->>'exercise_id')::uuid) then
      raise exception 'Exercise identity cannot change for an existing item' using errcode='22023';
    end if;
  end loop;
  next_version:=coalesce(current_version,0)+1;
  if current_version is null then
    insert into public.workouts(id,name,instructions,version)
    values(target,btrim(workout_name),btrim(general_instructions),next_version);
  else
    update public.workouts set name=btrim(workout_name),instructions=btrim(general_instructions),
      version=next_version,updated_at=clock_timestamp() where id=target;
  end if;
  delete from public.workout_items where workout_id=target
    and id not in(select (x->>'id')::uuid from jsonb_array_elements(items) x);
  insert into public.workout_items(id,workout_id,exercise_id,position,sets,repetitions,rest_seconds,coach_notes)
  select (x->>'id')::uuid,target,(x->>'exercise_id')::uuid,ordinality::integer,
    (x->>'sets')::integer,btrim(x->>'repetitions'),(x->>'rest_seconds')::integer,btrim(x->>'coach_notes')
  from jsonb_array_elements(items) with ordinality as rows(x,ordinality)
  on conflict(id) do update set position=excluded.position,sets=excluded.sets,
    repetitions=excluded.repetitions,rest_seconds=excluded.rest_seconds,coach_notes=excluded.coach_notes
  where public.workout_items.workout_id=excluded.workout_id;
  get diagnostics saved_count = row_count;
  if saved_count<>jsonb_array_length(items) then
    raise exception 'Item identity conflict' using errcode='40001';
  end if;

  insert into public.workout_revisions(workout_id,version,created_by,snapshot)
  select target,next_version,auth.uid(),jsonb_build_object(
    'schema_version',1,'name',btrim(workout_name),'instructions',btrim(general_instructions),
    'items',(select jsonb_agg(jsonb_build_object(
      'id',wi.id,'exercise_id',wi.exercise_id,'position',wi.position,'sets',wi.sets,
      'repetitions',wi.repetitions,'rest_seconds',wi.rest_seconds,'coach_notes',wi.coach_notes,
      'exercise',jsonb_build_object('name',e.name,'muscle_group',e.muscle_group,'equipment',e.equipment,
        'instructions',e.instructions,'video_url',e.video_url,'image_path',e.image_path)
    ) order by wi.position) from public.workout_items wi join public.exercises e on e.id=wi.exercise_id where wi.workout_id=target)
  );
  insert into public.workout_audit(workout_id,version,actor_id,action,source_workout_id)
  values(target,next_version,auth.uid(),case when source_id is not null then 'workout.duplicated'
    when current_version is null then 'workout.created' else 'workout.updated' end,source_id);
  return target;
end;
$$;
revoke all on function private.persist_workout(uuid,text,text,jsonb,integer,uuid) from public,anon,authenticated;

create function public.save_workout(target uuid,workout_name text,general_instructions text,items jsonb,expected_version integer)
returns uuid language sql security definer set search_path='' as $$
  select private.persist_workout(target,workout_name,general_instructions,items,expected_version,null);
$$;
revoke all on function public.save_workout(uuid,text,text,jsonb,integer) from public,anon;
grant execute on function public.save_workout(uuid,text,text,jsonb,integer) to authenticated;

create function public.duplicate_workout(source_id uuid,target uuid,source_version integer,new_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare source public.workouts; copied_items jsonb;
begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if source_id=target then raise exception 'A copy requires a new identifier' using errcode='22023'; end if;
  select * into source from public.workouts where id=source_id for share;
  if not found or source.version is distinct from source_version then
    raise exception 'Source changed; reload' using errcode='40001';
  end if;
  select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'exercise_id',exercise_id,
    'sets',sets,'repetitions',repetitions,'rest_seconds',rest_seconds,'coach_notes',coach_notes) order by position)
    into copied_items from public.workout_items where workout_id=source_id;
  return private.persist_workout(target,new_name,source.instructions,copied_items,0,source_id);
end;
$$;
revoke all on function public.duplicate_workout(uuid,uuid,integer,text) from public,anon;
grant execute on function public.duplicate_workout(uuid,uuid,integer,text) to authenticated;
commit;
