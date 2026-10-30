import { useState } from 'react'
import { trackerApi } from '../../services/trackerApi.js'

export function StartSession({ roles, onStarted, onStart, demo = false }) {
  const [roleId, setRoleId] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!roleId) {
      setError('Choose a role to continue.')
      return
    }

    setError('')
    setSaving(true)
    try {
      const input = {
        roleId,
        startedAt: new Date().toISOString(),
      }
      const session = onStart
        ? await onStart(input)
        : await trackerApi.startRoleSession(input)
      onStarted(session)
    } catch {
      setError("We couldn't start this session. Your choice is still here; try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="session-panel start-session-panel" aria-labelledby="start-session-title">
      <div className="session-panel-heading">
        <p className="session-kicker">{demo ? 'Fictional sample' : 'A fresh start'}</p>
        <h2 id="start-session-title">{demo ? 'Start your sample day' : 'Start your first session'}</h2>
        <p>{demo
          ? 'Choose a role to begin. You can record one switch, then review the day.'
          : 'Choose the role you are entering. You can switch roles whenever your day changes.'}</p>
      </div>
      {roles.length ? (
        <form className="session-form" onSubmit={handleSubmit} noValidate>
          <div className="form-field">
            <label htmlFor="start-role">Role</label>
            <select
              id="start-role"
              value={roleId}
              onChange={(event) => {
                setRoleId(event.target.value)
                setError('')
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'start-role-error' : undefined}
            >
              <option value="">Choose a role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            {error && <p className="field-error" id="start-role-error" role="alert">{error}</p>}
          </div>
          <button className="button button-primary" type="submit" disabled={saving}>
            {saving ? 'Starting…' : demo ? 'Start sample day' : 'Start session'}
          </button>
        </form>
      ) : (
        <p className="session-empty-note">There are no active roles yet. Add a role in Settings before you begin.</p>
      )}
    </section>
  )
}
