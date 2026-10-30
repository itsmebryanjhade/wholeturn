import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseClient = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('../lib/supabaseClient.js', () => ({
  supabaseClient,
  supabaseConfigurationError: null,
}))

import { trackerApi } from './trackerApi.js'

function createQueryResult(data, error = null) {
  const result = { data, error }
  const query = {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    order: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    gte: vi.fn(() => query),
    lt: vi.fn(() => query),
    or: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  }

  return query
}

const switchInput = {
  activeSessionId: 'session-outgoing',
  incomingRoleId: 'role-freelance',
  switchedAt: '2026-10-22T10:00:00+08:00',
  energyBefore: 2,
  energyAfter: 4,
  focusIntention: 'Send the project note',
  valueIds: ['value-learning'],
  boundaryNote: 'Take a short break first',
  requestId: 'request-123',
}

const roleRow = {
  id: 'role-study',
  name: 'Study',
  color: '#547A70',
  icon: 'book',
  archived_at: null,
  created_at: '2026-10-21T12:00:00Z',
}

const valueRow = {
  id: 'value-learning',
  label: 'Learning',
  archived_at: null,
  created_at: '2026-10-21T12:00:00Z',
}

const sessionRow = {
  id: 'session-study',
  role_id: 'role-study',
  role_name: 'Study',
  started_at: '2026-10-22T00:00:00Z',
  ended_at: null,
}

const transitionRow = {
  id: 'transition-1',
  outgoing_session_id: 'session-outgoing',
  incoming_session_id: 'session-incoming',
  switched_at: '2026-10-22T02:00:00Z',
  energy_before: 2,
  energy_after: 4,
  focus_intention: 'Send the project note',
  boundary_note: 'Take a short break first',
  transition_values: [{ value_id: 'value-learning' }],
}

