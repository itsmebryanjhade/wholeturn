import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider.jsx'
import { AuthForm } from './AuthForm.jsx'

const auth = vi.hoisted(() => ({
  listener: null,
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
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

function renderAuthForm(providerProps) {
  return render(
    <AuthProvider {...providerProps}>
      <AuthForm />
    </AuthProvider>,
  )
}

function emitAuthEvent(event, session = null) {
  act(() => auth.listener?.(event, session))
}

describe('AuthForm', () => {
  beforeEach(() => {
    auth.listener = null
    auth.onAuthStateChange.mockReset().mockImplementation((listener) => {
      auth.listener = listener
      return { data: { subscription: { unsubscribe: auth.unsubscribe } } }
    })
    auth.signInWithPassword.mockReset().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    })
    auth.signUp.mockReset().mockResolvedValue({
      data: { user: { id: 'user-1' }, session: null },
      error: null,
    })
    auth.signOut.mockReset().mockResolvedValue({ error: null })
    auth.unsubscribe.mockReset()
  })

  it('validates email and password before sign-in or sign-up', async () => {
    const user = userEvent.setup()
    renderAuthForm()

    await user.type(screen.getByLabelText('Email address'), 'not-an-email')
    await user.click(screen.getAllByRole('button', { name: 'Sign in', exact: true }).at(-1))

    expect(screen.getByText('Enter a valid email address.')).toBeTruthy()
    expect(screen.getByText('Enter your password.')).toBeTruthy()
    expect(auth.signInWithPassword).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Create account', exact: true }))
    await user.clear(screen.getByLabelText('Email address'))
    await user.type(screen.getByLabelText('Email address'), 'bryan@example.com')
    await user.click(screen.getAllByRole('button', { name: 'Create account', exact: true }).at(-1))

    expect(screen.getByText('Enter your password.')).toBeTruthy()
    expect(auth.signUp).not.toHaveBeenCalled()
  })

  it('signs in with a trimmed email and preserves the password as entered', async () => {
    const user = userEvent.setup()
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { user: { id: 'user-1' } } },
      error: null,
    })
    renderAuthForm()
    emitAuthEvent('INITIAL_SESSION')

    await user.type(screen.getByLabelText('Email address'), '  bryan@example.com  ')
    await user.type(screen.getByLabelText('Password'), '  my password  ')
    await user.click(screen.getAllByRole('button', { name: 'Sign in', exact: true }).at(-1))

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'bryan@example.com',
      password: '  my password  ',
    })
  })

  it('shows a confirmation message after sign-up when email confirmation is required', async () => {
    const user = userEvent.setup()
    renderAuthForm()
    emitAuthEvent('INITIAL_SESSION')

    await user.click(screen.getByRole('button', { name: 'Create account', exact: true }))
    await user.type(screen.getByLabelText('Email address'), 'bryan@example.com')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
    await user.click(screen.getAllByRole('button', { name: 'Create account', exact: true }).at(-1))

    expect(auth.signUp).toHaveBeenCalledWith({
      email: 'bryan@example.com',
      password: 'correct horse battery staple',
    })
    expect(screen.getByRole('status').textContent).toContain('Check your email to confirm your account')
  })

  it('uses a neutral error message when Supabase rejects authentication', async () => {
    const user = userEvent.setup()
    auth.signInWithPassword.mockResolvedValue({ data: null, error: new Error('raw auth detail') })
    renderAuthForm()
    emitAuthEvent('INITIAL_SESSION')

    await user.type(screen.getByLabelText('Email address'), 'bryan@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong password')
    await user.click(screen.getAllByRole('button', { name: 'Sign in', exact: true }).at(-1))

    expect(screen.getByRole('alert').textContent).toContain(
      "We couldn't sign you in with those details. Check your email and password and try again.",
    )
    expect(screen.queryByText('raw auth detail')).toBeNull()
  })

  it('explains missing Supabase configuration and disables auth actions', () => {
    renderAuthForm({
      client: null,
      configurationError: new Error('Supabase is not configured.'),
    })

    expect(screen.getByRole('alert').textContent).toContain('Supabase is not configured.')
    expect(screen.getAllByRole('button', { name: 'Sign in', exact: true }).at(-1).disabled).toBe(true)
    expect(auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('opens the read-only demo when the separate preview action is selected', async () => {
    const user = userEvent.setup()
    const onExploreDemo = vi.fn()
    render(
      <AuthProvider>
        <AuthForm onExploreDemo={onExploreDemo} />
      </AuthProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Explore demo' }))

    expect(onExploreDemo).toHaveBeenCalledOnce()
    expect(screen.getByText('Fictional records only; nothing is saved.')).toBeTruthy()
  })

  it('unsubscribes from auth changes when the form unmounts', () => {
    const { unmount } = renderAuthForm()

    unmount()

    expect(auth.unsubscribe).toHaveBeenCalledOnce()
  })
})
