-- Institutional sharing image. NEW migration; apply only after review, after 010.
begin;
create table public.sharing_brand (
 id boolean primary key default true check(id),
 image_path text,
 version integer not null default 0 check(version>=0),
 updated_at timestamptz not null default now(),
 check(image_path is null or image_path ~ '^institutional/[0-9a-f-]{36}\.(jpg|png|webp)$')
);
insert into public.sharing_brand(id) values(true);
create table public.sharing_brand_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null references auth.users(id),
 image_path text not null,
 version integer not null,
 occurred_at timestamptz not null default now()
);
alter table public.sharing_brand enable row level security;
alter table public.sharing_brand_audit enable row level security;
revoke all on public.sharing_brand,public.sharing_brand_audit from anon,authenticated;
grant select on public.sharing_brand,public.sharing_brand_audit to authenticated;
create policy sharing_brand_read on public.sharing_brand for select to authenticated
 using(private.is_admin() or private.is_active_student(auth.uid()));
create policy sharing_brand_audit_read on public.sharing_brand_audit for select to authenticated using(private.is_admin());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('institutional-images','institutional-images',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
do $$ begin
 perform 1 from storage.buckets where id='institutional-images' and name='institutional-images' and public=false
 and file_size_limit=5242880 and cardinality(allowed_mime_types)=3 and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[] for update;
 if not found then raise exception 'Incompatible institutional-images bucket'; end if;
end $$;
create policy institutional_upload on storage.objects for insert to authenticated
 with check(bucket_id='institutional-images' and private.is_admin() and name ~ '^institutional/[0-9a-f-]{36}\.(jpg|png|webp)$');
create policy institutional_read on storage.objects for select to authenticated
 using(bucket_id='institutional-images' and (private.is_admin() or
 (private.is_active_student(auth.uid()) and exists(select 1 from public.sharing_brand b where b.image_path=storage.objects.name))));
-- Immutable uploads: no UPDATE/DELETE policy. Previous originals are retained for audit.
create function public.set_sharing_brand(new_path text,expected_version integer) returns integer
 language plpgsql security definer set search_path='' as $$
declare current_version integer;
begin
 if private.is_admin() is not true then raise exception 'Administrator required' using errcode='42501'; end if;
 select version into current_version from public.sharing_brand where id=true for update;
 if expected_version is null or expected_version<>current_version then raise exception 'Brand changed' using errcode='40001'; end if;
 if new_path is null or new_path !~ '^institutional/[0-9a-f-]{36}\.(jpg|png|webp)$' then raise exception 'Invalid path' using errcode='22023'; end if;
 perform 1 from storage.objects where bucket_id='institutional-images' and name=new_path
 and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
 and (metadata->>'size')::bigint between 1 and 5242880 for update;
 if not found then raise exception 'Invalid image' using errcode='22023'; end if;
 update public.sharing_brand set image_path=new_path,version=version+1,updated_at=clock_timestamp() where id=true;
 insert into public.sharing_brand_audit(actor_id,image_path,version) values(auth.uid(),new_path,current_version+1);
 return current_version+1;
end $$;
revoke all on function public.set_sharing_brand(text,integer) from public,anon;
grant execute on function public.set_sharing_brand(text,integer) to authenticated;
commit;
