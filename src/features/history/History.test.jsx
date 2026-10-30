import { act, render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { History } from './History.jsx'

const tracker = vi.hoisted(() => ({
  listTransitions: vi.fn(),
  listSessions: vi.fn(),
  updateTransition: vi.fn(),
  deleteTransition: vi.fn(),
}))

vi.mock('../../services/trackerApi.js', () => ({ trackerApi: tracker }))

const roles = [
  { id: 'role-study', name: 'Study' },
  { id: 'role-freelance', name: 'Freelance' },
]
const values = [
  { id: 'value-learning', label: 'Learning', archivedAt: null },
  { id: 'value-archived', label: 'Reliability', archivedAt: '2026-10-20T00:00:00.000Z' },
]
const transition = {
  id: 'transition-1',
  outgoingSessionId: 'session-study',
  incomingSessionId: 'session-freelance',
  switchedAt: '2026-10-22T04:30:00.000Z',
  energyBefore: 2,
  energyAfter: 3,
  focusIntention: 'Finish the project note',
  valueIds: ['value-learning', 'value-archived'],
  boundaryNote: 'Take a short pause first',
}
const sessions = [
  {
    id: 'session-study',
    roleId: 'role-study',
    startedAt: '2026-10-22T01:00:00.000Z',
    endedAt: transition.switchedAt,
  },
  {
    id: 'session-freelance',
    roleId: 'role-freelance',
    startedAt: transition.switchedAt,
    endedAt: null,
  },
]

function renderHistory() {
  return render(<History roles={roles} values={values} />)
}

describe('History', () => {
  beforeEach(() => {
    tracker.listTransitions.mockReset().mockResolvedValue([transition])
    tracker.listSessions.mockReset().mockResolvedValue(sessions)
    tracker.updateTransition.mockReset().mockResolvedValue({
      ...transition,
      focusIntention: 'Be present this afternoon',
      boundaryNote: null,
    })
    tracker.deleteTransition.mockReset().mockResolvedValue(undefined)
  })

  it('shows transition-shaped placeholders until history arrives', async () => {
    let resolveTransitions
    tracker.listTransitions.mockReturnValue(new Promise((resolve) => { resolveTransitions = resolve }))
    renderHistory()

    expect(screen.getByRole('status').textContent).toContain('Loading saved transitions')
    expect(document.querySelector('.loading-history')).toBeTruthy()

    await act(async () => resolveTransitions([transition]))
    expect(await screen.findByRole('heading', { name: 'Study to Freelance' })).toBeTruthy()
    expect(document.querySelector('.loading-history')).toBeNull()
  })

  it('loads and presents the saved role handoff and reflection', async () => {
    renderHistory()

    expect(await screen.findByRole('heading', { name: 'Study to Freelance' })).toBeTruthy()
    expect(screen.getByText('Finish the project note')).toBeTruthy()
    expect(screen.getByText('Take a short pause first')).toBeTruthy()
    expect(screen.getByText('Learning')).toBeTruthy()
    expect(screen.getByText(/2\s+Low.*3\s+Steady/)).toBeTruthy()
  })

  it('shows the empty state and can retry a failed history load', async () => {
    const user = userEvent.setup()
    tracker.listTransitions.mockResolvedValueOnce([])
    const empty = renderHistory()
    expect(await screen.findByText('No transitions yet')).toBeTruthy()
    empty.unmount()

    tracker.listTransitions.mockReset()
      .mockRejectedValueOnce(new Error('raw database detail'))
      .mockResolvedValue([transition])
    tracker.listSessions.mockReset().mockResolvedValue(sessions)
    renderHistory()
    expect(await screen.findByRole('alert')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Study to Freelance' })).toBeTruthy()
    expect(tracker.listTransitions).toHaveBeenCalledTimes(2)
  })

  it('edits a transition and preserves linked archived values', async () => {
    const user = userEvent.setup()
    renderHistory()
    await user.click(await screen.findByRole('button', { name: 'Edit Study to Freelance transition' }))

    const time = screen.getByLabelText('Switched at')
    fireEvent.change(time, { target: { value: '2026-10-22T06:30' } })
    await user.selectOptions(screen.getByLabelText('Energy before'), '4')
    await user.selectOptions(screen.getByLabelText('Energy after'), '2')
    await user.clear(screen.getByLabelText('Focus intention'))
    await user.type(screen.getByLabelText('Focus intention'), 'Be present this afternoon')
    await user.click(screen.getByLabelText('Learning'))
    await user.clear(screen.getByLabelText(/^Boundary note/))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(tracker.updateTransition).toHaveBeenCalledWith({
      transitionId: 'transition-1',
      patch: {
        switchedAt: new Date('2026-10-22T06:30').toISOString(),
        energyBefore: 4,
        energyAfter: 2,
        focusIntention: 'Be present this afternoon',
        valueIds: ['value-archived'],
        boundaryNote: null,
      },
    }))
    expect(await screen.findByText('Be present this afternoon')).toBeTruthy()
  })

  it('keeps edit values available and shows safe feedback when saving fails', async () => {
    const user = userEvent.setup()
    tracker.updateTransition.mockRejectedValue(new Error('raw database detail'))
    renderHistory()
    await user.click(await screen.findByRole('button', { name: 'Edit Study to Freelance transition' }))
    const focus = screen.getByLabelText('Focus intention')
    await user.clear(focus)
    await user.type(focus, 'Keep this reflection')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('could not be saved')
    expect(alert.textContent).not.toContain('raw database detail')
    expect(screen.getByLabelText('Focus intention').value).toBe('Keep this reflection')
  })

  it('requires a named delete confirmation and keeps sessions unchanged', async () => {
    const user = userEvent.setup()
    renderHistory()
    await user.click(await screen.findByRole('button', { name: 'Delete Study to Freelance transition' }))

    const confirmation = await screen.findByRole('group', { name: 'Remove this transition reflection?' })
    expect(within(confirmation).getByText(/role sessions and their durations will remain saved/i)).toBeTruthy()
    await user.click(within(confirmation).getByRole('button', { name: 'Cancel' }))
    expect(tracker.deleteTransition).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Delete Study to Freelance transition' }))
    const secondConfirmation = await screen.findByRole('group', { name: 'Remove this transition reflection?' })
    await user.click(within(secondConfirmation).getByRole('button', { name: 'Delete transition' }))
    await waitFor(() => expect(tracker.deleteTransition).toHaveBeenCalledWith('transition-1'))
    expect(await screen.findByText('No transitions yet')).toBeTruthy()
    expect(tracker.listSessions).toHaveBeenCalledTimes(1)
  })

  it('retains the transition if delete fails', async () => {
    const user = userEvent.setup()
    tracker.deleteTransition.mockRejectedValue(new Error('raw database detail'))
    renderHistory()
    await user.click(await screen.findByRole('button', { name: 'Delete Study to Freelance transition' }))
    const confirmation = await screen.findByRole('group', { name: 'Remove this transition reflection?' })
    await user.click(within(confirmation).getByRole('button', { name: 'Delete transition' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).not.toContain('raw database detail')
    expect(screen.getByRole('heading', { name: 'Study to Freelance' })).toBeTruthy()
  })
})
