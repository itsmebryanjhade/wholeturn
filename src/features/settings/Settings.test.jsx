import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Settings } from './Settings.jsx'

const tracker = vi.hoisted(() => ({
  createRole: vi.fn(),
  updateRole: vi.fn(),
  setRoleArchived: vi.fn(),
  createValue: vi.fn(),
  updateValue: vi.fn(),
  setValueArchived: vi.fn(),
  listRoles: vi.fn(),
  listValues: vi.fn(),
}))

vi.mock('../../services/trackerApi.js', () => ({
  trackerApi: tracker,
  TrackerApiError: class TrackerApiError extends Error {},
}))

const activeRole = { id: 'role-study', name: 'Study', archivedAt: null }
const activeValue = { id: 'value-learning', label: 'Learning', archivedAt: null }
let refreshedRoles
let refreshedValues

function SettingsHarness() {
  const [roles, setRoles] = useState([activeRole])
  const [values, setValues] = useState([activeValue])

  async function refreshLists() {
    const [nextRoles, nextValues] = await Promise.all([
      tracker.listRoles(),
      tracker.listValues(),
    ])
    setRoles(nextRoles)
    setValues(nextValues)
  }

  return <Settings roles={roles} values={values} onRefresh={refreshLists} />
}

function renderSettings() {
  return render(<SettingsHarness />)
}

