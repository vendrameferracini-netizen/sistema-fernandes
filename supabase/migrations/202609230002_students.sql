create table public.students (
  id uuid primary key references public.profiles(id) on delete restrict,
  email text not null unique check (email = lower(trim(email))),
  phone text not null default '' check (char_length(phone) <= 32),
  birth_date date check (birth_date >= date '1900-01-01'),
  objective text not null default '' check (char_length(objective) <= 1000),
  start_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.student_admin_notes (
  student_id uuid primary key references public.students(id) on delete restrict,
  notes text not null default '' check (char_length(notes) <= 5000)
);
create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete restrict,
  student_id uuid references public.students(id) on delete restrict,
  action text not null,
  occurred_at timestamptz not null default now()
);
create index students_start_date_idx on public.students(start_date);
create index admin_audit_student_idx on public.admin_audit(student_id, occurred_at desc);
alter table public.students enable row level security;
alter table public.student_admin_notes enable row level security;
alter table public.admin_audit enable row level security;
revoke all on public.students, public.student_admin_notes, public.admin_audit from anon, authenticated;
grant select on public.students, public.student_admin_notes, public.admin_audit to authenticated;
grant all on public.students, public.student_admin_notes, public.admin_audit to service_role;
grant usage, select on sequence public.admin_audit_id_seq to service_role;

create policy students_read on public.students for select to authenticated
using ((select private.is_admin()) or private.is_active_student(id));
create policy notes_admin_read on public.student_admin_notes for select to authenticated
using ((select private.is_admin()));
create policy audit_admin_read on public.admin_audit for select to authenticated
using ((select private.is_admin()));

-- Atomic onboarding, callable only by the server after an authenticated admin check.
create function public.provision_student(
  actor uuid, student uuid, student_email text, student_name text, student_phone text,
  student_birth date, student_objective text, student_start date, student_notes text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id = actor and role = 'admin' and active) then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if student_birth > current_date then raise exception 'Invalid birth date'; end if;
  insert into public.profiles(id, full_name, role) values(student, student_name, 'student');
  insert into public.students(id, email, phone, birth_date, objective, start_date)
    values(student, lower(trim(student_email)), student_phone, student_birth, student_objective, student_start);
  insert into public.student_admin_notes(student_id, notes) values(student, student_notes);
  insert into public.admin_audit(actor_id, student_id, action) values(actor, student, 'student.created');
end;
$$;
revoke all on function public.provision_student(uuid,uuid,text,text,text,date,text,date,text) from public, anon, authenticated;
grant execute on function public.provision_student(uuid,uuid,text,text,text,date,text,date,text) to service_role;

-- The administrator can edit allowed columns atomically, with a server-side check.
create function public.update_student(
  student uuid, student_name text, student_phone text, student_birth date,
  student_objective text, student_start date, student_notes text, student_active boolean
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if not exists(select 1 from public.profiles p join public.students s on s.id = p.id where p.id = student and p.role = 'student') then
    raise exception 'Student not found';
  end if;
  if student_birth > current_date then raise exception 'Invalid birth date'; end if;
  update public.profiles set full_name = student_name, active = student_active where id = student;
  update public.students set phone = student_phone, birth_date = student_birth,
    objective = student_objective, start_date = student_start, updated_at = now() where id = student;
  update public.student_admin_notes set notes = student_notes where student_id = student;
  insert into public.admin_audit(actor_id, student_id, action) values(auth.uid(), student, 'student.updated');
end;
$$;
revoke all on function public.update_student(uuid,text,text,date,text,date,text,boolean) from public, anon;
grant execute on function public.update_student(uuid,text,text,date,text,date,text,boolean) to authenticated;
