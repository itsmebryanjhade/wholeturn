-- Private, owner-scoped tracker data. User ownership is derived from Supabase Auth.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  color text,
  icon text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.core_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null check (length(btrim(label)) > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.role_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, role_id) references public.roles (user_id, id) on delete cascade,
  check (ended_at is null or ended_at > started_at)
);

create table public.transitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  outgoing_session_id uuid not null,
  incoming_session_id uuid not null,
  switched_at timestamptz not null,
  energy_before smallint not null check (energy_before between 1 and 5),
  energy_after smallint not null check (energy_after between 1 and 5),
  focus_intention text not null check (length(btrim(focus_intention)) > 0),
  boundary_note text,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, request_id),
  foreign key (user_id, outgoing_session_id) references public.role_sessions (user_id, id) on delete cascade,
  foreign key (user_id, incoming_session_id) references public.role_sessions (user_id, id) on delete cascade,
  check (outgoing_session_id <> incoming_session_id)
);

create table public.transition_values (
  user_id uuid not null,
  transition_id uuid not null,
  value_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, transition_id, value_id),
  foreign key (user_id, transition_id) references public.transitions (user_id, id) on delete cascade,
  foreign key (user_id, value_id) references public.core_values (user_id, id) on delete cascade
);

create unique index role_sessions_one_open_per_user
  on public.role_sessions (user_id)
  where ended_at is null;
create index role_sessions_user_started_idx
  on public.role_sessions (user_id, started_at desc);
create index transitions_user_switched_idx
  on public.transitions (user_id, switched_at desc);
create index transition_values_user_value_idx
  on public.transition_values (user_id, value_id);

alter table public.roles enable row level security;
alter table public.core_values enable row level security;
alter table public.role_sessions enable row level security;
alter table public.transitions enable row level security;
alter table public.transition_values enable row level security;

create policy roles_select_own on public.roles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy roles_insert_own on public.roles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy roles_update_own on public.roles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy core_values_select_own on public.core_values
  for select to authenticated using ((select auth.uid()) = user_id);
create policy core_values_insert_own on public.core_values
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy core_values_update_own on public.core_values
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy role_sessions_select_own on public.role_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy transitions_select_own on public.transitions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy transition_values_select_own on public.transition_values
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.roles, public.core_values, public.role_sessions,
  public.transitions, public.transition_values from public, anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.roles, public.core_values to authenticated;
grant select on public.role_sessions, public.transitions, public.transition_values to authenticated;
