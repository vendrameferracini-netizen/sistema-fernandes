-- Incremental migration. No accounts, passwords or administrator are created here.
begin;
alter table public.profiles add column username text;
alter table public.profiles add column must_change_password boolean not null default true;
-- Preserve existing UUIDs and data; existing students receive collision-free initial usernames.
update public.profiles set username = case when role = 'admin' then 'filipe'
  else 'aluno_' || replace(id::text, '-', '') end;
alter table public.profiles alter column username set not null;
alter table public.profiles add constraint profiles_username_format
  check (username ~ '^[a-z][a-z0-9_]{2,39}$');
alter table public.profiles add constraint profiles_username_unique unique(username);
alter table public.students alter column email drop not null;

create table private.login_identities (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  auth_email text not null unique,
  credential_version bigint not null default 1,
  operation_id uuid,
  operation_actor uuid references public.profiles(id),
  operation_kind text check (operation_kind in ('change','reset')),
  operation_started_at timestamptz
);
insert into private.login_identities(user_id, auth_email)
  select p.id, u.email from public.profiles p join auth.users u on u.id = p.id where u.email is not null;
create table private.app_sessions (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete restrict,
  credential_version bigint not null,
  created_at timestamptz not null default now()
);
create index app_sessions_user_idx on private.app_sessions(user_id);
create table private.auth_limits (
  bucket text primary key, attempts integer not null, expires_at timestamptz not null
);
alter table private.login_identities enable row level security;
alter table private.app_sessions enable row level security;
alter table private.auth_limits enable row level security;
revoke all on private.login_identities, private.app_sessions, private.auth_limits from public, anon, authenticated;
-- Only SECURITY DEFINER functions owned by the migration role access these tables.

create function private.session_valid(subject uuid, session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from private.app_sessions s
    join private.login_identities i on i.user_id = s.user_id
    join public.profiles p on p.id = s.user_id
    join auth.sessions a on a.id = s.session_id and a.user_id = s.user_id
    where s.user_id = subject and s.session_id = session
      and s.credential_version = i.credential_version and i.operation_id is null and p.active);
$$;
revoke all on function private.session_valid(uuid,uuid) from public, anon, authenticated;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid())
    and role = 'admin' and active and not must_change_password)
    and private.session_valid((select auth.uid()), nullif(auth.jwt()->>'session_id','')::uuid);
