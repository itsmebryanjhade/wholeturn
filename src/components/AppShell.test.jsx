import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider.jsx'
import { AppShell } from './AppShell.jsx'

const auth = vi.hoisted(() => ({
  listener: null,
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
}))

const tracker = vi.hoisted(() => ({
  listRoles: vi.fn(),
  listValues: vi.fn(),
  getActiveSession: vi.fn(),
  startRoleSession: vi.fn(),
  confirmActiveSessionReturn: vi.fn(),
  switchRole: vi.fn(),
  getDashboardSummary: vi.fn(),
  listSessions: vi.fn(),
  listTransitions: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  setRoleArchived: vi.fn(),
  createValue: vi.fn(),
  updateValue: vi.fn(),
  setValueArchived: vi.fn(),
}))

vi.mock('../services/trackerApi.js', () => ({
  trackerApi: tracker,
  TrackerApiError: class TrackerApiError extends Error {},
}))

vi.mock('../lib/supabaseClient', () => ({
  supabaseClient: {
    auth: {
      onAuthStateChange: auth.onAuthStateChange,
      signInWithPassword: auth.signInWithPassword,
      signUp: auth.signUp,
      signOut: auth.signOut,
    },
  },
  supabaseConfigurationError: null,
}))

const userSession = { user: { id: 'user-1', email: 'bryan@example.com' } }

function renderApp() {
  return render(
    <AuthProvider>
      <AppShell />
    </AuthProvider>,
  )
}

function emitAuthEvent(event, session = null) {
  act(() => auth.listener?.(event, session))
}

