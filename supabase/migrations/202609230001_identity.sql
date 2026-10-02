-- Stage 1: run once through versioned migrations, never reset an existing database.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(trim(full_name)) between 2 and 160),
  role text not null default 'student' check (role in ('admin', 'student')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index one_coach_only on public.profiles (role) where role = 'admin';
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and active);
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

create function private.is_active_student(student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select student_id = (select auth.uid()) and exists (
    select 1 from public.profiles where id = student_id and active and role = 'student'
  );
$$;
revoke all on function private.is_active_student(uuid) from public;
grant execute on function private.is_active_student(uuid) to authenticated, service_role;

create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
-- No client inserts, updates or deletes: role and active are backend-controlled.
