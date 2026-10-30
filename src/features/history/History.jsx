import { useEffect, useMemo, useRef, useState } from 'react'
import { HistorySkeleton } from '../../components/LoadingStates.jsx'
import { trackerApi } from '../../services/trackerApi.js'
import './history.css'

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})
const ENERGY_LABELS = ['', 'Very low', 'Low', 'Steady', 'High', 'Very high']

function roleName(session, roleNames, fallback) {
  return roleNames.get(session?.roleId) ?? session?.roleName ?? fallback
}

function toLocalInput(isoTimestamp) {
  const date = new Date(isoTimestamp)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function EditTransition({ transition, values, onCancel, onSave, saving, error }) {
  const [draft, setDraft] = useState(() => ({
    switchedAt: toLocalInput(transition.switchedAt),
    energyBefore: String(transition.energyBefore),
    energyAfter: String(transition.energyAfter),
    focusIntention: transition.focusIntention,
    valueIds: [...transition.valueIds],
    boundaryNote: transition.boundaryNote ?? '',
  }))
  const originallyLinked = new Set(transition.valueIds)

  function toggleValue(id) {
    setDraft((current) => ({
      ...current,
      valueIds: current.valueIds.includes(id)
        ? current.valueIds.filter((valueId) => valueId !== id)
        : [...current.valueIds, id],
    }))
  }

  function submit(event) {
    event.preventDefault()
    const date = new Date(draft.switchedAt)
    if (!draft.switchedAt || Number.isNaN(date.getTime())) {
      onSave(transition.id, null)
      return
    }
    onSave(transition.id, {
      switchedAt: date.toISOString(),
      energyBefore: Number(draft.energyBefore),
      energyAfter: Number(draft.energyAfter),
      focusIntention: draft.focusIntention,
      valueIds: draft.valueIds,
      boundaryNote: draft.boundaryNote.trim() || null,
    })
  }

  return (
    <form className="history-edit-form" onSubmit={submit} aria-label="Edit transition details">
      <div className="history-edit-grid">
        <label className="history-edit-field" htmlFor={`history-time-${transition.id}`}>
          <span>Switched at</span>
          <input
            id={`history-time-${transition.id}`}
            type="datetime-local"
            required
            value={draft.switchedAt}
            onChange={(event) => setDraft((current) => ({ ...current, switchedAt: event.target.value }))}
          />
        </label>
        <label className="history-edit-field" htmlFor={`history-energy-before-${transition.id}`}>
          <span>Energy before</span>
          <select
            id={`history-energy-before-${transition.id}`}
            value={draft.energyBefore}
            onChange={(event) => setDraft((current) => ({ ...current, energyBefore: event.target.value }))}
          >
            {ENERGY_LABELS.slice(1).map((label, index) => (
              <option key={label} value={index + 1}>{index + 1} · {label}</option>
            ))}
          </select>
        </label>
        <label className="history-edit-field" htmlFor={`history-energy-after-${transition.id}`}>
          <span>Energy after</span>
          <select
            id={`history-energy-after-${transition.id}`}
            value={draft.energyAfter}
            onChange={(event) => setDraft((current) => ({ ...current, energyAfter: event.target.value }))}
          >
            {ENERGY_LABELS.slice(1).map((label, index) => (
              <option key={label} value={index + 1}>{index + 1} · {label}</option>
            ))}
          </select>
        </label>
        <label className="history-edit-field history-edit-wide" htmlFor={`history-focus-${transition.id}`}>
          <span>Focus intention</span>
          <textarea
            id={`history-focus-${transition.id}`}
            required
            rows="2"
            value={draft.focusIntention}
            onChange={(event) => setDraft((current) => ({ ...current, focusIntention: event.target.value }))}
          />
        </label>
        <fieldset className="history-edit-field history-edit-wide history-edit-values">
          <legend>Values</legend>
          <div className="history-edit-checks">
            {values.filter((value) => !value.archivedAt || originallyLinked.has(value.id)).map((value) => (
              <label key={value.id}>
                <input
                  type="checkbox"
                  checked={draft.valueIds.includes(value.id)}
                  onChange={() => toggleValue(value.id)}
                />
                {value.label}{value.archivedAt ? ' · archived' : ''}
              </label>
            ))}
            {draft.valueIds.filter((id) => !values.some((value) => value.id === id)).map((id) => (
              <label key={id}>
                <input type="checkbox" checked onChange={() => toggleValue(id)} />
                Previously selected value · unavailable
              </label>
            ))}
          </div>
          <span className="history-edit-hint">Archived values can stay with this transition or be removed.</span>
        </fieldset>
        <label className="history-edit-field history-edit-wide" htmlFor={`history-boundary-${transition.id}`}>
          <span>Boundary note <small>Optional</small></span>
          <textarea
            id={`history-boundary-${transition.id}`}
            rows="2"
            value={draft.boundaryNote}
            onChange={(event) => setDraft((current) => ({ ...current, boundaryNote: event.target.value }))}
          />
        </label>
      </div>
      {error && <p className="history-action-error" role="alert">{error}</p>}
      <div className="history-form-actions">
        <button className="button" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

export function History({ roles = [], values = [], onOpenDashboard }) {
  const [retryCount, setRetryCount] = useState(0)
  const [result, setResult] = useState({ loading: true, error: '', transitions: [], sessions: [] })
  const [editingId, setEditingId] = useState(null)
  const [confirmingId, setConfirmingId] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const historyHeading = useRef(null)
  const returnFocus = useRef(false)
  const roleNames = useMemo(() => new Map(roles.map(({ id, name }) => [id, name])), [roles])
  const valueNames = useMemo(() => new Map(values.map(({ id, label }) => [id, label])), [values])

  useEffect(() => {
    let cancelled = false
    Promise.all([trackerApi.listTransitions(), trackerApi.listSessions()])
      .then(([transitions, sessions]) => {
        if (!cancelled) setResult({ loading: false, error: '', transitions, sessions })
      })
      .catch(() => {
        if (!cancelled) setResult({
          loading: false,
          error: "We couldn't load your history. Check your connection and try again.",
          transitions: [],
          sessions: [],
        })
      })
    return () => { cancelled = true }
  }, [retryCount])

  const sessionsById = useMemo(
    () => new Map(result.sessions.map((session) => [session.id, session])),
    [result.sessions],
  )
  const transitions = useMemo(
    () => [...result.transitions].sort((left, right) => Date.parse(right.switchedAt) - Date.parse(left.switchedAt)),
    [result.transitions],
  )

  useEffect(() => {
    if (returnFocus.current && !editingId && !confirmingId) {
      historyHeading.current?.focus()
      returnFocus.current = false
    }
  }, [editingId, confirmingId, transitions.length])

  async function saveTransition(transitionId, patch) {
    if (!patch) {
      setActionError('Enter a valid switch time before saving. Your changes are still here.')
      return
    }
    setActionError('')
    setSavingId(transitionId)
    try {
      const updated = await trackerApi.updateTransition({ transitionId, patch })
      setResult((current) => ({
        ...current,
        transitions: current.transitions.map((item) => item.id === transitionId ? updated : item),
        sessions: current.sessions.map((session) => {
          if (session.id === updated.outgoingSessionId) return { ...session, endedAt: updated.switchedAt }
          if (session.id === updated.incomingSessionId) return { ...session, startedAt: updated.switchedAt }
          return session
        }),
      }))
      returnFocus.current = true
      setEditingId(null)
    } catch {
      setActionError('This transition could not be saved. Your changes are still here. Check the time or connection and try again.')
    } finally {
      setSavingId(null)
    }
  }

  async function deleteTransition(transitionId) {
    setActionError('')
    setDeletingId(transitionId)
    try {
      await trackerApi.deleteTransition(transitionId)
      setResult((current) => ({
        ...current,
        transitions: current.transitions.filter((item) => item.id !== transitionId),
      }))
      returnFocus.current = true
      setConfirmingId(null)
    } catch {
      setActionError('This transition could not be deleted. It is still in your history; try again.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="history-screen" aria-labelledby="history-list-title">
      <div className="history-list-heading">
        <h2 id="history-list-title" ref={historyHeading} tabIndex="-1">Transitions</h2>
        {!result.loading && !result.error && (
          <span>{transitions.length} {transitions.length === 1 ? 'transition' : 'transitions'}</span>
        )}
      </div>

      {result.loading && <HistorySkeleton />}

      {result.error && (
        <div className="history-message" role="alert">
          <p>{result.error}</p>
          <button className="button" type="button" onClick={() => {
            setResult({ loading: true, error: '', transitions: [], sessions: [] })
            setRetryCount((count) => count + 1)
          }}>
            Try again
          </button>
        </div>
      )}

      {!result.loading && !result.error && transitions.length === 0 && (
        <div className="history-empty">
          <div>
            <h3>No transitions yet</h3>
            <p>Saved role transitions will appear here after you log activity.</p>
          </div>
          {onOpenDashboard && (
            <button className="button button-primary" type="button" onClick={onOpenDashboard}>
              Go to dashboard
            </button>
          )}
        </div>
      )}

      {!result.loading && !result.error && transitions.length > 0 && (
        <ol className="history-list" aria-label="Saved transitions">
          {transitions.map((transition) => {
            const outgoing = sessionsById.get(transition.outgoingSessionId)
            const incoming = sessionsById.get(transition.incomingSessionId)
            const outgoingName = roleName(outgoing, roleNames, 'Role unavailable')
            const incomingName = roleName(incoming, roleNames, 'Role unavailable')
            const heading = `${outgoingName} to ${incomingName}`
            const switchedAt = new Date(transition.switchedAt)
            const labels = transition.valueIds.map((id) => valueNames.get(id)).filter(Boolean)
            return (
              <li className="history-item" key={transition.id}>
                <article className="history-card">
                  <div className="history-time">
                    <span>Switched at</span>
                    <time dateTime={transition.switchedAt}>
                      <strong>{TIME_FORMAT.format(switchedAt)}</strong>
                      <span>{DATE_FORMAT.format(switchedAt)}</span>
                    </time>
                  </div>
                  <div className="history-content">
                    <div className="history-transition-heading">
                      <h3 aria-label={heading}>
                        {outgoingName}<span aria-hidden="true"> → </span>{incomingName}
                      </h3>
                      {editingId !== transition.id && (
                        <div className="history-actions">
                          <button className="button history-action-button" type="button" aria-label={`Edit ${heading} transition`} onClick={() => {
                            setActionError('')
                            setEditingId(transition.id)
                            setConfirmingId(null)
                          }}>Edit</button>
                          <button
                            className="button history-action-button"
                            type="button"
                            aria-label={`Delete ${heading} transition`}
                            aria-expanded={confirmingId === transition.id}
                            aria-controls={`history-delete-${transition.id}`}
                            onClick={() => {
                            setActionError('')
                            setConfirmingId(transition.id)
                            setEditingId(null)
                          }}>Delete</button>
                        </div>
                      )}
                    </div>

                    {editingId === transition.id ? (
                      <EditTransition
                        key={`${transition.id}-${transition.switchedAt}`}
                        transition={transition}
                        values={values}
                        onCancel={() => {
                          returnFocus.current = true
                          setEditingId(null)
                          setActionError('')
                        }}
                        onSave={saveTransition}
                        saving={savingId === transition.id}
                        error={actionError}
                      />
                    ) : (
                      <>
                        <div className="history-energy">
                          <span>Energy</span>
                          <strong>
                            {transition.energyBefore} {ENERGY_LABELS[transition.energyBefore]}
                            <span aria-hidden="true"> → </span>
                            {transition.energyAfter} {ENERGY_LABELS[transition.energyAfter]}
                          </strong>
                        </div>

                        <div className="history-reflection">
                          <span>Focus intention</span>
                          <p>{transition.focusIntention}</p>
                        </div>

                        {(labels.length > 0 || transition.boundaryNote) && (
                          <div className="history-details">
                            {labels.length > 0 && (
                              <div className="history-values">
                                <span>Values</span>
                                <ul>
                                  {labels.map((label) => <li key={label}>{label}</li>)}
                                </ul>
                              </div>
                            )}
                            {transition.boundaryNote && (
                              <div className="history-boundary">
                                <span>Boundary note</span>
                                <p>{transition.boundaryNote}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {confirmingId === transition.id && (
                      <section className="history-delete-confirm" id={`history-delete-${transition.id}`} role="group" aria-labelledby={`history-delete-title-${transition.id}`}>
                        <div>
                          <h4 id={`history-delete-title-${transition.id}`}>Remove this transition reflection?</h4>
                          <p>{heading} will be removed. The role sessions and their durations will remain saved.</p>
                        </div>
                        {actionError && <p className="history-action-error" role="alert">{actionError}</p>}
                        <div className="history-form-actions">
                          <button className="button" type="button" disabled={deletingId === transition.id} onClick={() => {
                            returnFocus.current = true
                            setConfirmingId(null)
                            setActionError('')
                          }}>Cancel</button>
                          <button className="button button-danger" type="button" disabled={deletingId === transition.id} onClick={() => deleteTransition(transition.id)}>
                            {deletingId === transition.id ? 'Removing…' : 'Delete transition'}
                          </button>
                        </div>
                      </section>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
