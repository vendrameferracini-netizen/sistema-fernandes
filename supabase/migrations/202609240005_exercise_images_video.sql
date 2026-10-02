-- One private image per exercise and a provider-independent external video link.
begin;
alter table public.exercises add column if not exists video_url text not null default '';
alter table public.exercises add column if not exists image_path text;
do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.exercises'::regclass and conname='exercise_video_url_format') then
    alter table public.exercises add constraint exercise_video_url_format check (
      video_url = '' or (char_length(video_url) <= 2048 and
      video_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$')
    );
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.exercises'::regclass and conname='exercise_image_path_format') then
    alter table public.exercises add constraint exercise_image_path_format check (
      image_path is null or image_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
    );
  end if;
end;
$$;

-- Reuse only a bucket with exactly the intended configuration. Never overwrite it.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('exercise-images','exercise-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
do $$
begin
  perform 1 from storage.buckets
  where id='exercise-images' and name='exercise-images' and public=false
    and file_size_limit=5242880
    and cardinality(allowed_mime_types)=3
    and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
  for update;
  if not found then
    raise exception 'Existing exercise-images bucket has incompatible settings; no changes applied.';
  end if;
end;
$$;

-- Recreate only the policies owned by this migration, within this transaction.
drop policy if exists exercise_images_read on storage.objects;
drop policy if exists exercise_images_upload on storage.objects;
drop policy if exists exercise_images_cleanup on storage.objects;
create policy exercise_images_read on storage.objects for select to authenticated
using (bucket_id='exercise-images' and (select private.is_admin()));
create policy exercise_images_upload on storage.objects for insert to authenticated
with check (bucket_id='exercise-images' and (select private.is_admin())
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  and exists(select 1 from public.exercises e where e.id::text=split_part(storage.objects.name,'/',1)));
-- No UPDATE policy: replacement always uploads a new object, avoiding stale caches.
create policy exercise_images_cleanup on storage.objects for delete to authenticated
using (bucket_id='exercise-images' and (select private.is_admin())
  and not exists(select 1 from public.exercises e where e.image_path=storage.objects.name));

create or replace function public.save_exercise_details(
  exercise_id uuid, exercise_name text, exercise_muscle_group text,
  exercise_equipment text, exercise_instructions text,
  expected_updated_at timestamptz, exercise_video_url text
) returns uuid language plpgsql security definer set search_path='' as $$
declare saved_id uuid;
begin
  if not private.is_admin() then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if exercise_id is null then
    insert into public.exercises(name,muscle_group,equipment,instructions,video_url)
    values(btrim(exercise_name),btrim(exercise_muscle_group),
      btrim(exercise_equipment),btrim(exercise_instructions),
      btrim(coalesce(exercise_video_url,'')))
    returning id into saved_id;
  else
    update public.exercises set
      name=btrim(exercise_name), muscle_group=btrim(exercise_muscle_group),
      equipment=btrim(exercise_equipment), instructions=btrim(exercise_instructions),
      video_url=btrim(coalesce(exercise_video_url,'')), updated_at=clock_timestamp()
    where id=exercise_id and updated_at=expected_updated_at
    returning id into saved_id;
    if saved_id is null then
      raise exception 'Exercise changed or not found' using errcode='40001';
    end if;
  end if;
  -- Exactly one audit entry, committed or rolled back together with all fields.
  insert into public.exercise_audit(exercise_id,actor_id,action)
  values(saved_id,auth.uid(),case when exercise_id is null
    then 'exercise.created' else 'exercise.updated' end);
  return saved_id;
end;
$$;
revoke all on function public.save_exercise_details(uuid,text,text,text,text,timestamptz,text) from public,anon;
grant execute on function public.save_exercise_details(uuid,text,text,text,text,timestamptz,text) to authenticated;

create or replace function public.set_exercise_image(exercise_id uuid, new_path text, expected_path text, expected_updated_at timestamptz)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare previous_path text; previous_updated_at timestamptz;
begin
  if not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select image_path,updated_at into previous_path,previous_updated_at from public.exercises where id=exercise_id for update;
  if not found or previous_path is distinct from expected_path or previous_updated_at is distinct from expected_updated_at then
    raise exception 'Image changed or exercise not found' using errcode='40001';
  end if;
  if new_path is null or new_path !~ ('^' || exercise_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
    raise exception 'Invalid image path' using errcode='22023';
  end if;
  perform 1 from storage.objects where bucket_id='exercise-images' and name=new_path
    and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
    and (metadata->>'size')::bigint between 1 and 5242880 for update;
  if not found then raise exception 'Uploaded image missing or invalid' using errcode='22023'; end if;
  update public.exercises set image_path=new_path, updated_at=clock_timestamp() where id=exercise_id;
  insert into public.exercise_audit(exercise_id,actor_id,action) values(exercise_id,auth.uid(),'exercise.updated');
  return (select updated_at from public.exercises where id=exercise_id);
end;
$$;
revoke all on function public.set_exercise_image(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.set_exercise_image(uuid,text,text,timestamptz) to authenticated;
commit;
