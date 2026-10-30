import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceLayout } from './WorkspaceLayout.jsx'

describe('WorkspaceLayout navigation', () => {
  afterEach(() => vi.useRealTimers())

  it('expands the icon rail before navigating and cleans up the delayed change', () => {
    vi.useFakeTimers()
    const onNavigate = vi.fn()
    const { unmount } = render(
      <WorkspaceLayout
        activeView="dashboard"
        onNavigate={onNavigate}
        workspaceName="My workspace"
        sidebarNote="Private"
        accountContent={<span>Account</span>}
      >
        <main>Workspace content</main>
      </WorkspaceLayout>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(screen.getByRole('button', { name: 'Expand navigation' })).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Switch role' })[0])
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toBeTruthy()
    expect(onNavigate).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(149))
    expect(onNavigate).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(onNavigate).toHaveBeenCalledWith('switch')

    unmount()
  })
})