describe('AppShell', () => {
  beforeEach(() => {
    auth.listener = null
    auth.onAuthStateChange.mockReset().mockImplementation((listener) => {
      auth.listener = listener
      return { data: { subscription: { unsubscribe: auth.unsubscribe } } }
    })
    auth.signInWithPassword.mockReset().mockResolvedValue({ data: null, error: null })
    auth.signUp.mockReset().mockResolvedValue({ data: null, error: null })
    auth.signOut.mockReset().mockResolvedValue({ error: null })
    auth.unsubscribe.mockReset()
    tracker.listRoles.mockReset().mockResolvedValue([])
    tracker.listValues.mockReset().mockResolvedValue([])
    tracker.getActiveSession.mockReset().mockResolvedValue(null)
    tracker.startRoleSession.mockReset().mockResolvedValue(null)
    tracker.confirmActiveSessionReturn.mockReset().mockResolvedValue(null)
    tracker.switchRole.mockReset().mockResolvedValue(null)
    tracker.getDashboardSummary.mockReset().mockResolvedValue({
      roleSeconds: [],
      transitionCount: 0,
      energyObservations: [],
      valueAlignment: [],
      activeSession: null,
    })
    tracker.listSessions.mockReset().mockResolvedValue([])
    tracker.listTransitions.mockReset().mockResolvedValue([])
    tracker.createRole.mockReset().mockResolvedValue(null)
    tracker.updateRole.mockReset().mockResolvedValue(null)
    tracker.setRoleArchived.mockReset().mockResolvedValue(null)
    tracker.createValue.mockReset().mockResolvedValue(null)
    tracker.updateValue.mockReset().mockResolvedValue(null)
    tracker.setValueArchived.mockReset().mockResolvedValue(null)
  })

  it('keeps the startup splash visible when the initial session resolves immediately', () => {
    vi.useFakeTimers()
    try {
      renderApp()

      expect(screen.getByRole('heading', { name: 'Wholeturn' })).toBeTruthy()
      expect(screen.getByRole('status').textContent).toContain('Bringing your day into view')

      emitAuthEvent('INITIAL_SESSION')
      expect(document.querySelector('.brand-splash')).toBeTruthy()

      act(() => vi.advanceTimersByTime(699))
      expect(document.querySelector('.brand-splash')).toBeTruthy()

      act(() => vi.advanceTimersByTime(1))
      expect(document.querySelector('.brand-splash')).toBeNull()
      expect(screen.getByRole('heading', { name: 'Track the roles in your day.' })).toBeTruthy()
      expect(screen.getAllByRole('button', { name: 'Create your account' })).toHaveLength(2)
      expect(screen.getByRole('button', { name: 'Explore the sample day' })).toBeTruthy()
      expect(screen.getByText('You can try a fictional sample day before signing up. Nothing is saved.')).toBeTruthy()
      expect(screen.getByText('Send the final project note')).toBeTruthy()
      expect(screen.getByRole('group', { name: 'Energy 2 to 3' })).toBeTruthy()
      expect(screen.getByRole('heading', { name: 'Study to Freelance' })).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a workspace-shaped loading state until personal options resolve', async () => {
    let resolveRoles
    tracker.listRoles.mockReturnValue(new Promise((resolve) => { resolveRoles = resolve }))
    renderApp()
    emitAuthEvent('INITIAL_SESSION', userSession)

    await screen.findByRole('complementary', { name: 'Wholeturn workspace' })
    expect(screen.getByRole('status').textContent).toContain('Loading your workspace')
    expect(document.querySelector('.loading-workspace')).toBeTruthy()

    await act(async () => resolveRoles([]))
    expect(await screen.findByRole('heading', { name: 'Today, in context' })).toBeTruthy()
    expect(document.querySelector('.loading-workspace')).toBeNull()
  })

  it('opens account creation from the public page and returns to the overview', async () => {
    const user = userEvent.setup()
    renderApp()
    emitAuthEvent('INITIAL_SESSION')

    await user.click((await screen.findAllByRole('button', { name: 'Create your account' }))[0])
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Back to overview' }))
    expect(screen.getByRole('heading', { name: 'Track the roles in your day.' })).toBeTruthy()
  })

  it('opens sign-in directly from the public page', async () => {
    const user = userEvent.setup()
    renderApp()
    emitAuthEvent('INITIAL_SESSION')

    await user.click(await screen.findByRole('button', { name: 'Sign in' }))

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  })

  it('uses a shared transition for the landing sign-in card when motion is allowed', async () => {
    const user = userEvent.setup()
    const originalMatchMedia = window.matchMedia
    const originalStartViewTransition = document.startViewTransition
    let sharedCardWasNamed = false
    window.matchMedia = vi.fn((query) => ({ matches: query.includes('min-width') }))
    document.startViewTransition = vi.fn((update) => {
      sharedCardWasNamed = document.documentElement.classList.contains('auth-transition-morph')
      update()
      return { finished: Promise.resolve() }
    })

    try {
      renderApp()
      emitAuthEvent('INITIAL_SESSION')
      await user.click(await screen.findByRole('button', { name: 'Sign in' }))

      expect(document.startViewTransition).toHaveBeenCalledOnce()
      expect(sharedCardWasNamed).toBe(true)
      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
      expect(screen.getByText('From a sample day to your own.')).toBeTruthy()
    } finally {
      window.matchMedia = originalMatchMedia
      document.startViewTransition = originalStartViewTransition
    }
  })

  it('opens account creation from the final call to action without a shared-card transition', async () => {
    const user = userEvent.setup()
    const originalMatchMedia = window.matchMedia
    const originalStartViewTransition = document.startViewTransition
    window.matchMedia = vi.fn((query) => ({ matches: query.includes('min-width') }))
    document.startViewTransition = vi.fn((update) => {
      update()
      return { finished: Promise.resolve() }
    })

    try {
      renderApp()
      emitAuthEvent('INITIAL_SESSION')
      await user.click((await screen.findAllByRole('button', { name: 'Create your account' }))[1])

      expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy()
      expect(document.documentElement.classList.contains('auth-transition-morph')).toBe(false)
      expect(document.querySelector('.auth-morph-ghost')).toBeNull()
    } finally {
      window.matchMedia = originalMatchMedia
      document.startViewTransition = originalStartViewTransition
    }
  })

  it('changes screens without animation when reduced motion is requested', async () => {
    const user = userEvent.setup()
    const originalMatchMedia = window.matchMedia
    const originalStartViewTransition = document.startViewTransition
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    document.startViewTransition = vi.fn()

    try {
      renderApp()
      emitAuthEvent('INITIAL_SESSION')
      await user.click(await screen.findByRole('button', { name: 'Sign in' }))

      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
      expect(document.startViewTransition).not.toHaveBeenCalled()
      expect(document.querySelector('.auth-morph-ghost')).toBeNull()
    } finally {
      window.matchMedia = originalMatchMedia
      document.startViewTransition = originalStartViewTransition
    }
  })

  it('animates a temporary sample card when native page transitions are unavailable', async () => {
    const user = userEvent.setup()
    const originalMatchMedia = window.matchMedia
    const originalStartViewTransition = document.startViewTransition
    const originalAnimationFrame = window.requestAnimationFrame
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    window.matchMedia = vi.fn((query) => ({ matches: query.includes('min-width') }))
    document.startViewTransition = undefined
    window.requestAnimationFrame = vi.fn((callback) => callback())
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('welcome-sample')) return { left: 700, top: 160, width: 500, height: 440 }
      if (this.classList.contains('auth-card')) return { left: 820, top: 200, width: 520, height: 530 }
      return originalRect.call(this)
    }

    try {
      renderApp()
      emitAuthEvent('INITIAL_SESSION')
      await user.click(await screen.findByRole('button', { name: 'Sign in' }))

      const ghost = document.querySelector('.auth-morph-ghost')
      expect(ghost?.getAttribute('aria-hidden')).toBe('true')
      expect(ghost?.style.left).toBe('820px')
      expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    } finally {
      document.querySelector('.auth-morph-ghost')?.remove()
      window.matchMedia = originalMatchMedia
      document.startViewTransition = originalStartViewTransition
      window.requestAnimationFrame = originalAnimationFrame
      HTMLElement.prototype.getBoundingClientRect = originalRect
    }
  })

  it('shows the signed-in shell and navigates to each approved view', async () => {
    const user = userEvent.setup()
    renderApp()
    emitAuthEvent('INITIAL_SESSION', userSession)

    expect(await screen.findByRole('heading', { name: 'Today, in context' })).toBeTruthy()
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' })).toHaveLength(2)

    await user.click(screen.getAllByRole('button', { name: 'Switch role' })[0])
    expect(screen.getByRole('heading', { name: 'Switch role' })).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: 'History' })[0])
    expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()

    await user.click(screen.getAllByRole('button', { name: 'Dashboard' })[0])
    expect(screen.getByRole('heading', { name: 'Today, in context' })).toBeTruthy()
  })

  it('refreshes personal roles after adding one and hides archived roles when starting a session', async () => {
    const user = userEvent.setup()
    const study = { id: 'role-study', name: 'Study', archivedAt: null }
    const archived = { id: 'role-archived', name: 'Old role', archivedAt: '2026-10-01T00:00:00.000Z' }
    const caregiver = { id: 'role-caregiver', name: 'Caregiver', archivedAt: null }
    let roles = [study, archived]
    tracker.listRoles.mockImplementation(async () => roles)
    tracker.createRole.mockImplementation(async ({ name }) => {
      roles = [...roles, { ...caregiver, name }]
      return caregiver
    })
    renderApp()
    emitAuthEvent('INITIAL_SESSION', userSession)

    await screen.findByRole('heading', { name: 'Today, in context' })
    await user.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    await user.type(screen.getByRole('textbox', { name: 'New role name' }), 'Caregiver')
    await user.click(screen.getByRole('button', { name: 'Add role' }))

    expect(await screen.findByText('Caregiver')).toBeTruthy()
    expect(tracker.listRoles).toHaveBeenCalledTimes(2)

    await user.click(screen.getAllByRole('button', { name: 'Switch role' })[0])
    const roleSelect = screen.getByLabelText('Role')
    expect(Array.from(roleSelect.options).map((option) => option.textContent)).toContain('Caregiver')
    expect(Array.from(roleSelect.options).map((option) => option.textContent)).not.toContain('Old role')
  })

  it('gives the signed-in skip link a focusable destination', async () => {
    renderApp()
    emitAuthEvent('INITIAL_SESSION', userSession)

    await screen.findByRole('heading', { name: 'Today, in context' })
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main-content')
    expect(document.getElementById('main-content')?.getAttribute('tabindex')).toBe('-1')
  })

  it('returns to the public page after sign-out', async () => {
    const user = userEvent.setup()
    renderApp()
    emitAuthEvent('INITIAL_SESSION', userSession)

    await user.click(await screen.findByRole('button', { name: 'Sign out' }))

    expect(auth.signOut).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Track the roles in your day.' })).toBeTruthy(),
    )
  })

  it('returns to the public page when the auth session expires', async () => {
    renderApp()
    emitAuthEvent('INITIAL_SESSION', userSession)
    expect(await screen.findByRole('heading', { name: 'Today, in context' })).toBeTruthy()

    emitAuthEvent('SIGNED_OUT')

    expect(screen.getByRole('heading', { name: 'Track the roles in your day.' })).toBeTruthy()
  })

  it('opens the interactive fictional sample from the public page and returns without signing in', async () => {
    const user = userEvent.setup()
    renderApp()
    emitAuthEvent('INITIAL_SESSION')

    await user.click(await screen.findByRole('button', { name: 'Try the sample day' }))

    expect(await screen.findByRole('heading', { name: 'Try a sample day' })).toBeTruthy()
    await user.selectOptions(screen.getByLabelText('Role'), 'study')
    await user.click(screen.getByRole('button', { name: 'Start sample day' }))
    expect(await screen.findByRole('heading', { name: 'Study', level: 2 })).toBeTruthy()
    expect(screen.getByRole('note').textContent).toContain('fictional data · nothing is saved')
    expect(tracker.listRoles).not.toHaveBeenCalled()
    expect(tracker.getDashboardSummary).not.toHaveBeenCalled()
    expect(tracker.listSessions).not.toHaveBeenCalled()
    expect(tracker.listTransitions).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Back to overview' }))
    expect(await screen.findByRole('heading', { name: 'Track the roles in your day.' })).toBeTruthy()
  })
})