describe('trackerApi', () => {
  beforeEach(() => {
    supabaseClient.from.mockReset()
    supabaseClient.rpc.mockReset()
  })

  it('maps role rows to the frontend role shape', async () => {
    supabaseClient.from.mockReturnValue(createQueryResult([roleRow]))

    await expect(trackerApi.listRoles()).resolves.toEqual([
      {
        id: roleRow.id,
        name: roleRow.name,
        color: roleRow.color,
        icon: roleRow.icon,
        archivedAt: null,
        createdAt: roleRow.created_at,
      },
    ])
    expect(supabaseClient.from).toHaveBeenCalledWith('roles')
  })

  it('maps a successful role switch RPC to frontend DTOs and UTC input', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: {
        closed_session: {
          id: 'session-outgoing',
          role_id: 'role-study',
          role_name: 'Study',
          started_at: '2026-10-22T00:00:00Z',
          ended_at: '2026-10-22T02:00:00Z',
        },
        incoming_session: {
          id: 'session-incoming',
          role_id: 'role-freelance',
          role_name: 'Freelance',
          started_at: '2026-10-22T02:00:00Z',
          ended_at: null,
        },
        transition: {
          id: 'transition-1',
          outgoing_session_id: 'session-outgoing',
          incoming_session_id: 'session-incoming',
          switched_at: '2026-10-22T02:00:00Z',
          energy_before: 2,
          energy_after: 4,
          focus_intention: 'Send the project note',
          value_ids: ['value-learning'],
          boundary_note: 'Take a short break first',
        },
      },
      error: null,
    })

    await expect(trackerApi.switchRole(switchInput)).resolves.toEqual({
      closedSession: {
        id: 'session-outgoing',
        roleId: 'role-study',
        roleName: 'Study',
        startedAt: '2026-10-22T00:00:00Z',
        endedAt: '2026-10-22T02:00:00Z',
      },
      incomingSession: {
        id: 'session-incoming',
        roleId: 'role-freelance',
        roleName: 'Freelance',
        startedAt: '2026-10-22T02:00:00Z',
        endedAt: null,
      },
      transition: {
        id: 'transition-1',
        outgoingSessionId: 'session-outgoing',
        incomingSessionId: 'session-incoming',
        switchedAt: '2026-10-22T02:00:00Z',
        energyBefore: 2,
        energyAfter: 4,
        focusIntention: 'Send the project note',
        valueIds: ['value-learning'],
        boundaryNote: 'Take a short break first',
      },
    })
    expect(supabaseClient.rpc).toHaveBeenCalledWith('switch_role_session', {
      p_outgoing_session_id: 'session-outgoing',
      p_incoming_role_id: 'role-freelance',
      p_switched_at: '2026-10-22T02:00:00.000Z',
      p_energy_before: 2,
      p_energy_after: 4,
      p_focus_intention: 'Send the project note',
      p_value_ids: ['value-learning'],
      p_boundary_note: 'Take a short break first',
      p_request_id: 'request-123',
    })
  })

  it('returns null when there is no active session', async () => {
    supabaseClient.from.mockReturnValue(createQueryResult(null))

    await expect(trackerApi.getActiveSession()).resolves.toBeNull()
  })

  it('maps the role name from the active session relationship', async () => {
    const query = createQueryResult({ ...sessionRow, role_name: undefined, role: { name: 'Study' } })
    supabaseClient.from.mockReturnValue(query)

    await expect(trackerApi.getActiveSession()).resolves.toMatchObject({
      id: 'session-study',
      roleName: 'Study',
    })
    expect(query.select).toHaveBeenCalledWith(
      'id, role_id, started_at, ended_at, role:roles(name)',
    )
  })

  it('keeps RPC failures user-safe while retaining the original cause', async () => {
    const cause = {
      code: 'P0001',
      message: 'SESSION_OVERLAP',
      details: 'SELECT * FROM private.session_audit',
    }
    supabaseClient.rpc.mockResolvedValue({ data: null, error: cause })

    let thrownError
    try {
      await trackerApi.switchRole(switchInput)
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toMatchObject({ code: 'SESSION_OVERLAP', cause })
    expect(thrownError.message).not.toContain('SELECT * FROM private.session_audit')
  })

  it.each([
    ['missing input', null],
    ['blank focus', { ...switchInput, focusIntention: ' ' }],
    ['duplicate values', { ...switchInput, valueIds: ['value-learning', 'value-learning'] }],
  ])('rejects a switch with %s before calling the RPC', async (_label, input) => {
    await expect(trackerApi.switchRole(input)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
    expect(supabaseClient.rpc).not.toHaveBeenCalled()
  })

  it('trims and inserts a role', async () => {
    const query = createQueryResult(roleRow)
    supabaseClient.from.mockReturnValue(query)

    await expect(
      trackerApi.createRole({ name: ' Study ', color: '#547A70', icon: 'book' }),
    ).resolves.toMatchObject({ id: 'role-study', name: 'Study' })

    expect(supabaseClient.from).toHaveBeenCalledWith('roles')
    expect(query.insert).toHaveBeenCalledWith({
      name: 'Study',
      color: '#547A70',
      icon: 'book',
    })
  })

  it('updates only the requested role fields', async () => {
    const query = createQueryResult(roleRow)
    supabaseClient.from.mockReturnValue(query)

    await trackerApi.updateRole('role-study', { name: ' New name ' })

    expect(query.update).toHaveBeenCalledWith({ name: 'New name' })
    expect(query.eq).toHaveBeenCalledWith('id', 'role-study')
  })

  it('archives and restores a role with an archive timestamp', async () => {
    const query = createQueryResult({ ...roleRow, archived_at: '2026-10-22T00:00:00Z' })
    supabaseClient.from.mockReturnValue(query)

    await trackerApi.setRoleArchived('role-study', true)

    const [{ archived_at: archivedAt }] = query.update.mock.calls[0]
    expect(Date.parse(archivedAt)).not.toBeNaN()
    expect(query.eq).toHaveBeenCalledWith('id', 'role-study')
  })

  it('maps value rows to the frontend value shape', async () => {
    supabaseClient.from.mockReturnValue(createQueryResult([valueRow]))

    await expect(trackerApi.listValues()).resolves.toEqual([
      {
        id: 'value-learning',
        label: 'Learning',
        archivedAt: null,
        createdAt: '2026-10-21T12:00:00Z',
      },
    ])
  })

  it('trims and inserts a value', async () => {
    const query = createQueryResult(valueRow)
    supabaseClient.from.mockReturnValue(query)

    await trackerApi.createValue({ label: ' Learning ' })

    expect(supabaseClient.from).toHaveBeenCalledWith('core_values')
    expect(query.insert).toHaveBeenCalledWith({ label: 'Learning' })
  })

  it('updates a value label', async () => {
    const query = createQueryResult(valueRow)
    supabaseClient.from.mockReturnValue(query)

    await trackerApi.updateValue('value-learning', { label: ' Curiosity ' })

    expect(query.update).toHaveBeenCalledWith({ label: 'Curiosity' })
    expect(query.eq).toHaveBeenCalledWith('id', 'value-learning')
  })

  it('archives and restores a value', async () => {
    const query = createQueryResult({ ...valueRow, archived_at: '2026-10-22T00:00:00Z' })
    supabaseClient.from.mockReturnValue(query)

    await trackerApi.setValueArchived('value-learning', true)

    expect(query.update.mock.calls[0][0].archived_at).toMatch(/^\d{4}-\d\d-/)
    expect(query.eq).toHaveBeenCalledWith('id', 'value-learning')
  })

  it('starts a session with a UTC RPC timestamp', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: sessionRow, error: null })

    await expect(
      trackerApi.startRoleSession({
        roleId: 'role-study',
        startedAt: '2026-10-22T08:00:00+08:00',
      }),
    ).resolves.toMatchObject({
      id: 'session-study',
      roleId: 'role-study',
      roleName: 'Study',
      startedAt: '2026-10-22T00:00:00Z',
    })
    expect(supabaseClient.rpc).toHaveBeenCalledWith('start_role_session', {
      p_role_id: 'role-study',
      p_started_at: '2026-10-22T00:00:00.000Z',
    })
  })

  it('confirms a corrected session start', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: sessionRow, error: null })

    await trackerApi.confirmActiveSessionReturn({
      sessionId: 'session-study',
      correctedStartedAt: '2026-10-22T08:00:00+08:00',
    })

    expect(supabaseClient.rpc).toHaveBeenCalledWith('confirm_active_session_return', {
      p_session_id: 'session-study',
      p_corrected_started_at: '2026-10-22T00:00:00.000Z',
    })
  })

  it('lists sessions that overlap the requested half-open time range', async () => {
    const query = createQueryResult([sessionRow])
    supabaseClient.from.mockReturnValue(query)

    await expect(
      trackerApi.listSessions({
        from: '2026-10-22T08:00:00+08:00',
        to: '2026-10-23T08:00:00+08:00',
      }),
    ).resolves.toMatchObject([{ id: 'session-study', roleName: 'Study' }])
    expect(query.lt).toHaveBeenCalledWith('started_at', '2026-10-23T00:00:00.000Z')
    expect(query.or).toHaveBeenCalledWith(
      'ended_at.is.null,ended_at.gt.2026-10-22T00:00:00.000Z',
    )
    expect(query.select).toHaveBeenCalledWith(
      'id, role_id, started_at, ended_at, role:roles(name)',
    )
  })

  it('lists transitions with linked value ids', async () => {
    const query = createQueryResult([transitionRow])
    supabaseClient.from.mockReturnValue(query)

    await expect(trackerApi.listTransitions()).resolves.toMatchObject([
      {
        id: 'transition-1',
        outgoingSessionId: 'session-outgoing',
        incomingSessionId: 'session-incoming',
        valueIds: ['value-learning'],
      },
    ])
  })

  it('updates a transition with snake_case RPC patch fields', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: transitionRow, error: null })

    await trackerApi.updateTransition({
      transitionId: 'transition-1',
      patch: { energyAfter: 5, boundaryNote: null },
    })

    expect(supabaseClient.rpc).toHaveBeenCalledWith('update_transition', {
      p_transition_id: 'transition-1',
      p_patch: { energy_after: 5, boundary_note: null },
    })
  })

  it('rejects undefined transition patch values instead of clearing fields', async () => {
    await expect(
      trackerApi.updateTransition({
        transitionId: 'transition-1',
        patch: { boundaryNote: undefined },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', field: 'boundaryNote' })
    expect(supabaseClient.rpc).not.toHaveBeenCalled()
  })

  it('deletes a transition through its RPC', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: null, error: null })

    await expect(trackerApi.deleteTransition('transition-1')).resolves.toBeUndefined()
    expect(supabaseClient.rpc).toHaveBeenCalledWith('delete_transition', {
      p_transition_id: 'transition-1',
    })
  })

  it('maps dashboard summary fields from the RPC response', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: {
        role_seconds: [{ role_id: 'role-study', role_name: 'Study', seconds: 3600 }],
        transition_count: 1,
        energy_observations: [
          { before: 2, after: 4, switched_at: '2026-10-22T02:00:00Z' },
        ],
        value_alignment: [
          { value_id: 'value-learning', label: 'Learning', tagged_count: 1, transition_count: 1 },
        ],
        active_session: sessionRow,
      },
      error: null,
    })

    await expect(
      trackerApi.getDashboardSummary({
        startDate: '2026-10-22',
        endDate: '2026-10-22',
        timeZone: 'Asia/Manila',
      }),
    ).resolves.toEqual({
      roleSeconds: [{ roleId: 'role-study', roleName: 'Study', seconds: 3600 }],
      transitionCount: 1,
      energyObservations: [
        { before: 2, after: 4, switchedAt: '2026-10-22T02:00:00Z' },
      ],
      valueAlignment: [
        { valueId: 'value-learning', label: 'Learning', taggedCount: 1, transitionCount: 1 },
      ],
      activeSession: {
        id: 'session-study',
        roleId: 'role-study',
        roleName: 'Study',
        startedAt: '2026-10-22T00:00:00Z',
        endedAt: null,
      },
    })
    expect(supabaseClient.rpc).toHaveBeenCalledWith('get_dashboard_summary', {
      p_start_date: '2026-10-22',
      p_end_date: '2026-10-22',
      p_time_zone: 'Asia/Manila',
    })
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['unsupported', 'Mars/Olympus'],
  ])('rejects a %s dashboard timezone before the RPC', async (_label, timeZone) => {
    await expect(
      trackerApi.getDashboardSummary({
        startDate: '2026-10-22',
        endDate: '2026-10-22',
        timeZone,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TIME_ZONE' })
    expect(supabaseClient.rpc).not.toHaveBeenCalled()
  })
})