$$;
create or replace function private.is_active_student(student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select student_id = (select auth.uid()) and exists (
    select 1 from public.profiles where id = student_id and active and role = 'student' and not must_change_password
  ) and private.session_valid(student_id, nullif(auth.jwt()->>'session_id','')::uuid);
$$;

-- Counters and lookup are server-only; no public username enumeration endpoint.
create function public.my_access_profile() returns setof public.profiles
language sql stable security definer set search_path = '' as $$
  select * from public.profiles where id = auth.uid()
    and private.session_valid(auth.uid(),nullif(auth.jwt()->>'session_id','')::uuid);
$$;
revoke all on function public.my_access_profile() from public,anon;
grant execute on function public.my_access_profile() to authenticated;
create function public.consume_auth_limit(bucket_key text, maximum integer, seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if length(bucket_key) > 128 or maximum < 1 or seconds < 1 then raise exception 'Invalid bucket'; end if;
  delete from private.auth_limits where expires_at < now() - interval '1 day';
  insert into private.auth_limits as limits(bucket,attempts,expires_at)
    values(bucket_key,1,now() + make_interval(secs => seconds))
    on conflict(bucket) do update set
      attempts = case when limits.expires_at <= now() then 1 else limits.attempts + 1 end,
      expires_at = case when limits.expires_at <= now() then now() + make_interval(secs => seconds) else limits.expires_at end
    returning attempts into n;
  return n <= maximum;
end;
$$;
create function public.lookup_login(login_name text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',p.id,'email',i.auth_email,'version',i.credential_version)
    from public.profiles p join private.login_identities i on i.user_id = p.id
    where p.username = login_name and p.active and i.operation_id is null;
$$;
create function public.register_app_session(subject uuid, session uuid, expected_version bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from private.login_identities i join public.profiles p on p.id = i.user_id
    where i.user_id = subject and i.credential_version = expected_version and i.operation_id is null and p.active
    for update of i;
  if not found then return false; end if;
  if not exists(select 1 from auth.sessions where id = session and user_id = subject) then return false; end if;
  insert into private.app_sessions(session_id,user_id,credential_version) values(session,subject,expected_version)
    on conflict(session_id) do nothing;
  return private.session_valid(subject,session);
end;
$$;
create function public.access_context(subject uuid, session uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id',p.id,'role',p.role,'must_change_password',p.must_change_password,
      'email',i.auth_email,'version',i.credential_version)
    from public.profiles p join private.login_identities i on i.user_id = p.id
    where p.id = subject and private.session_valid(subject,session);
$$;

-- Supersede the email-invite provisioner, including calls from a previously deployed function.
revoke execute on function public.provision_student(uuid,uuid,text,text,text,date,text,date,text) from service_role;
create function public.provision_username_student(actor uuid, actor_session uuid, student uuid,
  login_name text, technical_email text, student_name text, student_phone text,
  student_birth date, student_objective text, student_start date, student_notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.session_valid(actor,actor_session) or not exists(select 1 from public.profiles
    where id = actor and role = 'admin' and active and not must_change_password) then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if not exists(select 1 from auth.users where id = student and email = technical_email) then raise exception 'Identity mismatch'; end if;
  if student_birth > current_date then raise exception 'Invalid birth date'; end if;
  insert into public.profiles(id,full_name,role,username,must_change_password)
    values(student,student_name,'student',login_name,true);
  insert into private.login_identities(user_id,auth_email) values(student,technical_email);
  insert into public.students(id,email,phone,birth_date,objective,start_date)
    values(student,null,student_phone,student_birth,student_objective,student_start);
  insert into public.student_admin_notes(student_id,notes) values(student,student_notes);
  insert into public.admin_audit(actor_id,student_id,action) values(actor,student,'student.created.username');
end;
$$;

-- Invalidate all app sessions BEFORE contacting Auth; serialize credential operations.
create function public.begin_password_operation(actor uuid, actor_session uuid, target uuid,
  kind text, operation uuid, expected_version bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare version bigint;
begin
  if not private.session_valid(actor,actor_session) then raise exception 'Invalid session' using errcode = '42501'; end if;
  if kind = 'change' then
    if actor <> target then raise exception 'Forbidden' using errcode = '42501'; end if;
  elsif kind = 'reset' then
    if not exists(select 1 from public.profiles where id = actor and role = 'admin' and active and not must_change_password)
       or not exists(select 1 from public.profiles where id = target and role = 'student') then
      raise exception 'Forbidden' using errcode = '42501';
    end if;
  else raise exception 'Invalid operation'; end if;
  update private.login_identities set credential_version = credential_version + 1,
    operation_id = operation, operation_actor = actor, operation_kind = kind, operation_started_at = now()
    where user_id = target and operation_id is null and credential_version = expected_version
    returning credential_version into version;
  if not found then raise exception 'Credential operation already pending or stale'; end if;
  update public.profiles set must_change_password = true where id = target;
  insert into public.admin_audit(actor_id,student_id,action)
    values(actor,(select id from public.students where id = target),'password.' || kind || '.started');
  return version;
end;
$$;

-- Any Auth password change (including dashboard recovery or direct Auth API calls)
-- advances the version; clients cannot clear the forced-change flag themselves.
create function private.track_auth_credentials() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email and exists(select 1 from private.login_identities where user_id = new.id) then
    raise exception 'Managed login identity cannot be changed';
  end if;
  if new.encrypted_password is distinct from old.encrypted_password then
    update private.login_identities set credential_version = credential_version + 1 where user_id = new.id;
    if found then
      update public.profiles set must_change_password = true where id = new.id;
      insert into public.admin_audit(actor_id,student_id,action)
        values(null,(select id from public.students where id = new.id),'auth.password.changed');
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.track_auth_credentials() from public, anon, authenticated;
create trigger fernandes_auth_credentials after update of encrypted_password,email on auth.users
  for each row execute function private.track_auth_credentials();

create function public.finish_password_operation(target uuid, operation uuid, expected_version bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare op private.login_identities;
begin
  select * into op from private.login_identities where user_id = target for update;
  if op.operation_id is distinct from operation or op.operation_id is null or op.credential_version <> expected_version then
    raise exception 'Credential change needs reconciliation';
  end if;
  update public.profiles set must_change_password = (op.operation_kind = 'reset') where id = target;
  update private.login_identities set operation_id=null,operation_actor=null,operation_kind=null,operation_started_at=null where user_id=target;
  insert into public.admin_audit(actor_id,student_id,action)
    values(op.operation_actor,(select id from public.students where id=target),'password.' || op.operation_kind || '.completed');
end;
$$;

-- Explicit endpoint list prevents accidental exposure of service-only RPCs.
revoke all on function public.consume_auth_limit(text,integer,integer), public.lookup_login(text),
 public.register_app_session(uuid,uuid,bigint), public.access_context(uuid,uuid),
 public.provision_username_student(uuid,uuid,uuid,text,text,text,text,date,text,date,text),
 public.begin_password_operation(uuid,uuid,uuid,text,uuid,bigint), public.finish_password_operation(uuid,uuid,bigint)
 from public,anon,authenticated;
grant execute on function public.consume_auth_limit(text,integer,integer), public.lookup_login(text),
 public.register_app_session(uuid,uuid,bigint), public.access_context(uuid,uuid),
 public.provision_username_student(uuid,uuid,uuid,text,text,text,text,date,text,date,text),
 public.begin_password_operation(uuid,uuid,uuid,text,uuid,bigint), public.finish_password_operation(uuid,uuid,bigint)
 to service_role;
commit;
