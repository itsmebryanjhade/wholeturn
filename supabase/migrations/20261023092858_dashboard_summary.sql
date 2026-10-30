create or replace function private.get_dashboard_summary(
  p_start_date date,
  p_end_date date,
  p_time_zone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_start timestamptz;
  v_end timestamptz;
  v_now timestamptz := transaction_timestamp();
  v_transition_count bigint;
  v_role_seconds jsonb;
  v_energy_observations jsonb;
  v_value_alignment jsonb;
  v_active_session_id uuid;
begin
  if v_user_id is null then raise exception using message = 'AUTH_REQUIRED', errcode = 'P0001'; end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception using message = 'INVALID_DATE_RANGE', errcode = 'P0001';
  end if;
  if p_time_zone is null or length(btrim(p_time_zone)) = 0
    or not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone) then
    raise exception using message = 'INVALID_TIME_ZONE', errcode = 'P0001';
  end if;

  v_start := p_start_date::timestamp at time zone p_time_zone;
  v_end := (p_end_date + 1)::timestamp at time zone p_time_zone;

  select count(*) into v_transition_count
  from public.transitions t
  where t.user_id = v_user_id and t.switched_at >= v_start and t.switched_at < v_end;

  select coalesce(jsonb_agg(
    jsonb_build_object('role_id', r.id, 'role_name', r.name, 'seconds', time_data.seconds)
    order by r.created_at, r.id
  ), '[]'::jsonb)
  into v_role_seconds
  from public.roles r
  left join lateral (
    select coalesce(floor(sum(extract(epoch from
      least(coalesce(s.ended_at, v_now), v_end) - greatest(s.started_at, v_start)
    ))), 0)::bigint as seconds
    from public.role_sessions s
    where s.user_id = v_user_id and s.role_id = r.id
      and s.started_at < v_end and coalesce(s.ended_at, v_now) > v_start
  ) time_data on true
  where r.user_id = v_user_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'before', t.energy_before,
      'after', t.energy_after,
      'switched_at', to_char(t.switched_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) order by t.switched_at
  ), '[]'::jsonb)
  into v_energy_observations
  from public.transitions t
  where t.user_id = v_user_id and t.switched_at >= v_start and t.switched_at < v_end;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'value_id', v.id,
      'label', v.label,
      'tagged_count', coalesce(tagged.tagged_count, 0),
      'transition_count', v_transition_count
    ) order by v.created_at, v.id
  ), '[]'::jsonb)
  into v_value_alignment
  from public.core_values v
  left join lateral (
    select count(*)::bigint as tagged_count
    from public.transition_values tv
    join public.transitions t on t.user_id = tv.user_id and t.id = tv.transition_id
    where tv.user_id = v_user_id and tv.value_id = v.id
      and t.switched_at >= v_start and t.switched_at < v_end
  ) tagged on true
  where v.user_id = v_user_id;

  select s.id into v_active_session_id
  from public.role_sessions s
  where s.user_id = v_user_id and s.ended_at is null
  limit 1;

  return jsonb_build_object(
    'role_seconds', v_role_seconds,
    'transition_count', v_transition_count,
    'energy_observations', v_energy_observations,
    'value_alignment', v_value_alignment,
    'active_session', case when v_active_session_id is null then null
      else private.session_wire(v_user_id, v_active_session_id) end
  );
end;
$$;

revoke all on function private.get_dashboard_summary(date, date, text) from public, anon;
grant execute on function private.get_dashboard_summary(date, date, text) to authenticated;

create or replace function public.get_dashboard_summary(
  p_start_date date,
  p_end_date date,
  p_time_zone text
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.get_dashboard_summary($1, $2, $3) $$;

revoke all on function public.get_dashboard_summary(date, date, text) from public, anon;
grant execute on function public.get_dashboard_summary(date, date, text) to authenticated;
