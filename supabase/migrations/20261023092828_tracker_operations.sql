create or replace function private.session_wire(p_user_id uuid, p_session_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'role_id', s.role_id,
    'role_name', r.name,
    'started_at', to_char(s.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'ended_at', case when s.ended_at is null then null
      else to_char(s.ended_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
  )
  from public.role_sessions s
  join public.roles r on r.user_id = s.user_id and r.id = s.role_id
  where s.user_id = p_user_id and s.id = p_session_id
$$;

create or replace function private.transition_wire(p_user_id uuid, p_transition_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'outgoing_session_id', t.outgoing_session_id,
    'incoming_session_id', t.incoming_session_id,
    'switched_at', to_char(t.switched_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'energy_before', t.energy_before,
    'energy_after', t.energy_after,
    'focus_intention', t.focus_intention,
    'value_ids', coalesce((
      select jsonb_agg(tv.value_id order by tv.value_id)
      from public.transition_values tv
      where tv.user_id = t.user_id and tv.transition_id = t.id
    ), '[]'::jsonb),
    'boundary_note', t.boundary_note
  )
  from public.transitions t
  where t.user_id = p_user_id and t.id = p_transition_id
$$;

create or replace function private.start_role_session(p_role_id uuid, p_started_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then raise exception using message = 'AUTH_REQUIRED', errcode = 'P0001'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  if p_role_id is null or not exists (
    select 1 from public.roles r
    where r.id = p_role_id and r.user_id = v_user_id and r.archived_at is null
  ) then
    raise exception using message = 'ROLE_UNAVAILABLE', errcode = 'P0001';
  end if;
  if p_started_at is null or p_started_at > transaction_timestamp() then
    raise exception using message = 'INVALID_TIME_ORDER', errcode = 'P0001';
  end if;
  if exists (select 1 from public.role_sessions s where s.user_id = v_user_id and s.ended_at is null) then
    raise exception using message = 'ACTIVE_SESSION_EXISTS', errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.role_sessions s
    where s.user_id = v_user_id and s.ended_at > p_started_at
  ) then
    raise exception using message = 'SESSION_OVERLAP', errcode = 'P0001';
  end if;

  insert into public.role_sessions (user_id, role_id, started_at)
  values (v_user_id, p_role_id, p_started_at)
  returning id into v_session_id;
  return private.session_wire(v_user_id, v_session_id);
end;
$$;

create or replace function private.confirm_active_session_return(
  p_session_id uuid,
  p_corrected_started_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session public.role_sessions%rowtype;
  v_previous public.transitions%rowtype;
begin
  if v_user_id is null then raise exception using message = 'AUTH_REQUIRED', errcode = 'P0001'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  select * into v_session from public.role_sessions s
  where s.id = p_session_id and s.user_id = v_user_id for update;
  if not found then raise exception using message = 'NOT_FOUND', errcode = 'P0001'; end if;
  if v_session.ended_at is not null then
    raise exception using message = 'NO_ACTIVE_SESSION', errcode = 'P0001';
  end if;
  if p_corrected_started_at is null or p_corrected_started_at > transaction_timestamp() then
    raise exception using message = 'INVALID_TIME_ORDER', errcode = 'P0001';
  end if;

  select * into v_previous from public.transitions t
  where t.user_id = v_user_id and t.incoming_session_id = v_session.id for update;
  if found then
    perform 1 from public.role_sessions s
      where s.user_id = v_user_id and s.id = v_previous.outgoing_session_id for update;
    if p_corrected_started_at <= (
      select s.started_at from public.role_sessions s
      where s.user_id = v_user_id and s.id = v_previous.outgoing_session_id
    ) then
      raise exception using message = 'INVALID_TIME_ORDER', errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.role_sessions s
      where s.user_id = v_user_id
        and s.id not in (v_session.id, v_previous.outgoing_session_id)
        and (s.ended_at is null or s.ended_at > p_corrected_started_at)
    ) then
      raise exception using message = 'SESSION_OVERLAP', errcode = 'P0001';
    end if;
    update public.role_sessions set ended_at = p_corrected_started_at
      where user_id = v_user_id and id = v_previous.outgoing_session_id;
    update public.transitions set switched_at = p_corrected_started_at
      where user_id = v_user_id and id = v_previous.id;
  else
    if exists (
      select 1 from public.role_sessions s
      where s.user_id = v_user_id and s.id <> v_session.id
        and (s.ended_at is null or s.ended_at > p_corrected_started_at)
    ) then
      raise exception using message = 'SESSION_OVERLAP', errcode = 'P0001';
    end if;
  end if;

  update public.role_sessions set started_at = p_corrected_started_at
    where user_id = v_user_id and id = v_session.id;
  return private.session_wire(v_user_id, v_session.id);
end;
$$;

create or replace function private.switch_role_session(
  p_outgoing_session_id uuid,
  p_incoming_role_id uuid,
  p_switched_at timestamptz,
  p_energy_before smallint,
  p_energy_after smallint,
  p_focus_intention text,
  p_value_ids uuid[],
  p_boundary_note text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_outgoing public.role_sessions%rowtype;
  v_incoming_id uuid;
  v_transition_id uuid;
  v_existing public.transitions%rowtype;
  v_existing_incoming public.role_sessions%rowtype;
  v_value_ids uuid[];
  v_existing_value_ids uuid[];
begin
  if v_user_id is null then raise exception using message = 'AUTH_REQUIRED', errcode = 'P0001'; end if;
  if p_request_id is null or p_value_ids is null then
    raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
  end if;
  if cardinality(p_value_ids) <> (select count(distinct x) from unnest(p_value_ids) x) then
    raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  select * into v_existing from public.transitions t
  where t.user_id = v_user_id and t.request_id = p_request_id for update;
  if found then
    select * into v_existing_incoming from public.role_sessions s
      where s.user_id = v_user_id and s.id = v_existing.incoming_session_id;
    select coalesce(array_agg(tv.value_id order by tv.value_id), array[]::uuid[])
      into v_existing_value_ids
      from public.transition_values tv
      where tv.user_id = v_user_id and tv.transition_id = v_existing.id;
    select coalesce(array_agg(x order by x), array[]::uuid[])
      into v_value_ids from unnest(p_value_ids) x;
    if v_existing.outgoing_session_id is distinct from p_outgoing_session_id
      or v_existing_incoming.role_id is distinct from p_incoming_role_id
      or v_existing.switched_at is distinct from p_switched_at
      or v_existing.energy_before is distinct from p_energy_before
      or v_existing.energy_after is distinct from p_energy_after
      or v_existing.focus_intention is distinct from btrim(p_focus_intention)
      or v_existing.boundary_note is distinct from p_boundary_note
      or v_existing_value_ids is distinct from v_value_ids then
      raise exception using message = 'REQUEST_ID_REUSED', errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'closed_session', private.session_wire(v_user_id, v_existing.outgoing_session_id),
      'incoming_session', private.session_wire(v_user_id, v_existing.incoming_session_id),
      'transition', private.transition_wire(v_user_id, v_existing.id)
    );
  end if;

  select * into v_outgoing from public.role_sessions s
    where s.id = p_outgoing_session_id and s.user_id = v_user_id for update;
  if not found then raise exception using message = 'NOT_FOUND', errcode = 'P0001'; end if;
  if v_outgoing.ended_at is not null then
    raise exception using message = 'NO_ACTIVE_SESSION', errcode = 'P0001';
  end if;
  if p_switched_at is null or p_switched_at <= v_outgoing.started_at
    or p_switched_at > transaction_timestamp() then
    raise exception using message = 'INVALID_TIME_ORDER', errcode = 'P0001';
  end if;
  if p_energy_before not between 1 and 5 or p_energy_after not between 1 and 5
    or p_focus_intention is null or length(btrim(p_focus_intention)) = 0 then
    raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.roles r
    where r.id = p_incoming_role_id and r.user_id = v_user_id and r.archived_at is null
  ) then raise exception using message = 'ROLE_UNAVAILABLE', errcode = 'P0001'; end if;
  if p_incoming_role_id = v_outgoing.role_id then
    raise exception using message = 'SAME_ROLE', errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.role_sessions s
    where s.user_id = v_user_id and s.id <> v_outgoing.id
      and (s.ended_at is null or s.ended_at > p_switched_at)
  ) then raise exception using message = 'SESSION_OVERLAP', errcode = 'P0001'; end if;
  if exists (
    select 1 from unnest(p_value_ids) requested(value_id)
    left join public.core_values v on v.user_id = v_user_id
      and v.id = requested.value_id and v.archived_at is null
    where v.id is null
  ) then raise exception using message = 'VALUE_UNAVAILABLE', errcode = 'P0001'; end if;

  update public.role_sessions set ended_at = p_switched_at
    where user_id = v_user_id and id = v_outgoing.id;
  insert into public.role_sessions (user_id, role_id, started_at)
    values (v_user_id, p_incoming_role_id, p_switched_at)
    returning id into v_incoming_id;
  insert into public.transitions (
    user_id, outgoing_session_id, incoming_session_id, switched_at,
    energy_before, energy_after, focus_intention, boundary_note, request_id
  ) values (
    v_user_id, v_outgoing.id, v_incoming_id, p_switched_at,
    p_energy_before, p_energy_after, btrim(p_focus_intention), p_boundary_note, p_request_id
  ) returning id into v_transition_id;
  insert into public.transition_values (user_id, transition_id, value_id)
    select v_user_id, v_transition_id, requested.value_id
    from unnest(p_value_ids) requested(value_id);

  return jsonb_build_object(
    'closed_session', private.session_wire(v_user_id, v_outgoing.id),
    'incoming_session', private.session_wire(v_user_id, v_incoming_id),
    'transition', private.transition_wire(v_user_id, v_transition_id)
  );
end;
$$;

create or replace function private.update_transition(p_transition_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_transition public.transitions%rowtype;
  v_outgoing public.role_sessions%rowtype;
  v_incoming public.role_sessions%rowtype;
  v_switched_at timestamptz;
  v_energy_before smallint;
  v_energy_after smallint;
  v_focus_intention text;
  v_boundary_note text;
  v_value_ids uuid[];
  v_existing_archived_ids uuid[];
  v_keys text[];
begin
  if v_user_id is null then raise exception using message = 'AUTH_REQUIRED', errcode = 'P0001'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
  end if;
  select array_agg(k) into v_keys from jsonb_object_keys(p_patch) k;
  if exists (select 1 from unnest(v_keys) k where k not in (
    'switched_at', 'energy_before', 'energy_after', 'focus_intention', 'value_ids', 'boundary_note'
  )) then raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  select * into v_transition from public.transitions t
    where t.user_id = v_user_id and t.id = p_transition_id for update;
  if not found then raise exception using message = 'NOT_FOUND', errcode = 'P0001'; end if;
  v_switched_at := v_transition.switched_at;
  v_energy_before := v_transition.energy_before;
  v_energy_after := v_transition.energy_after;
  v_focus_intention := v_transition.focus_intention;
  v_boundary_note := v_transition.boundary_note;

  if p_patch ? 'switched_at' then
    begin
      if jsonb_typeof(p_patch->'switched_at') <> 'string' then
        raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
      end if;
      v_switched_at := (p_patch->>'switched_at')::timestamptz;
    exception when others then
      raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
    end;
  end if;
  if p_patch ? 'energy_before' then
    begin
      if jsonb_typeof(p_patch->'energy_before') <> 'number'
        or (p_patch->>'energy_before')::numeric <> trunc((p_patch->>'energy_before')::numeric) then
        raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
      end if;
      v_energy_before := (p_patch->>'energy_before')::smallint;
    exception when others then
      raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
    end;
  end if;
  if p_patch ? 'energy_after' then
    begin
      if jsonb_typeof(p_patch->'energy_after') <> 'number'
        or (p_patch->>'energy_after')::numeric <> trunc((p_patch->>'energy_after')::numeric) then
        raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
      end if;
      v_energy_after := (p_patch->>'energy_after')::smallint;
    exception when others then
      raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
    end;
  end if;
  if v_energy_before not between 1 and 5 or v_energy_after not between 1 and 5 then
    raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
  end if;
  if p_patch ? 'focus_intention' then
    if jsonb_typeof(p_patch->'focus_intention') <> 'string'
      or length(btrim(p_patch->>'focus_intention')) = 0 then
      raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
    end if;
    v_focus_intention := btrim(p_patch->>'focus_intention');
  end if;
  if p_patch ? 'boundary_note' then
    if jsonb_typeof(p_patch->'boundary_note') not in ('string', 'null') then
      raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
    end if;
    v_boundary_note := p_patch->>'boundary_note';
  end if;
  if p_patch ? 'value_ids' then
    if jsonb_typeof(p_patch->'value_ids') <> 'array' then
      raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
    end if;
    begin
      select coalesce(array_agg(item.value_id order by item.value_id), array[]::uuid[])
        into v_value_ids
        from jsonb_array_elements_text(p_patch->'value_ids') values_json(value)
        cross join lateral (select values_json.value::uuid as value_id) item;
    exception when others then
      raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
    end;
    if cardinality(v_value_ids) <> (select count(distinct id) from unnest(v_value_ids) id) then
      raise exception using message = 'VALIDATION_ERROR', errcode = 'P0001';
    end if;
    select coalesce(array_agg(tv.value_id order by tv.value_id), array[]::uuid[])
      into v_existing_archived_ids
      from public.transition_values tv
      join public.core_values cv on cv.user_id = tv.user_id and cv.id = tv.value_id
      where tv.user_id = v_user_id and tv.transition_id = v_transition.id and cv.archived_at is not null;
    if exists (
      select 1 from unnest(v_value_ids) requested(value_id)
      left join public.core_values cv on cv.user_id = v_user_id and cv.id = requested.value_id
      where cv.id is null
        or (cv.archived_at is not null and not (requested.value_id = any(v_existing_archived_ids)))
    ) then raise exception using message = 'VALUE_UNAVAILABLE', errcode = 'P0001'; end if;
  end if;

  select * into v_outgoing from public.role_sessions s
    where s.user_id = v_user_id and s.id = v_transition.outgoing_session_id for update;
  select * into v_incoming from public.role_sessions s
    where s.user_id = v_user_id and s.id = v_transition.incoming_session_id for update;
  if not found or v_outgoing.id is null then
    raise exception using message = 'NOT_FOUND', errcode = 'P0001';
  end if;
  if v_switched_at is distinct from v_transition.switched_at then
    if v_switched_at <= v_outgoing.started_at or v_switched_at > transaction_timestamp()
      or (v_incoming.ended_at is not null and v_switched_at >= v_incoming.ended_at) then
      raise exception using message = 'INVALID_TIME_ORDER', errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.role_sessions s
      where s.user_id = v_user_id and s.id not in (v_outgoing.id, v_incoming.id)
        and (
          (s.started_at < v_switched_at and coalesce(s.ended_at, 'infinity'::timestamptz) > v_outgoing.started_at)
          or (s.started_at < coalesce(v_incoming.ended_at, 'infinity'::timestamptz)
            and coalesce(s.ended_at, 'infinity'::timestamptz) > v_switched_at)
        )
    ) then raise exception using message = 'SESSION_OVERLAP', errcode = 'P0001'; end if;
    update public.role_sessions set ended_at = v_switched_at
      where user_id = v_user_id and id = v_outgoing.id;
    update public.role_sessions set started_at = v_switched_at
      where user_id = v_user_id and id = v_incoming.id;
  end if;

  update public.transitions set
    switched_at = v_switched_at,
    energy_before = v_energy_before,
    energy_after = v_energy_after,
    focus_intention = v_focus_intention,
    boundary_note = v_boundary_note
  where user_id = v_user_id and id = v_transition.id;
  if p_patch ? 'value_ids' then
    delete from public.transition_values where user_id = v_user_id and transition_id = v_transition.id;
    insert into public.transition_values (user_id, transition_id, value_id)
      select v_user_id, v_transition.id, requested.value_id from unnest(v_value_ids) requested(value_id);
  end if;
  return private.transition_wire(v_user_id, v_transition.id);
end;
$$;

create or replace function private.delete_transition(p_transition_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using message = 'AUTH_REQUIRED', errcode = 'P0001'; end if;
  delete from public.transitions t where t.user_id = v_user_id and t.id = p_transition_id;
  if not found then raise exception using message = 'NOT_FOUND', errcode = 'P0001'; end if;
end;
$$;

revoke all on function private.session_wire(uuid, uuid) from public, anon, authenticated;
revoke all on function private.transition_wire(uuid, uuid) from public, anon, authenticated;
revoke all on function private.start_role_session(uuid, timestamptz) from public, anon;
revoke all on function private.confirm_active_session_return(uuid, timestamptz) from public, anon;
revoke all on function private.switch_role_session(uuid, uuid, timestamptz, smallint, smallint, text, uuid[], text, uuid) from public, anon;
revoke all on function private.update_transition(uuid, jsonb) from public, anon;
revoke all on function private.delete_transition(uuid) from public, anon;
grant execute on function private.start_role_session(uuid, timestamptz) to authenticated;
grant execute on function private.confirm_active_session_return(uuid, timestamptz) to authenticated;
grant execute on function private.switch_role_session(uuid, uuid, timestamptz, smallint, smallint, text, uuid[], text, uuid) to authenticated;
grant execute on function private.update_transition(uuid, jsonb) to authenticated;
grant execute on function private.delete_transition(uuid) to authenticated;

create or replace function public.start_role_session(p_role_id uuid, p_started_at timestamptz)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.start_role_session($1, $2) $$;
create or replace function public.confirm_active_session_return(p_session_id uuid, p_corrected_started_at timestamptz)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.confirm_active_session_return($1, $2) $$;
create or replace function public.switch_role_session(
  p_outgoing_session_id uuid, p_incoming_role_id uuid, p_switched_at timestamptz,
  p_energy_before smallint, p_energy_after smallint, p_focus_intention text,
  p_value_ids uuid[], p_boundary_note text, p_request_id uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.switch_role_session($1, $2, $3, $4, $5, $6, $7, $8, $9) $$;
create or replace function public.update_transition(p_transition_id uuid, p_patch jsonb)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_transition($1, $2) $$;
create or replace function public.delete_transition(p_transition_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.delete_transition($1) $$;

revoke all on function public.start_role_session(uuid, timestamptz) from public, anon;
revoke all on function public.confirm_active_session_return(uuid, timestamptz) from public, anon;
revoke all on function public.switch_role_session(uuid, uuid, timestamptz, smallint, smallint, text, uuid[], text, uuid) from public, anon;
revoke all on function public.update_transition(uuid, jsonb) from public, anon;
revoke all on function public.delete_transition(uuid) from public, anon;
grant execute on function public.start_role_session(uuid, timestamptz) to authenticated;
grant execute on function public.confirm_active_session_return(uuid, timestamptz) to authenticated;
grant execute on function public.switch_role_session(uuid, uuid, timestamptz, smallint, smallint, text, uuid[], text, uuid) to authenticated;
grant execute on function public.update_transition(uuid, jsonb) to authenticated;
grant execute on function public.delete_transition(uuid) to authenticated;
