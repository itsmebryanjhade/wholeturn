import { useState } from 'react'
import { trackerApi } from '../../services/trackerApi.js'

function toLocalInput(isoTimestamp) {
  const date = new Date(isoTimestamp)
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function formatElapsed(startedAt) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainder = minutes % 60
  if (days) return `${days}d ${hours}h ${remainder}m`
  if (hours) return `${hours}h ${remainder}m`
  return `${remainder}m`
}

export function ReturnConfirmation({ activeSession, onConfirmed }) {
  const [correctedStart, setCorrectedStart] = useState(() => toLocalInput(activeSession.startedAt))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    const parsedStart = new Date(correctedStart)
    if (!correctedStart || Number.isNaN(parsedStart.getTime())) {
      setError('Enter a valid start time before confirming.')
      return
    }
    if (parsedStart.getTime() > Date.now()) {
      setError('The start time cannot be in the future.')
      return
    }

    setError('')
    setSaving(true)
    try {
      const session = await trackerApi.confirmActiveSessionReturn({
        sessionId: activeSession.id,
        correctedStartedAt: parsedStart.toISOString(),
      })
      onConfirmed(session)
    } catch {
      setError("We couldn't confirm this interval. Your time is still here; check the start time and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="return-page">
      <section className="session-panel return-panel" aria-labelledby="return-title">
        <div className="session-panel-heading">
          <p className="session-kicker">Welcome back · {activeSession.roleName}</p>
          <h1 id="return-title">Check elapsed time</h1>
          <p>Confirm when this session began before returning to your workspace. Sessions can span midnight.</p>
        </div>
        <form className="session-form" onSubmit={handleSubmit} noValidate>
          <div className="return-summary">
            <span>Recorded start</span>
            <strong>{new Date(activeSession.startedAt).toLocaleString()}</strong>
            <span>Elapsed so far</span>
            <strong>{formatElapsed(correctedStart ? new Date(correctedStart).toISOString() : activeSession.startedAt)}</strong>
          </div>
          <div className="form-field">
            <label htmlFor="corrected-start">Recorded start time</label>
            <input
              id="corrected-start"
              type="datetime-local"
              value={correctedStart}
              max={toLocalInput(new Date().toISOString())}
              onChange={(event) => {
                setCorrectedStart(event.target.value)
                setError('')
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'return-error' : 'return-hint'}
            />
            <p className="field-hint" id="return-hint">Adjust this if you started earlier or later than recorded.</p>
            {error && <p className="field-error" id="return-error" role="alert">{error}</p>}
          </div>
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? 'Confirming…' : 'Confirm elapsed time'}
          </button>
        </form>
      </section>
    </main>
  )
}
