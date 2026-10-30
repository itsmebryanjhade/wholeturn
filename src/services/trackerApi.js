import { supabaseClient, supabaseConfigurationError } from '../lib/supabaseClient.js'

const messages = {
  AUTH_REQUIRED: 'Sign in to access your saved data.',
  NOT_FOUND: 'That record could not be found.',
  VALIDATION_ERROR: 'Check the information and try again.',
  ACTIVE_SESSION_EXISTS: 'You already have an active session.',
  NO_ACTIVE_SESSION: 'There is no active session to switch from.',
  ROLE_UNAVAILABLE: 'That role is no longer available.',
  SAME_ROLE: 'Choose a different role to switch to.',
  VALUE_UNAVAILABLE: 'One of the selected values is no longer available.',
  SESSION_OVERLAP: 'That time overlaps another session. Adjust it and try again.',
  INVALID_TIME_ORDER: 'The time must follow the previous session boundary.',
  REQUEST_ID_REUSED: 'This save conflicts with an earlier attempt. Review the latest session and try again.',
  INVALID_DATE_RANGE: 'Choose an end date on or after the start date.',
  INVALID_TIME_ZONE: 'Choose a supported time zone.',
  SERVICE_UNAVAILABLE: 'Saved data is temporarily unavailable. Check your connection and try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
}

const stableCodes = Object.keys(messages).filter((code) => code !== 'UNKNOWN')
const domainCodePattern = new RegExp(`\\b(${stableCodes.join('|')})\\b`)

export class TrackerApiError extends Error {
  constructor(code, cause, field) {
    super(messages[code] || messages.UNKNOWN)
    this.name = 'TrackerApiError'
    this.code = messages[code] ? code : 'UNKNOWN'
    this.cause = cause
    if (field) this.field = field
  }
}

function failValidation(field) {
  throw new TrackerApiError('VALIDATION_ERROR', undefined, field)
}

function assertObject(value, field = 'input') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) failValidation(field)
  return value
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) failValidation(field)
  return value.trim()
}

function optionalText(value, field) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    failValidation(field)
  }
  return value ?? null
}

function requiredId(value, field) {
  if (typeof value !== 'string' || !value.trim()) failValidation(field)
  return value
}

function normalizeTimestamp(value, field) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/i.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    failValidation(field)
  }
  return new Date(value).toISOString()
}

function normalizeEnergy(value, field) {
  if (!Number.isInteger(value) || value < 1 || value > 5) failValidation(field)
  return value
}

function normalizeIds(value, field) {
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string' || !id.trim())) {
    failValidation(field)
  }
  if (new Set(value).size !== value.length) failValidation(field)
  return value
}

function validatePatch(patch, allowedKeys) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) failValidation('patch')
  const keys = Object.keys(patch)
  if (!keys.length || keys.some((key) => !allowedKeys.includes(key))) failValidation('patch')
}

function getClient() {
  if (supabaseConfigurationError || !supabaseClient) {
    throw new TrackerApiError('SERVICE_UNAVAILABLE', supabaseConfigurationError)
  }
  return supabaseClient
}

function toTrackerError(error) {
  const diagnostic = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
  const domainCode = diagnostic.match(domainCodePattern)?.[1]
  let code = domainCode || (messages[error?.code] ? error.code : null)

  if (!code && (error?.status === 401 || error?.code === '401')) code = 'AUTH_REQUIRED'
  if (!code && error?.code === 'PGRST116') code = 'NOT_FOUND'
  if (!code && error?.code === '23505') {
    code = /request_id/i.test(diagnostic) ? 'REQUEST_ID_REUSED' : 'ACTIVE_SESSION_EXISTS'
  }
  if (!code && error?.code === '23514') code = 'VALIDATION_ERROR'
  if (!code && (error?.status >= 500 || /network|fetch failed/i.test(diagnostic))) {
    code = 'SERVICE_UNAVAILABLE'
  }

  return new TrackerApiError(code || 'UNKNOWN', error)
}

async function read(query) {
  const { data, error } = await query
  if (error) throw toTrackerError(error)
  return data
}

async function readOne(query) {
  const data = await read(query)
  if (!data) throw new TrackerApiError('NOT_FOUND')
  return data
}

async function callRpc(name, args) {
  const { data, error } = await getClient().rpc(name, args)
  if (error) throw toTrackerError(error)
  return data
}

function mapRole(row) {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    icon: row.icon ?? null,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
  }
}

function mapValue(row) {
  return {
    id: row.id,
    label: row.label,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
  }
}

function mapSession(row) {
  const role = Array.isArray(row.role) ? row.role[0] : row.role
  return {
    id: row.id,
    roleId: row.role_id,
    roleName: row.role_name ?? role?.name,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? null,
  }
}

