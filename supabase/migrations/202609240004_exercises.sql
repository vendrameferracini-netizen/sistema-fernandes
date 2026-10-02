-- Administrator-only exercise library. No media or workout assignments yet.
begin;
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  muscle_group text not null check (char_length(btrim(muscle_group)) between 2 and 80),
  equipment text not null default '' check (char_length(equipment) <= 120),
  instructions text not null default '' check (char_length(instructions) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.exercises enable row level security;
revoke all on public.exercises from public, anon, authenticated;
grant select on public.exercises to authenticated;
create policy exercises_admin_read on public.exercises for select to authenticated
  using ((select private.is_admin()));

create table public.exercise_audit (
  id bigint generated always as identity primary key,
  exercise_id uuid not null references public.exercises(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('exercise.created','exercise.updated')),
  occurred_at timestamptz not null default now()
);
alter table public.exercise_audit enable row level security;
revoke all on public.exercise_audit from public, anon, authenticated;
grant select on public.exercise_audit to authenticated;
create policy exercise_audit_admin_read on public.exercise_audit for select to authenticated
  using ((select private.is_admin()));

create function public.save_exercise(
  exercise_id uuid, exercise_name text, exercise_muscle_group text,
  exercise_equipment text, exercise_instructions text,
  expected_updated_at timestamptz
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if exercise_id is null then
    insert into public.exercises(name,muscle_group,equipment,instructions)
      values(btrim(exercise_name),btrim(exercise_muscle_group),btrim(exercise_equipment),btrim(exercise_instructions))
      returning id into saved_id;
  else
    update public.exercises set name=btrim(exercise_name), muscle_group=btrim(exercise_muscle_group),
      equipment=btrim(exercise_equipment), instructions=btrim(exercise_instructions), updated_at=clock_timestamp()
      where id=exercise_id and updated_at=expected_updated_at returning id into saved_id;
    if saved_id is null then
      raise exception 'Exercise changed or not found' using errcode = '40001';
    end if;
  end if;
  insert into public.exercise_audit(exercise_id,actor_id,action)
    values(saved_id,auth.uid(),case when exercise_id is null then 'exercise.created' else 'exercise.updated' end);
  return saved_id;
end;
$$;
revoke all on function public.save_exercise(uuid,text,text,text,text,timestamptz) from public,anon;
grant execute on function public.save_exercise(uuid,text,text,text,text,timestamptz) to authenticated;
commit;
