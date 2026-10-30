import { useEffect, useMemo, useRef, useState } from 'react'
import { WorkspaceLayout } from '../../components/WorkspaceLayout.jsx'
import { DashboardSkeleton } from '../../components/LoadingStates.jsx'
import { StartSession } from '../sessions/StartSession.jsx'
import { SwitchRoleForm } from '../sessions/SwitchRoleForm.jsx'
import { trackerApi } from '../../services/trackerApi.js'
import {
  demoRoles,
  demoSnapshot,
  demoValues,
  getDemoDashboardData,
} from '../../data/demoData.js'
import './dashboard.css'

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today', days: 1 },
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
]

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDateRange(rangeKey, baseDate, timeZone) {
  const today = new Date(baseDate)
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const start = new Date(end)
  const option = RANGE_OPTIONS.find(({ value }) => value === rangeKey) ?? RANGE_OPTIONS[0]
  start.setDate(start.getDate() - option.days + 1)
  const endExclusive = new Date(end)
  endExclusive.setDate(endExclusive.getDate() + 1)

  return {
    startDate: dateKey(start),
    endDate: dateKey(end),
    from: start.toISOString(),
    to: endExclusive.toISOString(),
    timeZone,
  }
}

function formatDate(dateKeyValue, timeZone = 'UTC', options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return new Intl.DateTimeFormat('en', { ...options, timeZone }).format(
    new Date(`${dateKeyValue}T12:00:00Z`),
  )
}

function formatRangeLabel({ startDate, endDate }) {
  const start = formatDate(startDate)
  return startDate === endDate ? start : `${start} – ${formatDate(endDate)}`
}

function formatDuration(seconds) {
  const minutes = Math.floor(Math.max(0, seconds) / 60)
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours && remainingMinutes) return `${hours} hr ${remainingMinutes} min`
  if (hours) return `${hours} hr`
  return `${minutes} min`
}

function formatLocalTime(timestamp, timeZone, options = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone,
  }).format(new Date(timestamp))
}

function sampleDayTime(referenceTime, hour, minute = 0) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: demoSnapshot.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(referenceTime)).map(({ type, value }) => [type, value]))
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  return new Date(`${parts.year}-${parts.month}-${parts.day}T${time}:00+08:00`).toISOString()
}

function currentElapsedText(session, now) {
  if (!session) return ''
  const seconds = Math.max(0, Math.floor((now - Date.parse(session.startedAt)) / 1000))
  return `Active for ${formatDuration(seconds)}`
}

function energyDirectionCounts(observations) {
  return observations.reduce(
    (counts, { before, after }) => {
      if (after > before) counts.higher += 1
      else if (after < before) counts.lower += 1
      else counts.same += 1
      return counts
    },
    { higher: 0, lower: 0, same: 0 },
  )
}

