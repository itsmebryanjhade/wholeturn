import { useState } from 'react'
import { useAuth } from './AuthContext.js'
import { BrandMark } from '../components/BrandMark.jsx'
import authPhoto from '../assets/mindful-equilibrium-auth.png'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function AuthForm({ onExploreDemo, onBackHome, onAuthenticated, initialMode = 'signIn' }) {
  const { signIn, signUp, configurationError } = useAuth()
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [submitError, setSubmitError] = useState('')
  const [status, setStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isSignIn = mode === 'signIn'

  function changeMode(nextMode) {
    setMode(nextMode)
    setFieldErrors({})
    setSubmitError('')
    setStatus('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')
    setStatus('')

    const nextErrors = {}
    const normalizedEmail = email.trim()
    if (!normalizedEmail) nextErrors.email = 'Enter your email address.'
    else if (!EMAIL_PATTERN.test(normalizedEmail)) {
      nextErrors.email = 'Enter a valid email address.'
    }
    if (!password) nextErrors.password = 'Enter your password.'

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || configurationError) return

    setSubmitting(true)
    try {
      if (isSignIn) {
        const data = await signIn(normalizedEmail, password)
        if (data?.user || data?.session?.user) onAuthenticated?.()
      } else {
        const data = await signUp(normalizedEmail, password)
        if (!data?.session) {
          setStatus('Check your email to confirm your account, then sign in.')
        } else onAuthenticated?.()
      }
    } catch (error) {
      setSubmitError(error.message || 'Authentication failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-page-header">
        <a className="brand" href="#top" aria-label="Wholeturn home">
          <BrandMark />
          <span className="brand-name">
            <strong>Wholeturn</strong>
          </span>
        </a>
        {onBackHome && (
          <button className="auth-back-link" type="button" onClick={onBackHome}>
            Back to overview
          </button>
        )}
      </header>

      <main className="auth-main" id="top">
        <div className="auth-story">
          <img className="auth-story-photo" src={authPhoto} alt="" aria-hidden="true" />
          <div className="auth-story-copy">
            <p className="auth-story-headline">From a sample day to your own.</p>
            <p>A calm place to track your roles and the moments you move between them.</p>
          </div>
        </div>
        <section className="auth-card" aria-labelledby="auth-title">
          <h1 id="auth-title" tabIndex="-1">{isSignIn ? 'Welcome back' : 'Create your account'}</h1>
          <p className="auth-intro">
            {isSignIn
              ? 'Sign in to continue with your private workspace.'
              : 'Start a private space for the roles and transitions in your day.'}
          </p>

          <div className="auth-tabs" role="group" aria-label="Account access">
            <button
              type="button"
              aria-pressed={isSignIn}
              onClick={() => changeMode('signIn')}
              disabled={submitting}
            >
              Sign in
            </button>
            <button
              type="button"
              aria-pressed={!isSignIn}
              onClick={() => changeMode('signUp')}
              disabled={submitting}
            >
              Create account
            </button>
          </div>

          {configurationError && (
            <p className="auth-error" role="alert">
              {configurationError.message}
            </p>
          )}
          {submitError && (
            <p className="auth-error" role="alert">
              {submitError}
            </p>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
            <div className="form-field">
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={'name@example.com' /* taste-skill-ignore: email format hint, not sample data */}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
                disabled={submitting || Boolean(configurationError)}
              />
              {fieldErrors.email && (
                <p className="field-error" id="auth-email-error" role="alert">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="auth-password">Password</label>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
                placeholder={isSignIn ? 'Enter your password' : 'Create a password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
                disabled={submitting || Boolean(configurationError)}
              />
              {fieldErrors.password && (
                <p className="field-error" id="auth-password-error" role="alert">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <button
              className="button button-primary auth-submit"
              type="submit"
              disabled={submitting || Boolean(configurationError)}
            >
              {submitting ? 'Please wait…' : isSignIn ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {onExploreDemo && (
            <div className="auth-demo-action">
              <button className="button" type="button" onClick={onExploreDemo}>Explore demo</button>
              <p>Fictional records only; nothing is saved.</p>
            </div>
          )}

          {status && (
            <p className="auth-success" role="status" aria-live="polite">
              {status}
            </p>
          )}
          <p className="auth-privacy">Your roles and reflections are private to your account.</p>
        </section>
      </main>

      <footer className="auth-footer">Private reflection, in your own words.</footer>
    </div>
  )
}
