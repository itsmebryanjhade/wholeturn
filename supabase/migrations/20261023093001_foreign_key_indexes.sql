create index role_sessions_user_role_idx
  on public.role_sessions (user_id, role_id);
create index transitions_user_outgoing_session_idx
  on public.transitions (user_id, outgoing_session_id);
create index transitions_user_incoming_session_idx
  on public.transitions (user_id, incoming_session_id);