export function Dashboard({
  roles = [],
  values = [],
  activeSession,
  onStarted,
  onSwitch,
  onCheckElapsed,
  onOpenSettings,
  mode = 'personal',
  now,
  demoRecords,
}) {
  const [rangeKey, setRangeKey] = useState('today')
  const [retryCount, setRetryCount] = useState(0)
  const [personalResult, setPersonalResult] = useState(null)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const isDemo = mode === 'demo'
  const timeZone = isDemo
    ? demoSnapshot.timeZone
    : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const currentTime = now?.getTime() ?? (isDemo ? Date.parse(demoSnapshot.asOf) : clockNow)
  const dateRange = useMemo(
    () => getDateRange(rangeKey, currentTime, timeZone),
    [rangeKey, currentTime, timeZone],
  )
  const query = useMemo(() => ({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    from: dateRange.from,
    to: dateRange.to,
    timeZone: dateRange.timeZone,
  }), [dateRange.endDate, dateRange.from, dateRange.startDate, dateRange.timeZone, dateRange.to])
  const requestKey = `${rangeKey}|${query.startDate}|${query.endDate}|${query.timeZone}|${activeSession?.id ?? ''}|${activeSession?.startedAt ?? ''}`
  const demoData = isDemo
    ? demoRecords
      ? getDemoDashboardData({ ...dateRange, ...demoRecords, roles, values })
      : getDemoDashboardData(dateRange)
    : null
  const loadedResult = isDemo
    ? demoData
    : personalResult?.requestKey === requestKey
      ? personalResult
      : null

  useEffect(() => {
    if (isDemo || now) return undefined
    const interval = window.setInterval(() => setClockNow(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [isDemo, now])

  useEffect(() => {
    if (isDemo) return undefined
    let cancelled = false
    Promise.all([
      trackerApi.getDashboardSummary({
        startDate: query.startDate,
        endDate: query.endDate,
        timeZone: query.timeZone,
      }),
      trackerApi.listSessions({ from: query.from, to: query.to }),
      trackerApi.listTransitions({ from: query.from, to: query.to }),
    ])
      .then(([summary, sessions, transitions]) => {
        if (cancelled) return
        setPersonalResult({ requestKey, summary, sessions, transitions, error: '' })
      })
      .catch(() => {
        if (cancelled) return
        setPersonalResult({ requestKey, summary: null, sessions: [], transitions: [], error: 'We could not load this dashboard. Check your connection and try again.' })
      })
    return () => { cancelled = true }
  }, [isDemo, query, requestKey, retryCount])

  const data = loadedResult
  const summary = data?.summary
  const sessionForDisplay = data ? summary?.activeSession : activeSession
  const activeRoles = roles.filter((role) => !role.archivedAt)
  const maxRoleSeconds = Math.max(0, ...(summary?.roleSeconds ?? []).map(({ seconds }) => seconds))
  const directionCounts = energyDirectionCounts(summary?.energyObservations ?? [])
  const roleNames = new Map(roles.map((role) => [role.id, role.name]))
  const valueNames = new Map(values.map((value) => [value.id, value.label]))
  const sessionsById = new Map((data?.sessions ?? []).map((session) => [session.id, session]))
  const daybookSessions = [...(data?.sessions ?? [])]
    .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
  const transitionsByIncomingSession = new Map(
    (data?.transitions ?? []).map((transition) => [transition.incomingSessionId, transition]),
  )
  const recentTransitions = [...(data?.transitions ?? [])]
    .sort((left, right) => Date.parse(right.switchedAt) - Date.parse(left.switchedAt))
    .slice(0, 4)

  return (
    <div className="dashboard" data-mode={mode}>
      <div className="dashboard-toolbar">
        <div className="form-field dashboard-range-field">
          <label htmlFor="dashboard-range">Date range</label>
          <select id="dashboard-range" value={rangeKey} onChange={(event) => setRangeKey(event.target.value)}>
            {RANGE_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <p className="dashboard-range-caption">{formatRangeLabel(dateRange)}</p>
      </div>

      <section className="dashboard-current" aria-labelledby="dashboard-current-title">
        {sessionForDisplay ? (
          <>
            <div>
              <p className="dashboard-section-label">Current role</p>
              <h2 id="dashboard-current-title">{sessionForDisplay.roleName}</h2>
              <p className="dashboard-current-meta">
                {currentElapsedText(sessionForDisplay, currentTime)}
                <span>Since {formatLocalTime(sessionForDisplay.startedAt, timeZone)}</span>
              </p>
            </div>
            {!isDemo && (
              <div className="dashboard-current-actions">
                <button className="button" type="button" onClick={onCheckElapsed}>Check elapsed time</button>
                <button className="button button-primary" type="button" onClick={onSwitch}>Switch role</button>
              </div>
            )}
          </>
        ) : (
          <div className="dashboard-start">
            <StartSession roles={activeRoles} onStarted={onStarted} />
            {!isDemo && activeRoles.length === 0 && (
              <button className="button" type="button" onClick={onOpenSettings}>Add roles in Settings</button>
            )}
          </div>
        )}
      </section>

      {!isDemo && !data && (!personalResult || personalResult.requestKey !== requestKey || !personalResult.error) && (
        <DashboardSkeleton />
      )}
      {!isDemo && personalResult?.requestKey === requestKey && personalResult.error && (
        <div className="dashboard-error" role="alert">
          <p>{personalResult.error}</p>
          <button className="button" type="button" onClick={() => setRetryCount((count) => count + 1)}>Try again</button>
        </div>
      )}

      {summary && (
        <>
          <section className="dashboard-daybook" aria-labelledby="daybook-title">
            <div className="dashboard-daybook-heading">
              <h2 id="daybook-title">Your day, in context</h2>
              <span>{formatRangeLabel(dateRange)}</span>
            </div>
            {daybookSessions.length ? (
              <ol className="dashboard-daybook-list" aria-label="Role sessions and handoffs">
                {daybookSessions.map((session) => {
                  const transition = transitionsByIncomingSession.get(session.id)
                  const outgoing = transition ? sessionsById.get(transition.outgoingSessionId) : null
                  const roleName = roleNames.get(session.roleId) ?? session.roleName
                  const isActive = !session.endedAt
                  const endedAt = session.endedAt ?? new Date(currentTime).toISOString()
                  const durationSeconds = Math.max(0, (Date.parse(endedAt) - Date.parse(session.startedAt)) / 1000)
                  const transitionValues = transition?.valueIds
                    .map((id) => valueNames.get(id))
                    .filter(Boolean) ?? []

                  return (
                    <li className="dashboard-daybook-item" key={session.id}>
                      <div className="dashboard-daybook-time">
                        <time dateTime={session.startedAt}>
                          <span>{formatLocalTime(session.startedAt, timeZone, { month: 'short', day: 'numeric' })}</span>
                          <span>{formatLocalTime(session.startedAt, timeZone, { hour: 'numeric', minute: '2-digit' })}</span>
                        </time>
                        <span className="dashboard-daybook-dot" aria-hidden="true" />
                      </div>
                      <div className="dashboard-daybook-entry">
                        <div className="dashboard-daybook-entry-heading">
                          <h3>{roleName}</h3>
                          {isActive && <span className="dashboard-daybook-active">Active role</span>}
                          <span className="dashboard-daybook-duration">{formatDuration(durationSeconds)}</span>
                        </div>
                        <p className="dashboard-daybook-range">
                          {isActive
                            ? 'In progress'
                            : `Until ${formatLocalTime(session.endedAt, timeZone, { hour: 'numeric', minute: '2-digit' })}`}
                        </p>
                        {transition && (
                          <div
                            className="dashboard-daybook-handoff"
                            role="group"
                            aria-label={`Handoff from ${roleNames.get(outgoing?.roleId) ?? outgoing?.roleName ?? 'Previous role'} to ${roleName}`}
                          >
                            <div className="dashboard-daybook-handoff-heading">
                              <span>At the switch</span>
                              <time dateTime={transition.switchedAt}>
                                {formatLocalTime(transition.switchedAt, timeZone, { hour: 'numeric', minute: '2-digit' })}
                              </time>
                            </div>
                            <strong className="dashboard-daybook-energy">Energy {transition.energyBefore} → {transition.energyAfter}</strong>
                            <p><span>Focus</span>{transition.focusIntention}</p>
                            {transitionValues.length > 0 && (
                              <ul className="dashboard-daybook-values" aria-label="Values">
                                {transitionValues.map((label) => <li key={label}>{label}</li>)}
                              </ul>
                            )}
                            {transition.boundaryNote && (
                              <p><span>Boundary</span>{transition.boundaryNote}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="dashboard-empty">No role sessions in this date range.</p>
            )}
          </section>

          <section className="dashboard-section dashboard-role-time" aria-labelledby="role-time-title">
            <div className="dashboard-section-heading">
              <h2 id="role-time-title">Role time by role</h2>
              <span>{formatRangeLabel(dateRange)}</span>
            </div>
            {summary.roleSeconds.length ? (
              <ul className="dashboard-role-list">
                {summary.roleSeconds.map(({ roleId, roleName, seconds }) => (
                  <li key={roleId}>
                    <div className="dashboard-role-values">
                      <span>{roleNames.get(roleId) ?? roleName}</span>
                      <span className="dashboard-number">{formatDuration(seconds)}</span>
                    </div>
                    <span className="dashboard-role-track" aria-hidden="true">
                      <span style={{ width: maxRoleSeconds ? `${(seconds / maxRoleSeconds) * 100}%` : '0%' }} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-empty">No role time was recorded in this date range.</p>
            )}
          </section>

          <div className="dashboard-pair">
            <section className="dashboard-section dashboard-metric" aria-labelledby="transitions-title">
              <h2 id="transitions-title">Transitions</h2>
              <p className="dashboard-count">
                <strong>{summary.transitionCount}</strong>
                <span>{summary.transitionCount === 1 ? 'transition' : 'transitions'} in this date range</span>
              </p>
            </section>
            <section className="dashboard-section dashboard-energy" aria-labelledby="energy-title">
              <h2 id="energy-title">Energy before → after</h2>
              <p>Based on {summary.energyObservations.length} {summary.energyObservations.length === 1 ? 'observation' : 'observations'}</p>
              {summary.energyObservations.length ? (
                <ul className="dashboard-energy-counts">
                  <li><strong>{directionCounts.higher}</strong><span>higher</span></li>
                  <li><strong>{directionCounts.lower}</strong><span>lower</span></li>
                  <li><strong>{directionCounts.same}</strong><span>same</span></li>
                </ul>
              ) : (
                <p className="dashboard-empty">No energy observations in this date range.</p>
              )}
            </section>
          </div>

          <section className="dashboard-section dashboard-value-section" aria-labelledby="values-title">
            <div className="dashboard-section-heading">
              <h2 id="values-title">Value tags</h2>
              <span>Tagged / transitions</span>
            </div>
            {summary.valueAlignment.length ? (
              <ul className="dashboard-value-list">
                {summary.valueAlignment.map(({ valueId, label, taggedCount, transitionCount }) => (
                  <li key={valueId}>
                    <span>{valueNames.get(valueId) ?? label}</span>
                    <span className="dashboard-number">{taggedCount} / {transitionCount} switches</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-empty">No saved values to summarize yet.</p>
            )}
          </section>

          <section className="dashboard-section dashboard-ribbon-section" aria-labelledby="ribbon-title">
            <div className="dashboard-section-heading">
              <h2 id="ribbon-title">Role ribbon</h2>
              <span>Sessions in time order</span>
            </div>
            {data.sessions.length ? (
              <ol className="dashboard-ribbon">
                {[...data.sessions]
                  .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
                  .map((session) => {
                    const endedAt = session.endedAt ?? new Date(currentTime).toISOString()
                    const durationSeconds = Math.max(0, (Date.parse(endedAt) - Date.parse(session.startedAt)) / 1000)
                    return (
                      <li key={session.id}>
                        <span className="dashboard-ribbon-mark" aria-hidden="true" />
                        <span className="dashboard-ribbon-role">{roleNames.get(session.roleId) ?? session.roleName}</span>
                        <span>{formatLocalTime(session.startedAt, timeZone)}{session.endedAt ? ` – ${formatLocalTime(session.endedAt, timeZone)}` : ' – Active'}</span>
                        <span className="dashboard-number">{formatDuration(durationSeconds)}</span>
                      </li>
                    )
                  })}
              </ol>
            ) : (
              <p className="dashboard-empty">No role sessions in this date range.</p>
            )}
          </section>

          <section className="dashboard-section dashboard-recent-section" aria-labelledby="recent-title">
            <div className="dashboard-section-heading">
              <h2 id="recent-title">Recent transitions</h2>
              <span>Up to four</span>
            </div>
            {recentTransitions.length ? (
              <ol className="dashboard-recent-list">
                {recentTransitions.map((transition) => {
                  const outgoing = sessionsById.get(transition.outgoingSessionId)
                  const incoming = sessionsById.get(transition.incomingSessionId)
                  const transitionValues = transition.valueIds.map((id) => valueNames.get(id)).filter(Boolean)
                  const direction = transition.energyAfter > transition.energyBefore
                    ? 'higher'
                    : transition.energyAfter < transition.energyBefore
                      ? 'lower'
                      : 'unchanged'
                  return (
                    <li key={transition.id}>
                      <div className="dashboard-recent-heading">
                        <strong>{roleNames.get(outgoing?.roleId) ?? outgoing?.roleName ?? 'Previous role'} → {roleNames.get(incoming?.roleId) ?? incoming?.roleName ?? 'Next role'}</strong>
                        <time dateTime={transition.switchedAt}>{formatLocalTime(transition.switchedAt, timeZone)}</time>
                      </div>
                      <p>{transition.focusIntention}</p>
                      <span>Energy {direction} · {transition.energyBefore} to {transition.energyAfter}</span>
                      {transitionValues.length > 0 && <span className="dashboard-recent-values">Values: {transitionValues.join(', ')}</span>}
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="dashboard-empty">No recent transitions in this date range.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export function DemoDashboard({ onExitDemo }) {
  const [stage, setStage] = useState('start')
  const [showSwitchForm, setShowSwitchForm] = useState(false)
  const [sessions, setSessions] = useState([])
  const [transitions, setTransitions] = useState([])
  const [asOf, setAsOf] = useState(demoSnapshot.asOf)
  const titleRef = useRef(null)
  const activeRoleRef = useRef(null)
  const activeSession = sessions.find((session) => !session.endedAt) ?? null
  const activeRole = demoRoles.find((role) => role.id === activeSession?.roleId)

  useEffect(() => {
    if (stage === 'active' && activeSession && !showSwitchForm) activeRoleRef.current?.focus()
  }, [activeSession, showSwitchForm, stage])

  useEffect(() => {
    if (stage !== 'start') titleRef.current?.focus()
  }, [stage])

  function startSampleDay({ roleId, startedAt }) {
    const role = demoRoles.find((item) => item.id === roleId)
    const sampleStartedAt = sampleDayTime(startedAt, 8, 30)
    const session = { id: 'sample-session-1', roleId, roleName: role.name, startedAt: sampleStartedAt, endedAt: null }
    setSessions([session])
    setAsOf(sampleStartedAt)
    return session
  }

  function saveSampleSwitch(payload) {
    const currentSession = sessions.find(({ id }) => id === payload.activeSessionId)
    const role = demoRoles.find(({ id }) => id === payload.incomingRoleId)
    const switchedAt = sampleDayTime(currentSession.startedAt, 12, 30)
    const incomingSession = {
      id: 'sample-session-2',
      roleId: role.id,
      roleName: role.name,
      startedAt: switchedAt,
      endedAt: null,
    }
    setSessions((records) => [
      ...records.map((session) => session.id === currentSession.id
        ? { ...session, endedAt: switchedAt }
        : session),
      incomingSession,
    ])
    setTransitions([{ ...payload, switchedAt, id: 'sample-transition-1', outgoingSessionId: currentSession.id, incomingSessionId: incomingSession.id }])
    setAsOf(switchedAt)
    setShowSwitchForm(false)
    return { incomingSession }
  }

  function reviewSampleDay() {
    setAsOf(sampleDayTime(sessions[0].startedAt, 17))
    setStage('review')
  }

  const timeline = (
    <ol className="demo-daybook" aria-label="Sample day timeline">
      {sessions.map((session) => {
        const role = demoRoles.find((item) => item.id === session.roleId)
        const transition = transitions.find((item) => item.outgoingSessionId === session.id)
        const endedAt = session.endedAt
        return (
          <li className="demo-daybook-entry" key={session.id}>
            <time className="demo-daybook-time" dateTime={session.startedAt}>{formatLocalTime(session.startedAt, demoSnapshot.timeZone, { hour: 'numeric', minute: '2-digit' })}</time>
            <div className="demo-daybook-body">
              <h3>{role.name}</h3>
              <p className="demo-daybook-duration">{endedAt
                ? formatDuration((Date.parse(endedAt) - Date.parse(session.startedAt)) / 1000)
                : 'Current role'}</p>
              {transition && (
                <div className="demo-daybook-transition">
                  <p>At the switch</p>
                  <strong>{role.name} → {demoRoles.find((item) => item.id === transition.incomingRoleId).name}</strong>
                  <span>Energy {transition.energyBefore} → {transition.energyAfter}</span>
                  <span>{transition.focusIntention}</span>
                  {transition.valueIds.length > 0 && (
                    <span>Values: {transition.valueIds.map((id) => demoValues.find((value) => value.id === id)?.label).filter(Boolean).join(', ')}</span>
                  )}
                  {transition.boundaryNote && <span>Boundary: {transition.boundaryNote}</span>}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )

  return (
    <WorkspaceLayout
      activeView="dashboard"
      workspaceName="Sample workspace"
      sidebarNote="Fictional data · nothing is saved."
      accountContent={(
        <>
          <span className="account-email">Fictional sample</span>
          <button className="button" type="button" onClick={onExitDemo}>Back to overview</button>
        </>
      )}
    >
      <main className="app-content demo-content" aria-labelledby="demo-title">
        <aside className="demo-banner" role="note">Prototype preview · fictional data · nothing is saved</aside>
        <div className="page-heading">
          <p className="breadcrumb">Sample workspace / {stage === 'review' ? 'Dashboard' : 'Sample day'}</p>
          {stage === 'start' && (
            <>
              <h1 id="demo-title" ref={titleRef} tabIndex="-1">Try a sample day</h1>
              <p className="page-subtitle">Start at 8:30 AM, switch at 12:30 PM, then review this fictional day at 5:00 PM.</p>
            </>
          )}
          {stage === 'active' && activeSession && (
            <>
              <h1 id="demo-title" ref={titleRef} tabIndex="-1">Your day, in context</h1>
              <p className="page-subtitle">A role, a handoff, and the intention you want to carry forward.</p>
            </>
          )}
          {stage === 'review' && (
            <>
              <h1 id="demo-title" ref={titleRef} tabIndex="-1">Today, in context</h1>
              <p className="page-subtitle">A sample day calculated from the role sessions and handoff you just recorded.</p>
            </>
          )}
        </div>
        {stage === 'start' && (
          <div className="demo-start-grid">
            <div className="demo-start-form">
              <StartSession roles={demoRoles} demo onStart={startSampleDay} onStarted={() => setStage('active')} />
            </div>
            <aside className="demo-start-preview" aria-label="A sample day in three moments">
              <div className="demo-start-preview-heading">
                <p>Inside the sample</p>
                <h2>One day, three moments</h2>
              </div>
              <ol className="demo-start-moments">
                <li>
                  <time>8:30 AM</time>
                  <div><strong>Begin with a role</strong><span>Choose what you are stepping into.</span></div>
                </li>
                <li>
                  <time>12:30 PM</time>
                  <div><strong>Capture a handoff</strong><span>Note energy, focus, values, and a boundary.</span></div>
                </li>
                <li>
                  <time>5:00 PM</time>
                  <div><strong>Review the day</strong><span>See how time came together across your roles.</span></div>
                </li>
              </ol>
            </aside>
          </div>
        )}
        {stage === 'active' && activeSession && (
          <>
            <section className="demo-active-role" aria-labelledby="demo-active-role-title">
              <div>
                <p className="dashboard-section-label">Current role</p>
                <h2 id="demo-active-role-title" ref={activeRoleRef} tabIndex="-1">{activeRole.name}</h2>
                <p>Since {formatLocalTime(activeSession.startedAt, demoSnapshot.timeZone)}</p>
              </div>
              {!showSwitchForm && transitions.length === 0 && (
                <button className="button button-primary" type="button" onClick={() => setShowSwitchForm(true)}>Switch role</button>
              )}
              {!showSwitchForm && transitions.length > 0 && (
                <button className="button button-primary" type="button" onClick={reviewSampleDay}>Review the day</button>
              )}
            </section>
            {showSwitchForm ? (
              <SwitchRoleForm
                activeSession={{ ...activeSession, roleName: activeRole.name }}
                roles={demoRoles}
                values={demoValues}
                autoFocus
                onSave={saveSampleSwitch}
                onSwitched={() => setShowSwitchForm(false)}
                onCancel={() => setShowSwitchForm(false)}
              />
            ) : timeline}
          </>
        )}
        {stage === 'review' && (
          <>
            <button className="demo-return-link" type="button" onClick={() => setStage('active')}>Back to sample day</button>
            <Dashboard
              mode="demo"
              roles={demoRoles}
              values={demoValues}
              demoRecords={{ sessions, transitions, asOf }}
              now={new Date(asOf)}
            />
          </>
        )}
      </main>
    </WorkspaceLayout>
  )
}
