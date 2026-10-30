import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard, DemoDashboard } from './Dashboard.jsx'

const api = vi.hoisted(() => ({
  getDashboardSummary: vi.fn(),
  listSessions: vi.fn(),
  listTransitions: vi.fn(),
}))

vi.mock('../../services/trackerApi.js', () => ({ trackerApi: api }))

const roles = [
  { id: 'study', name: 'Study', archivedAt: null },
  { id: 'freelance', name: 'Freelance', archivedAt: null },
]
const values = [{ id: 'learning', label: 'Learning', archivedAt: null }]
const activeSession = {
  id: 'session-active',
  roleId: 'freelance',
  roleName: 'Freelance',
  startedAt: '2026-10-22T08:00:00.000Z',
  endedAt: null,
}

function summary(overrides = {}) {
  return {
    roleSeconds: [
      { roleId: 'study', roleName: 'Study', seconds: 8100 },
      { roleId: 'freelance', roleName: 'Freelance', seconds: 3600 },
    ],
    transitionCount: 2,
    energyObservations: [
      { before: 2, after: 4, switchedAt: '2026-10-22T08:00:00.000Z' },
      { before: 3, after: 2, switchedAt: '2026-10-22T09:00:00.000Z' },
    ],
    valueAlignment: [{ valueId: 'learning', label: 'Learning', taggedCount: 1, transitionCount: 2 }],
    activeSession,
    ...overrides,
  }
}

