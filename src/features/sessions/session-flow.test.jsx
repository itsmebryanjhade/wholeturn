import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext.js'
import { AppShell } from '../../components/AppShell.jsx'

const api = vi.hoisted(() => ({
  listRoles: vi.fn(),
  listValues: vi.fn(),
  getActiveSession: vi.fn(),
  startRoleSession: vi.fn(),
  confirmActiveSessionReturn: vi.fn(),
  switchRole: vi.fn(),
  getDashboardSummary: vi.fn(),
  listSessions: vi.fn(),
  listTransitions: vi.fn(),
}))

vi.mock('../../services/trackerApi.js', () => ({ trackerApi: api }))

const roles = [
  { id: 'role-study', name: 'Study', archivedAt: null },
  { id: 'role-freelance', name: 'Freelance', archivedAt: null },
]
const values = [{ id: 'value-learning', label: 'Learning', archivedAt: null }]
const activeSession = {
  id: 'session-study',
  roleId: 'role-study',
  roleName: 'Study',
  startedAt: '2026-10-22T08:00:00.000Z',
  endedAt: null,
}
const user = { id: 'user-1', email: 'bryan@example.com' }

function renderApp() {
  return render(
    <AuthContext.Provider value={{ user, loading: false, signOut: vi.fn() }}>
      <AppShell />
    </AuthContext.Provider>,
  )
}

async function waitForSessionLoad() {
  await waitFor(() => expect(api.getActiveSession).toHaveBeenCalledOnce())
}

async function confirmReturn(userEventInstance) {
  await screen.findByRole('heading', { name: 'Check elapsed time' })
  await userEventInstance.click(screen.getByRole('button', { name: 'Confirm elapsed time' }))
}

async function clickSwitchNavigation(userEventInstance) {
  await userEventInstance.click(screen.getAllByRole('button', { name: 'Switch role' })[0])
}