function mapTransition(row) {
  return {
    id: row.id,
    outgoingSessionId: row.outgoing_session_id,
    incomingSessionId: row.incoming_session_id,
    switchedAt: row.switched_at,
    energyBefore: row.energy_before,
    energyAfter: row.energy_after,
    focusIntention: row.focus_intention,
    valueIds:
      row.value_ids ?? row.transition_values?.map(({ value_id: valueId }) => valueId) ?? [],
    boundaryNote: row.boundary_note ?? null,
  }
}

function normalizeRoleInput(input) {
  assertObject(input)
  const role = { name: requiredText(input.name, 'name') }
  for (const key of ['color', 'icon']) {
    if (key in input) role[key] = optionalText(input[key], key)
  }
  if (Object.keys(input).some((key) => !['name', 'color', 'icon'].includes(key))) {
    failValidation('input')
  }
  return role
}

function normalizeRolePatch(patch) {
  validatePatch(patch, ['name', 'color', 'icon'])
  const normalized = { ...patch }
  if ('name' in normalized) normalized.name = requiredText(normalized.name, 'name')
  for (const key of ['color', 'icon']) {
    if (key in normalized) normalized[key] = optionalText(normalized[key], key)
  }
  return normalized
}

function normalizeValueInput(input) {
  assertObject(input)
  if (Object.keys(input).some((key) => key !== 'label')) failValidation('input')
  return { label: requiredText(input.label, 'label') }
}

function normalizeValuePatch(patch) {
  validatePatch(patch, ['label'])
  return { label: requiredText(patch.label, 'label') }
}

function normalizeTimeBound(value, field) {
  return value === undefined ? undefined : normalizeTimestamp(value, field)
}

function normalizeDate(value, field) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\d$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  ) {
    failValidation(field)
  }
  return value
}

function normalizeTransitionPatch(patch) {
  const allowed = [
    'switchedAt',
    'energyBefore',
    'energyAfter',
    'focusIntention',
    'valueIds',
    'boundaryNote',
  ]
  validatePatch(patch, allowed)
  const wirePatch = {}
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case 'switchedAt':
        wirePatch.switched_at = normalizeTimestamp(value, key)
        break
      case 'energyBefore':
        wirePatch.energy_before = normalizeEnergy(value, key)
        break
      case 'energyAfter':
        wirePatch.energy_after = normalizeEnergy(value, key)
        break
      case 'focusIntention':
        wirePatch.focus_intention = requiredText(value, key)
        break
      case 'valueIds':
        wirePatch.value_ids = normalizeIds(value, key)
        break
      case 'boundaryNote':
          if (value === undefined) failValidation(key)
        wirePatch.boundary_note = optionalText(value, key)
        break
      default:
        failValidation('patch')
    }
  }
  return wirePatch
}

async function updateRow(table, id, patch, mapper) {
  const row = await readOne(
    getClient().from(table).update(patch).eq('id', requiredId(id, 'id')).select('*').single(),
  )
  return mapper(row)
}

async function archiveRow(table, id, archived, mapper) {
  if (typeof archived !== 'boolean') failValidation('archived')
  return updateRow(
    table,
    id,
    { archived_at: archived ? new Date().toISOString() : null },
    mapper,
  )
}

