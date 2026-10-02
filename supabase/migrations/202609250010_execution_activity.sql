-- Read-only reporting for the complete training experience. Apply AFTER 009.
begin;
create index execution_closed_student_date on public.workout_sessions(student_id,performed_on desc,started_at desc,id) where status<>'in_progress';
create function public.execution_activity(student uuid,month_start date,page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare today date:=(statement_timestamp() at time zone 'America/Sao_Paulo')::date; result jsonb;
begin
 if (private.is_admin() or private.is_active_student(student)) is not true then raise exception 'Activity access denied' using errcode='42501'; end if;
 if student is null or month_start is null or month_start<>date_trunc('month',month_start)::date or month_start<'1900-01-01'::date or month_start>'2200-12-01'::date or page is null or page<0 or page>100000 then raise exception 'Invalid activity filter' using errcode='22023'; end if;
 with sessions as materialized (
  select * from public.workout_sessions where student_id=student and status<>'in_progress'
 ), history as (
  select id,started_at,ended_at,performed_on,duration_seconds,status,difficulty,feedback,program_version,workout_version,
   snapshot->>'program_name' as program_name,snapshot->'entry'->>'label' as label,snapshot->'entry'->'workout'->>'name' as workout_name
  from sessions order by started_at desc,id desc limit 20 offset page*20
 ), days as (
  select performed_on as day,count(*) as total,count(*) filter(where status='completed') as completed
  from sessions where performed_on>=month_start and performed_on<(month_start+interval '1 month')::date group by performed_on
 )
 select jsonb_build_object(
  'today',today,'month',month_start,'page',page,
  'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.started_at desc,h.id desc) from history h),'[]'::jsonb),
  'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from days d),'[]'::jsonb),
  'stats',(select jsonb_build_object('total',count(*),'completed',count(*) filter(where status='completed'),
   'not_completed',count(*) filter(where status<>'completed'),'duration_seconds',coalesce(sum(duration_seconds),0),
   'average_seconds',coalesce(round(avg(duration_seconds)),0),
   'week',count(*) filter(where performed_on>=date_trunc('week',today)::date and performed_on<=today),
   'month',count(*) filter(where performed_on>=month_start and performed_on<(month_start+interval '1 month')::date),
   'month_completed',count(*) filter(where performed_on>=month_start and performed_on<(month_start+interval '1 month')::date and status='completed'),
   'month_not_completed',count(*) filter(where performed_on>=month_start and performed_on<(month_start+interval '1 month')::date and status<>'completed'),
   'easy',count(*) filter(where difficulty='easy'),'balanced',count(*) filter(where difficulty='balanced'),'hard',count(*) filter(where difficulty='hard'),
   'unrated',count(*) filter(where difficulty is null)) from sessions)
 ) into result;
 return result;
end;
$$;
revoke all on function public.execution_activity(uuid,date,integer) from public,anon;
grant execute on function public.execution_activity(uuid,date,integer) to authenticated;
commit;