describe('session start, switch, and return flow', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    api.listRoles.mockReset().mockResolvedValue(roles)
    api.listValues.mockReset().mockResolvedValue(values)
    api.getActiveSession.mockReset().mockResolvedValue(null)
    api.startRoleSession.mockReset().mockResolvedValue({
      ...activeSession,
      startedAt: '2026-10-22T09:00:00.000Z',
    })
    api.confirmActiveSessionReturn.mockReset().mockImplementation(async ({ correctedStartedAt }) => ({
      ...activeSession,
      startedAt: correctedStartedAt,
    }))
    api.switchRole.mockReset().mockResolvedValue({
      incomingSession: {
        ...activeSession,
        id: 'session-freelance',
        roleId: 'role-freelance',
        roleName: 'Freelance',
      },
    })
    api.getDashboardSummary.mockReset().mockResolvedValue({
      roleSeconds: [],
      transitionCount: 0,
      energyObservations: [],
      valueAlignment: [],
      activeSession: null,
    })
    api.listSessions.mockReset().mockResolvedValue([])
    api.listTransitions.mockReset().mockResolvedValue([])
  })

  it('requires a role before creating the first session', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Start your first session' })

    await user.click(screen.getByRole('button', { name: 'Start session' }))

    expect(screen.getByRole('alert').textContent).toContain('Choose a role')
    expect(api.startRoleSession).not.toHaveBeenCalled()
  })

  it('starts the selected role and shows the active session', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('heading', { name: 'Start your first session' })
    await user.selectOptions(screen.getByLabelText('Role'), 'role-study')
    await user.click(screen.getByRole('button', { name: 'Start session' }))

    await waitFor(() => expect(api.startRoleSession).toHaveBeenCalledOnce())
    expect(api.startRoleSession.mock.calls[0][0]).toMatchObject({ roleId: 'role-study' })
    expect(new Date(api.startRoleSession.mock.calls[0][0].startedAt).toString()).not.toBe('Invalid Date')
    expect(await screen.findByText('Study')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Switch role' }).length).toBeGreaterThan(1)
  })

  it('requires both energy ratings and a focus intention before switching', async () => {
    const user = userEvent.setup()
    api.getActiveSession.mockResolvedValue(activeSession)
    renderApp()
    await waitForSessionLoad()
    await confirmReturn(user)
    await clickSwitchNavigation(user)
    await user.selectOptions(screen.getByRole('combobox', { name: /Switching into/ }), 'role-freelance')
    await user.click(screen.getByRole('button', { name: 'Save switch' }))

    expect(screen.getAllByRole('alert').map((alert) => alert.textContent).join(' ')).toMatch(/energy|focus/i)
    expect(api.switchRole).not.toHaveBeenCalled()
  })

  it('retains an identical switch request ID and all fields when retrying a failed save', async () => {
    const user = userEvent.setup()
    const randomUUID = vi.fn().mockReturnValue('request-1')
    vi.stubGlobal('crypto', { randomUUID })
    api.getActiveSession.mockResolvedValue(activeSession)
    api.switchRole.mockRejectedValueOnce(new Error('Temporary network failure')).mockResolvedValueOnce({
      incomingSession: {
        ...activeSession,
        id: 'session-freelance',
        roleId: 'role-freelance',
        roleName: 'Freelance',
      },
    })
    renderApp()
    await waitForSessionLoad()
    await confirmReturn(user)
    await clickSwitchNavigation(user)
    await user.selectOptions(screen.getByRole('combobox', { name: /Switching into/ }), 'role-freelance')
    await user.click(within(screen.getByRole('group', { name: /Energy before/ })).getByRole('radio', { name: '3 · Steady' }))
    await user.click(within(screen.getByRole('group', { name: /Energy after/ })).getByRole('radio', { name: '4 · High' }))
    await user.type(screen.getByLabelText(/Focus intention/), 'Send the project note')
    await user.click(screen.getByLabelText('Learning'))
    await user.type(screen.getByLabelText(/Boundary note/), 'Take a short break')

    await user.click(screen.getByRole('button', { name: 'Save switch' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByLabelText(/Focus intention/).value).toBe('Send the project note')
    expect(screen.getByLabelText(/Boundary note/).value).toBe('Take a short break')

    await user.click(screen.getByRole('button', { name: 'Save switch' }))
    await waitFor(() => expect(api.switchRole).toHaveBeenCalledTimes(2))
    expect(api.switchRole.mock.calls[0][0]).toEqual(api.switchRole.mock.calls[1][0])
    expect(api.switchRole.mock.calls[0][0]).toMatchObject({
      activeSessionId: activeSession.id,
      incomingRoleId: 'role-freelance',
      energyBefore: 3,
      energyAfter: 4,
      focusIntention: 'Send the project note',
      valueIds: ['value-learning'],
      boundaryNote: 'Take a short break',
      requestId: 'request-1',
    })
    expect(randomUUID).toHaveBeenCalledOnce()
    expect(await screen.findByText('Freelance')).toBeTruthy()
  })

  it('creates a new request ID when a switch field changes after a failed save', async () => {
    const user = userEvent.setup()
    const randomUUID = vi.fn().mockReturnValueOnce('request-1').mockReturnValueOnce('request-2')
    vi.stubGlobal('crypto', { randomUUID })
    api.getActiveSession.mockResolvedValue(activeSession)
    api.switchRole.mockRejectedValueOnce(new Error('Temporary network failure')).mockResolvedValueOnce({
      incomingSession: { ...activeSession, id: 'session-freelance', roleId: 'role-freelance', roleName: 'Freelance' },
    })
    renderApp()
    await waitForSessionLoad()
    await confirmReturn(user)
    await clickSwitchNavigation(user)
    await user.selectOptions(screen.getByRole('combobox', { name: /Switching into/ }), 'role-freelance')
    await user.click(within(screen.getByRole('group', { name: /Energy before/ })).getByRole('radio', { name: '3 · Steady' }))
    await user.click(within(screen.getByRole('group', { name: /Energy after/ })).getByRole('radio', { name: '4 · High' }))
    await user.type(screen.getByLabelText(/Focus intention/), 'First intention')
    await user.click(screen.getByRole('button', { name: 'Save switch' }))
    await screen.findByRole('alert')

    await user.clear(screen.getByLabelText(/Focus intention/))
    await user.type(screen.getByLabelText(/Focus intention/), 'Updated intention')
    await user.click(screen.getByRole('button', { name: 'Save switch' }))

    await waitFor(() => expect(api.switchRole).toHaveBeenCalledTimes(2))
    expect(api.switchRole.mock.calls[0][0].requestId).toBe('request-1')
    expect(api.switchRole.mock.calls[1][0].requestId).toBe('request-2')
    expect(api.switchRole.mock.calls[1][0].focusIntention).toBe('Updated intention')
  })

  it('lets the user correct a returned session start and gates the app until it saves', async () => {
    const user = userEvent.setup()
    api.getActiveSession.mockResolvedValue(activeSession)
    api.confirmActiveSessionReturn.mockRejectedValueOnce(new Error('Temporary network failure'))
    renderApp()
    await waitForSessionLoad()
    const correctedStart = screen.getByLabelText('Recorded start time')
    fireEvent.change(correctedStart, { target: { value: '2026-10-22T08:15' } })
    await user.click(screen.getByRole('button', { name: 'Confirm elapsed time' }))

    expect(api.confirmActiveSessionReturn).toHaveBeenCalledWith({
      sessionId: activeSession.id,
      correctedStartedAt: expect.any(String),
    })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Check elapsed time' })).toBeTruthy()

    api.confirmActiveSessionReturn.mockResolvedValueOnce({
      ...activeSession,
      startedAt: '2026-10-22T00:15:00.000Z',
    })
    await user.click(screen.getByRole('button', { name: 'Confirm elapsed time' }))
    expect(await screen.findByRole('heading', { name: 'Today, in context' })).toBeTruthy()
  })

  it('switches without optional values or a boundary note', async () => {
    const user = userEvent.setup()
    const randomUUID = vi.fn().mockReturnValue('request-optional')
    vi.stubGlobal('crypto', { randomUUID })
    api.getActiveSession.mockResolvedValue(activeSession)
    renderApp()
    await waitForSessionLoad()
    await confirmReturn(user)
    await clickSwitchNavigation(user)
    await user.selectOptions(screen.getByRole('combobox', { name: /Switching into/ }), 'role-freelance')
    await user.click(within(screen.getByRole('group', { name: /Energy before/ })).getByRole('radio', { name: '2 · Low' }))
    await user.click(within(screen.getByRole('group', { name: /Energy after/ })).getByRole('radio', { name: '4 · High' }))
    await user.type(screen.getByLabelText(/Focus intention/), 'Finish one task')
    await user.click(screen.getByRole('button', { name: 'Save switch' }))

    await waitFor(() => expect(api.switchRole).toHaveBeenCalledOnce())
    expect(api.switchRole.mock.calls[0][0]).toMatchObject({ valueIds: [], boundaryNote: null })
  })
})