/** @type {const} */
export const trackerApi = {
  async listRoles() {
    const rows = (await read(getClient().from('roles').select('*'))) ?? []
    return rows.map(mapRole)
  },

  async createRole(input) {
    return mapRole(
      await readOne(
        getClient().from('roles').insert(normalizeRoleInput(input)).select('*').single(),
      ),
    )
  },

  async updateRole(id, patch) {
    return updateRow('roles', id, normalizeRolePatch(patch), mapRole)
  },

  async setRoleArchived(id, archived) {
    return archiveRow('roles', id, archived, mapRole)
  },

  async listValues() {
    const rows = (await read(getClient().from('core_values').select('*'))) ?? []
    return rows.map(mapValue)
  },

  async createValue(input) {
    return mapValue(
      await readOne(
        getClient().from('core_values').insert(normalizeValueInput(input)).select('*').single(),
      ),
    )
  },

  async updateValue(id, patch) {
    return updateRow('core_values', id, normalizeValuePatch(patch), mapValue)
  },

  async setValueArchived(id, archived) {
    return archiveRow('core_values', id, archived, mapValue)
  },

  async getActiveSession() {
    const row = await read(
      getClient()
        .from('role_sessions')
        .select('id, role_id, started_at, ended_at, role:roles(name)')
        .is('ended_at', null)
        .maybeSingle(),
    )
    return row ? mapSession(row) : null
  },

  async startRoleSession(input) {
    assertObject(input)
    const { roleId, startedAt } = input
    return mapSession(
      await callRpc('start_role_session', {
        p_role_id: requiredId(roleId, 'roleId'),
        p_started_at: normalizeTimestamp(startedAt, 'startedAt'),
      }),
    )
  },

  async confirmActiveSessionReturn(input) {
    assertObject(input)
    const { sessionId, correctedStartedAt } = input
    return mapSession(
      await callRpc('confirm_active_session_return', {
        p_session_id: requiredId(sessionId, 'sessionId'),
        p_corrected_started_at: normalizeTimestamp(correctedStartedAt, 'correctedStartedAt'),
      }),
    )
  },

  async switchRole(input) {
    assertObject(input)
    const data = await callRpc('switch_role_session', {
      p_outgoing_session_id: requiredId(input.activeSessionId, 'activeSessionId'),
      p_incoming_role_id: requiredId(input.incomingRoleId, 'incomingRoleId'),
      p_switched_at: normalizeTimestamp(input.switchedAt, 'switchedAt'),
      p_energy_before: normalizeEnergy(input.energyBefore, 'energyBefore'),
      p_energy_after: normalizeEnergy(input.energyAfter, 'energyAfter'),
      p_focus_intention: requiredText(input.focusIntention, 'focusIntention'),
      p_value_ids: normalizeIds(input.valueIds, 'valueIds'),
      p_boundary_note: optionalText(input.boundaryNote, 'boundaryNote'),
      p_request_id: requiredId(input.requestId, 'requestId'),
    })
    return {
      closedSession: mapSession(data.closed_session),
      incomingSession: mapSession(data.incoming_session),
      transition: mapTransition(data.transition),
    }
  },

  async listSessions(filters = {}) {
    assertObject(filters, 'filters')
    const { from, to } = filters
    const fromTime = normalizeTimeBound(from, 'from')
    const toTime = normalizeTimeBound(to, 'to')
    if (fromTime && toTime && fromTime >= toTime) failValidation('from')
    let query = getClient()
      .from('role_sessions')
      .select('id, role_id, started_at, ended_at, role:roles(name)')
    if (toTime) query = query.lt('started_at', toTime)
    if (fromTime) query = query.or(`ended_at.is.null,ended_at.gt.${fromTime}`)
    const rows = (await read(query)) ?? []
    return rows.map(mapSession)
  },

  async listTransitions(filters = {}) {
    assertObject(filters, 'filters')
    const { from, to } = filters
    const fromTime = normalizeTimeBound(from, 'from')
    const toTime = normalizeTimeBound(to, 'to')
    if (fromTime && toTime && fromTime >= toTime) failValidation('from')
    let query = getClient()
      .from('transitions')
      .select('id, outgoing_session_id, incoming_session_id, switched_at, energy_before, energy_after, focus_intention, boundary_note, transition_values(value_id)')
    if (fromTime) query = query.gte('switched_at', fromTime)
    if (toTime) query = query.lt('switched_at', toTime)
    const rows = (await read(query)) ?? []
    return rows.map(mapTransition)
  },

  async updateTransition(input) {
    assertObject(input)
    const { transitionId, patch } = input
    return mapTransition(
      await callRpc('update_transition', {
        p_transition_id: requiredId(transitionId, 'transitionId'),
        p_patch: normalizeTransitionPatch(patch),
      }),
    )
  },

  async deleteTransition(transitionId) {
    await callRpc('delete_transition', {
      p_transition_id: requiredId(transitionId, 'transitionId'),
    })
  },

  async getDashboardSummary(input) {
    assertObject(input)
    const { startDate, endDate, timeZone } = input
    const start = normalizeDate(startDate, 'startDate')
    const end = normalizeDate(endDate, 'endDate')
    if (start > end) throw new TrackerApiError('INVALID_DATE_RANGE')
    if (typeof timeZone !== 'string' || !timeZone.trim()) {
      throw new TrackerApiError('INVALID_TIME_ZONE')
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format()
    } catch {
      throw new TrackerApiError('INVALID_TIME_ZONE')
    }
    const data = await callRpc('get_dashboard_summary', {
      p_start_date: start,
      p_end_date: end,
      p_time_zone: timeZone,
    })
    return {
      roleSeconds: data.role_seconds.map(({ role_id: roleId, role_name: roleName, seconds }) => ({
        roleId,
        roleName,
        seconds,
      })),
      transitionCount: data.transition_count,
      energyObservations: data.energy_observations.map(
        ({ before, after, switched_at: switchedAt }) => ({ before, after, switchedAt }),
      ),
      valueAlignment: data.value_alignment.map(
        ({ value_id: valueId, label, tagged_count: taggedCount, transition_count: transitionCount }) => ({
          valueId,
          label,
          taggedCount,
          transitionCount,
        }),
      ),
      activeSession: data.active_session ? mapSession(data.active_session) : null,
    }
  },
}