describe('Settings', () => {
  beforeEach(() => {
    refreshedRoles = [activeRole]
    refreshedValues = [activeValue]
    tracker.createRole.mockReset()
    tracker.updateRole.mockReset()
    tracker.setRoleArchived.mockReset()
    tracker.createValue.mockReset()
    tracker.updateValue.mockReset()
    tracker.setValueArchived.mockReset()
    tracker.listRoles.mockReset().mockImplementation(async () => refreshedRoles)
    tracker.listValues.mockReset().mockImplementation(async () => refreshedValues)
  })

  it('adds a suggested role and refreshes roles and values', async () => {
    const user = userEvent.setup()
    refreshedRoles = [activeRole, { id: 'role-work', name: 'Freelance', archivedAt: null }]
    tracker.createRole.mockResolvedValue(refreshedRoles[1])
    renderSettings()

    await user.click(screen.getByRole('button', { name: 'Use suggestion: Freelance' }))
    expect(screen.getByRole('textbox', { name: 'New role name' }).value).toBe('Freelance')
    await user.click(screen.getByRole('button', { name: 'Add role' }))

    expect(tracker.createRole).toHaveBeenCalledWith({ name: 'Freelance' })
    expect(await screen.findByText('Freelance')).toBeTruthy()
    expect(tracker.listRoles).toHaveBeenCalledOnce()
    expect(tracker.listValues).toHaveBeenCalledOnce()
  })

  it('edits a role by sending only its changed name', async () => {
    const user = userEvent.setup()
    refreshedRoles = [{ ...activeRole, name: 'Coursework' }]
    tracker.updateRole.mockResolvedValue(refreshedRoles[0])
    renderSettings()

    await user.click(screen.getByRole('button', { name: 'Edit role Study' }))
    const input = screen.getByRole('textbox', { name: 'Edit role name' })
    await user.clear(input)
    await user.type(input, 'Coursework')
    await user.click(screen.getByRole('button', { name: 'Save role' }))

    expect(tracker.updateRole).toHaveBeenCalledWith('role-study', { name: 'Coursework' })
    expect(await screen.findByText('Coursework')).toBeTruthy()
  })

  it('archives and restores a role through the refreshed list', async () => {
    const user = userEvent.setup()
    const archivedRole = { ...activeRole, archivedAt: '2026-10-23T00:00:00.000Z' }
    tracker.setRoleArchived.mockImplementation(async (_id, archived) => {
      refreshedRoles = archived ? [archivedRole] : [activeRole]
      return archived ? archivedRole : activeRole
    })
    renderSettings()

    await user.click(screen.getByRole('button', { name: 'Archive role Study' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore role Study' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Restore role Study' }))

    expect(tracker.setRoleArchived).toHaveBeenNthCalledWith(1, 'role-study', true)
    expect(tracker.setRoleArchived).toHaveBeenNthCalledWith(2, 'role-study', false)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archive role Study' })).toBeTruthy())
  })

  it('adds a value and refreshes both option lists', async () => {
    const user = userEvent.setup()
    refreshedValues = [activeValue, { id: 'value-presence', label: 'Presence', archivedAt: null }]
    tracker.createValue.mockResolvedValue(refreshedValues[1])
    renderSettings()

    await user.click(screen.getByRole('button', { name: 'Use suggestion: Presence' }))
    await user.click(screen.getByRole('button', { name: 'Add value' }))

    expect(tracker.createValue).toHaveBeenCalledWith({ label: 'Presence' })
    expect(await screen.findByText('Presence')).toBeTruthy()
    expect(tracker.listRoles).toHaveBeenCalledOnce()
    expect(tracker.listValues).toHaveBeenCalledOnce()
  })

  it('edits a value by sending only its changed label', async () => {
    const user = userEvent.setup()
    refreshedValues = [{ ...activeValue, label: 'Growth' }]
    tracker.updateValue.mockResolvedValue(refreshedValues[0])
    renderSettings()

    await user.click(screen.getByRole('button', { name: 'Edit value Learning' }))
    const input = screen.getByRole('textbox', { name: 'Edit value name' })
    await user.clear(input)
    await user.type(input, 'Growth')
    await user.click(screen.getByRole('button', { name: 'Save value' }))

    expect(tracker.updateValue).toHaveBeenCalledWith('value-learning', { label: 'Growth' })
    expect(await screen.findByText('Growth')).toBeTruthy()
  })

  it('archives and restores a value through the refreshed list', async () => {
    const user = userEvent.setup()
    const archivedValue = { ...activeValue, archivedAt: '2026-10-23T00:00:00.000Z' }
    tracker.setValueArchived.mockImplementation(async (_id, archived) => {
      refreshedValues = archived ? [archivedValue] : [activeValue]
      return archived ? archivedValue : activeValue
    })
    renderSettings()

    await user.click(screen.getByRole('button', { name: 'Archive value Learning' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Restore value Learning' })).toBeTruthy())
    await user.click(screen.getByRole('button', { name: 'Restore value Learning' }))

    expect(tracker.setValueArchived).toHaveBeenNthCalledWith(1, 'value-learning', true)
    expect(tracker.setValueArchived).toHaveBeenNthCalledWith(2, 'value-learning', false)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archive value Learning' })).toBeTruthy())
  })

  it('keeps the new role name and shows a safe error when saving fails', async () => {
    const user = userEvent.setup()
    tracker.createRole.mockRejectedValue(new Error('network failed'))
    renderSettings()

    const input = screen.getByRole('textbox', { name: 'New role name' })
    await user.type(input, 'Caregiver')
    await user.click(screen.getByRole('button', { name: 'Add role' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'New role name' }).value).toBe('Caregiver')
    expect(screen.getByRole('alert').textContent).not.toContain('network failed')
  })

  it('keeps a saved change recoverable when refreshing the lists fails', async () => {
    const user = userEvent.setup()
    tracker.createValue.mockResolvedValue({ id: 'value-presence', label: 'Presence', archivedAt: null })
    tracker.listRoles.mockRejectedValueOnce(new Error('network failed')).mockResolvedValue(refreshedRoles)
    renderSettings()

    await user.type(screen.getByRole('textbox', { name: 'New value name' }), 'Presence')
    await user.click(screen.getByRole('button', { name: 'Add value' }))
    expect((await screen.findByRole('alert')).textContent).toContain("Your change was saved")

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findByRole('status')).textContent).toBe('Your lists are up to date.')
    expect(tracker.listRoles).toHaveBeenCalledTimes(2)
  })
})
