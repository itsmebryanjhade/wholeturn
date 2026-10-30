import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { AuthForm } from '../auth/AuthForm.jsx'
import { useAuth } from '../auth/AuthContext.js'
import { WorkspaceLayout } from './WorkspaceLayout.jsx'
import { BrandSplash, WorkspaceSkeleton } from './LoadingStates.jsx'
import { WORKSPACE_VIEWS } from './workspaceViews.js'
import { Dashboard, DemoDashboard } from '../features/dashboard/Dashboard.jsx'
import { WelcomePage } from '../features/landing/WelcomePage.jsx'
import { ReturnConfirmation } from '../features/sessions/ReturnConfirmation.jsx'
import { StartSession } from '../features/sessions/StartSession.jsx'
import { SwitchRoleForm } from '../features/sessions/SwitchRoleForm.jsx'
import { History } from '../features/history/History.jsx'
import { Settings } from '../features/settings/Settings.jsx'
import { trackerApi } from '../services/trackerApi.js'

export function AppShell() {
  const { user, loading, signOut } = useAuth()
  const [activeView, setActiveView] = useState('dashboard')
  const [signOutError, setSignOutError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [trackerData, setTrackerData] = useState({ userId: null, retryCount: -1 })
  const [showDemo, setShowDemo] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [authMode, setAuthMode] = useState('signIn')
  const [showStartupSplash, setShowStartupSplash] = useState(loading)
  const welcomePosition = useRef(null)
  const restoreWelcome = useRef(false)

  useEffect(() => {
    if (!showStartupSplash) return
    const timer = window.setTimeout(() => setShowStartupSplash(false), 700)
    return () => window.clearTimeout(timer)
  }, [showStartupSplash])

  useLayoutEffect(() => {
    if (showAuth) {
      document.getElementById('auth-title')?.focus({ preventScroll: true })
      return
    }
    if (!restoreWelcome.current || !welcomePosition.current) return
    restoreWelcome.current = false
    const { scrollY, source } = welcomePosition.current
    if (window.scrollY !== scrollY) window.scrollTo({ top: scrollY, behavior: 'instant' })
    document.querySelector(`[data-auth-trigger="${source}"]`)?.focus({ preventScroll: true })
  }, [showAuth])

  useEffect(() => {
    let cancelled = false
    if (!user?.id) return () => { cancelled = true }

    Promise.all([trackerApi.listRoles(), trackerApi.listValues(), trackerApi.getActiveSession()])
      .then(([roleRows, valueRows, session]) => {
        if (cancelled) return
        setTrackerData({
          userId: user.id,
          retryCount,
          roles: roleRows,
          values: valueRows,
          activeSession: session,
          needsReturnConfirmation: Boolean(session),
          error: '',
        })
      })
      .catch(() => {
        if (!cancelled) setTrackerData({
          userId: user.id,
          retryCount,
          roles: [],
          values: [],
          activeSession: null,
          needsReturnConfirmation: false,
          error: "We couldn't load your roles and active session. Check your connection and try again.",
        })
      })

    return () => { cancelled = true }
  }, [user?.id, retryCount])

  function changePublicView(update, morph = false) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      update()
      return
    }

    if (document.startViewTransition) {
      if (morph) document.documentElement.classList.add('auth-transition-morph')
      const transition = document.startViewTransition(() => flushSync(update))
      const finish = () => {
        document.documentElement.classList.remove('auth-transition-morph')
        document.getElementById('auth-title')?.focus({ preventScroll: true })
      }
      transition.finished.then(finish, finish)
      return
    }

    const sample = morph ? document.querySelector('.welcome-sample') : null
    const from = sample?.getBoundingClientRect()
    const ghost = from?.width ? sample.cloneNode(true) : null
    if (ghost) {
      ghost.classList.add('auth-morph-ghost')
      ghost.setAttribute('aria-hidden', 'true')
      ghost.inert = true
      Object.assign(ghost.style, {
        left: `${from.left}px`, top: `${from.top}px`,
        width: `${from.width}px`, height: `${from.height}px`,
      })
      document.body.appendChild(ghost)
      ghost.getBoundingClientRect()
    }

    flushSync(update)
    const page = document.querySelector('.auth-page, .welcome-page')
    page?.classList.add('auth-soft-enter')
    const card = ghost && document.querySelector('.auth-card')
    const to = card?.getBoundingClientRect()
    if (to) {
      card.classList.add('auth-panel-arriving')
      requestAnimationFrame(() => Object.assign(ghost.style, {
        left: `${to.left}px`, top: `${to.top}px`,
        width: `${to.width}px`, height: `${to.height}px`, opacity: '0',
      }))
    }
    window.setTimeout(() => {
      ghost?.remove()
      page?.classList.remove('auth-soft-enter')
      card?.classList.remove('auth-panel-arriving')
    }, 560)
  }

  function openAuth(mode, source) {
    welcomePosition.current = { scrollY: window.scrollY, source }
    const morph = source !== 'footer' && window.matchMedia?.('(min-width: 941px)').matches
    changePublicView(() => {
      setAuthMode(mode)
      setShowAuth(true)
      if (window.scrollY) window.scrollTo({ top: 0, behavior: 'instant' })
    }, morph)
  }

  function returnToWelcome() {
    setShowDemo(false)
    setShowAuth(false)
    setAuthMode('signIn')
  }

  function backToWelcome() {
    restoreWelcome.current = true
    document.querySelector('.auth-morph-ghost')?.remove()
    changePublicView(returnToWelcome)
  }

  if (showDemo) return <DemoDashboard onExitDemo={returnToWelcome} />

  if (loading || showStartupSplash) {
    return <BrandSplash />
  }

  if (!user) {
    if (showAuth) {
      return (
        <AuthForm
          initialMode={authMode}
          onBackHome={backToWelcome}
          onAuthenticated={returnToWelcome}
          onExploreDemo={() => setShowDemo(true)}
        />
      )
    }

    return (
      <WelcomePage
        onSignIn={(source) => openAuth('signIn', source)}
        onCreateAccount={(source) => openAuth('signUp', source)}
        onExploreDemo={() => setShowDemo(true)}
      />
    )
  }

  if (trackerData.userId !== user.id || trackerData.retryCount !== retryCount) {
    return <WorkspaceSkeleton />
  }

  const { roles, values, activeSession, needsReturnConfirmation, error: trackerError } = trackerData

  if (trackerError) {
    return (
      <main className="return-page">
        <section className="session-panel" aria-labelledby="tracker-error-title">
          <h1 id="tracker-error-title">Your workspace could not load</h1>
          <p className="shell-error" role="alert">{trackerError}</p>
          <button className="button button-primary" type="button" onClick={() => setRetryCount((count) => count + 1)}>
            Try again
          </button>
        </section>
      </main>
    )
  }

  if (activeSession && needsReturnConfirmation) {
    return (
      <ReturnConfirmation
        activeSession={activeSession}
        onConfirmed={(session) => {
          setTrackerData((current) => ({ ...current, activeSession: session, needsReturnConfirmation: false }))
          setActiveView('dashboard')
        }}
      />
    )
  }

  const view = WORKSPACE_VIEWS.find(({ id }) => id === activeView) ?? WORKSPACE_VIEWS[0]

  async function handleSignOut() {
    setSignOutError('')
    setSigningOut(true)
    try {
      await signOut()
    } catch {
      setSignOutError("We couldn't sign you out. Please try again.")
    } finally {
      setSigningOut(false)
    }
  }

  async function refreshPersonalOptions() {
    const [nextRoles, nextValues] = await Promise.all([
      trackerApi.listRoles(),
      trackerApi.listValues(),
    ])
    setTrackerData((current) => ({ ...current, roles: nextRoles, values: nextValues }))
  }

  return (
    <WorkspaceLayout
      activeView={activeView}
      onNavigate={setActiveView}
      workspaceName="Personal workspace"
      sidebarNote="Your roles stay private to your account."
      accountContent={(
        <>
          <span className="account-email">{user.email}</span>
          <button className="button" type="button" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </>
      )}
    >
          <main
            className={[
              'app-content',
              activeView === 'switch' && !activeSession && 'app-content-session',
            ].filter(Boolean).join(' ')}
            id={activeView}
            tabIndex="-1"
            aria-labelledby="page-title"
          >
            <div className="page-heading">
              <p className="breadcrumb">Personal workspace / {view.label}</p>
              <h1 id="page-title">{view.title}</h1>
              <p className="page-subtitle">{view.subtitle}</p>
            </div>
            {signOutError && (
              <p className="shell-error" role="alert">
                {signOutError}
              </p>
            )}
            {activeView === 'dashboard' && (
              <Dashboard
                roles={roles}
                values={values}
                activeSession={activeSession}
                onStarted={(session) => {
                  setTrackerData((current) => ({ ...current, activeSession: session, needsReturnConfirmation: false }))
                }}
                onSwitch={() => setActiveView('switch')}
                onCheckElapsed={() => setTrackerData((current) => ({ ...current, needsReturnConfirmation: true }))}
                onOpenSettings={() => setActiveView('settings')}
              />
            )}
            {activeView === 'switch' && activeSession && (
              <SwitchRoleForm
                activeSession={activeSession}
                roles={roles.filter((role) => !role.archivedAt)}
                values={values.filter((value) => !value.archivedAt)}
                onCancel={() => setActiveView('dashboard')}
                onSwitched={(session) => {
                  setTrackerData((current) => ({ ...current, activeSession: session, needsReturnConfirmation: false }))
                  setActiveView('dashboard')
                }}
              />
            )}
            {activeView === 'switch' && !activeSession && (
              <StartSession roles={roles.filter((role) => !role.archivedAt)} onStarted={(session) => {
                setTrackerData((current) => ({ ...current, activeSession: session, needsReturnConfirmation: false }))
                setActiveView('dashboard')
              }} />
            )}
            {activeView === 'settings' && (
              <Settings roles={roles} values={values} onRefresh={refreshPersonalOptions} />
            )}
            {activeView === 'history' && (
              <History roles={roles} values={values} onOpenDashboard={() => setActiveView('dashboard')} />
            )}
          </main>
    </WorkspaceLayout>
  )
}