describe('Dashboard', () => {
  beforeEach(() => {
    api.getDashboardSummary.mockReset().mockResolvedValue(summary())
    api.listSessions.mockReset().mockResolvedValue([
      { id: 'session-study', roleId: 'study', roleName: 'Study', startedAt: '2026-10-22T06:00:00.000Z', endedAt: '2026-10-22T08:00:00.000Z' },
      activeSession,
    ])
    api.listTransitions.mockReset().mockResolvedValue([
      { id: 'transition-1', outgoingSessionId: 'session-study', incomingSessionId: 'session-active', switchedAt: '2026-10-22T08:00:00.000Z', energyBefore: 2, energyAfter: 4, focusIntention: 'Finish the project outline', valueIds: ['learning'], boundaryNote: null },
    ])
  })

  it('shows a dashboard-shaped loading state until saved data arrives', async () => {
    let resolveSummary
    api.getDashboardSummary.mockReturnValue(new Promise((resolve) => { resolveSummary = resolve }))
    render(<Dashboard roles={roles} values={values} activeSession={activeSession} now={new Date('2026-10-22T10:00:00.000Z')} />)

    expect(screen.getByRole('status').textContent).toContain('Loading dashboard data')
    expect(document.querySelector('.loading-dashboard')).toBeTruthy()
    expect(screen.getByLabelText('Date range')).toBeTruthy()

    await act(async () => resolveSummary(summary()))
    expect(await screen.findByRole('region', { name: 'Your day, in context' })).toBeTruthy()
    expect(document.querySelector('.loading-dashboard')).toBeNull()
  })

  it('shows saved role time, energy observations, value denominators, and recent transitions', async () => {
    render(<Dashboard roles={roles} values={values} activeSession={activeSession} now={new Date('2026-10-22T10:00:00.000Z')} />)

    const recentTransitions = await screen.findByRole('region', { name: 'Recent transitions' })
    expect(await within(recentTransitions).findByText('Finish the project outline')).toBeTruthy()
    expect(screen.getByText('2 hr 15 min')).toBeTruthy()
    expect(screen.getByText('1 hr')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Transitions' })).getByText('2')).toBeTruthy()
    expect(screen.getByText('1 / 2 switches')).toBeTruthy()
    const energySummary = screen.getByRole('region', { name: 'Energy before → after' })
    expect(within(energySummary).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1higher', '1lower', '0same',
    ])
    expect(screen.getByText('Active for 2 hr')).toBeTruthy()
    expect(document.querySelector('.dashboard-current')).toBeTruthy()
    expect(document.querySelector('.dashboard-role-time')).toBeTruthy()
    expect(document.querySelector('.dashboard-ribbon-section')).toBeTruthy()
    expect(api.getDashboardSummary).toHaveBeenCalledOnce()
    expect(api.listSessions).toHaveBeenCalledOnce()
    expect(api.listTransitions).toHaveBeenCalledOnce()
    expect(api.getDashboardSummary.mock.calls[0][0]).toMatchObject({
      startDate: '2026-10-22',
      endDate: '2026-10-22',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    expect(api.listSessions.mock.calls[0][0]).toHaveProperty('from')
    expect(api.listSessions.mock.calls[0][0]).toHaveProperty('to')
  })

  it('shows a chronological daybook with each handoff attached to the role it starts', async () => {
    api.listSessions.mockResolvedValue([
      activeSession,
      { id: 'session-study', roleId: 'study', roleName: 'Study', startedAt: '2026-10-22T06:00:00.000Z', endedAt: '2026-10-22T08:00:00.000Z' },
    ])
    api.listTransitions.mockResolvedValue([
      {
        id: 'transition-1',
        outgoingSessionId: 'session-study',
        incomingSessionId: 'session-active',
        switchedAt: '2026-10-22T08:00:00.000Z',
        energyBefore: 2,
        energyAfter: 4,
        focusIntention: 'Finish the project outline',
        valueIds: ['learning'],
        boundaryNote: 'Take a breath before the next role',
      },
    ])

    render(<Dashboard roles={roles} values={values} activeSession={activeSession} now={new Date('2026-10-22T10:00:00.000Z')} />)

    const daybook = await screen.findByRole('region', { name: 'Your day, in context' })
    const entries = [...daybook.querySelectorAll('.dashboard-daybook-list > .dashboard-daybook-item')]
    expect(entries.map((entry) => entry.querySelector('h3')?.textContent)).toEqual(['Study', 'Freelance'])
    expect(within(entries[1]).getByText('Active role')).toBeTruthy()
    expect(within(entries[1]).getByText('2 hr')).toBeTruthy()

    const handoff = within(entries[1]).getByRole('group', { name: 'Handoff from Study to Freelance' })
    expect(within(handoff).getByText('Energy 2 → 4')).toBeTruthy()
    expect(within(handoff).getByText('Finish the project outline')).toBeTruthy()
    expect(within(handoff).getByText('Learning')).toBeTruthy()
    expect(within(handoff).getByText('Take a breath before the next role')).toBeTruthy()
  })

  it('keeps standalone sessions clear when there is no transition to show', async () => {
    api.getDashboardSummary.mockResolvedValue(summary({ activeSession: null }))
    api.listSessions.mockResolvedValue([
      { id: 'session-study', roleId: 'study', roleName: 'Study', startedAt: '2026-10-22T06:00:00.000Z', endedAt: '2026-10-22T08:00:00.000Z' },
    ])
    api.listTransitions.mockResolvedValue([])

    render(<Dashboard roles={roles} values={values} activeSession={null} now={new Date('2026-10-22T10:00:00.000Z')} />)

    const daybook = await screen.findByRole('region', { name: 'Your day, in context' })
    const entry = daybook.querySelector('.dashboard-daybook-item')
    expect(entry.querySelector('h3').textContent).toBe('Study')
    expect(within(entry).queryByRole('group')).toBeNull()
    expect(within(entry).queryByText('Boundary')).toBeNull()
    expect(within(entry).queryByRole('list', { name: 'Values' })).toBeNull()
  })

  it('keeps zero and low-sample sections visible with honest units', async () => {
    api.getDashboardSummary.mockResolvedValue(summary({
      roleSeconds: [{ roleId: 'study', roleName: 'Study', seconds: 0 }],
      transitionCount: 1,
      energyObservations: [{ before: 3, after: 3, switchedAt: '2026-10-22T08:00:00.000Z' }],
      valueAlignment: [{ valueId: 'learning', label: 'Learning', taggedCount: 0, transitionCount: 1 }],
      activeSession: null,
    }))
    api.listSessions.mockResolvedValue([])
    api.listTransitions.mockResolvedValue([])

    render(<Dashboard roles={roles} values={values} activeSession={null} now={new Date('2026-10-22T10:00:00.000Z')} />)

    expect(await screen.findByText('0 min')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Transitions' })).getByText('1')).toBeTruthy()
    expect(screen.getByText('Based on 1 observation')).toBeTruthy()
    const energySummary = screen.getByRole('region', { name: 'Energy before → after' })
    expect(within(energySummary).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '0higher', '0lower', '1same',
    ])
    expect(screen.getByText('0 / 1 switches')).toBeTruthy()
    expect(screen.getByText('No recent transitions in this date range.')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Your day, in context' })).getByText('No role sessions in this date range.')).toBeTruthy()
  })

  it('reloads personal summaries when the date range changes', async () => {
    const user = userEvent.setup()
    render(<Dashboard roles={roles} values={values} activeSession={null} now={new Date('2026-10-22T10:00:00.000Z')} />)

    const initialRecentTransitions = await screen.findByRole('region', { name: 'Recent transitions' })
    await within(initialRecentTransitions).findByText('Finish the project outline')
    await user.selectOptions(screen.getByLabelText('Date range'), '7')

    const updatedRecentTransitions = await screen.findByRole('region', { name: 'Recent transitions' })
    expect(await within(updatedRecentTransitions).findByText('Finish the project outline')).toBeTruthy()
    expect(api.getDashboardSummary).toHaveBeenCalledTimes(2)
    expect(api.getDashboardSummary.mock.calls[1][0].startDate).not.toBe(api.getDashboardSummary.mock.calls[0][0].startDate)
  })

  it('keeps the dashboard readable and offers a retry when saved data fails to load', async () => {
    const user = userEvent.setup()
    api.getDashboardSummary.mockRejectedValueOnce(new Error('private service details'))
      .mockResolvedValueOnce(summary())
    render(<Dashboard roles={roles} values={values} activeSession={activeSession} now={new Date('2026-10-22T10:00:00.000Z')} />)

    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain('Check your connection and try again.')
    expect(screen.queryByText('private service details')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    const recentTransitions = await screen.findByRole('region', { name: 'Recent transitions' })
    expect(await within(recentTransitions).findByText('Finish the project outline')).toBeTruthy()
    expect(api.getDashboardSummary).toHaveBeenCalledTimes(2)
  })

  it('walks through a fictional start, one validated switch, and a computed day review without personal API calls', async () => {
    const user = userEvent.setup()
    const onExitDemo = vi.fn()
    const { unmount } = render(<DemoDashboard onExitDemo={onExitDemo} />)

    expect(screen.getByRole('complementary', { name: 'Wholeturn workspace' })).toBeTruthy()
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(2)
    expect(screen.getByText('Sample workspace')).toBeTruthy()
    expect(document.querySelector('.topbar-account .account-email')?.textContent).toBe('Fictional sample')
    const banner = screen.getByRole('note')
    expect(within(banner).getByText('Prototype preview · fictional data · nothing is saved')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Start your sample day' })).toBeTruthy()
    expect(document.querySelector('.demo-start-grid')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'A sample day in three moments' })).toBeTruthy()
    expect(screen.getByText('Capture a handoff')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Start sample day' }))
    expect(screen.getByRole('alert').textContent).toContain('Choose a role')

    await user.selectOptions(screen.getByLabelText('Role'), 'study')
    await user.click(screen.getByRole('button', { name: 'Start sample day' }))
    expect(screen.getByRole('heading', { name: 'Study', level: 2 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your day, in context' })).toBe(document.activeElement)
    expect(screen.getByRole('button', { name: 'Switch role' })).toBeTruthy()
    expect(api.getDashboardSummary).not.toHaveBeenCalled()
    expect(api.listSessions).not.toHaveBeenCalled()
    expect(api.listTransitions).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Switch role' }))
    const incomingRole = screen.getByLabelText(/Switching into/)
    expect(incomingRole).toBe(document.activeElement)
    expect(incomingRole.querySelector('option[value="study"]')).toBeNull()
    const switchForm = incomingRole.closest('form')
    await user.click(within(switchForm).getByRole('button', { name: 'Save switch' }))
    expect(screen.getByText('Choose your energy level before the switch.')).toBeTruthy()
    expect(screen.getByText('Add a short focus intention to continue.')).toBeTruthy()
    expect(screen.queryByText('Study → Freelance')).toBeNull()

    await user.selectOptions(screen.getByLabelText(/Switching into/), 'freelance')
    await user.click(within(screen.getByRole('group', { name: /Energy before/ })).getByLabelText('2 · Low'))
    await user.click(within(screen.getByRole('group', { name: /Energy after/ })).getByLabelText('3 · Steady'))
    await user.type(screen.getByLabelText(/Focus intention/), 'Finish the client update')
    await user.click(screen.getByLabelText('Learning'))
    await user.type(screen.getByLabelText(/Boundary note/), 'Pause at lunch')
    await user.click(screen.getByRole('button', { name: 'Save switch' }))

    expect(screen.getByRole('heading', { name: 'Freelance', level: 2 })).toBeTruthy()
    expect(screen.getByText('Study → Freelance')).toBeTruthy()
    expect(screen.getByText('Finish the client update')).toBeTruthy()
    expect(screen.getByText(/Values: Learning/)).toBeTruthy()
    expect(screen.getByText(/Boundary: Pause at lunch/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Review the day' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Freelance', level: 2 })).toBe(document.activeElement)
    expect(api.getDashboardSummary).not.toHaveBeenCalled()
    expect(api.listSessions).not.toHaveBeenCalled()
    expect(api.listTransitions).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Review the day' }))
    expect(screen.getByRole('heading', { name: 'Today, in context' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Today, in context' })).toBe(document.activeElement)
    expect(within(screen.getByRole('region', { name: 'Role time by role' })).getByText('4 hr')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Role time by role' })).getByText('4 hr 30 min')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Role ribbon' })).getByText('4 hr 30 min')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Transitions' })).getByText('1')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Recent transitions' })).getByText(/Energy higher · 2 to 3/)).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Recent transitions' })).getByText('Finish the client update')).toBeTruthy()
    expect(api.getDashboardSummary).not.toHaveBeenCalled()
    expect(api.listSessions).not.toHaveBeenCalled()
    expect(api.listTransitions).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Back to overview' }))
    expect(onExitDemo).toHaveBeenCalledOnce()
    unmount()
    render(<DemoDashboard onExitDemo={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Start your sample day' })).toBeTruthy()
    expect(screen.queryByText('Finish the client update')).toBeNull()
  })
})
