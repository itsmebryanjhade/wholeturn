import { useRef, useState } from 'react'
import { trackerApi } from '../../services/trackerApi.js'

const ENERGY_OPTIONS = [
  { value: 1, label: 'Very low' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Steady' },
  { value: 4, label: 'High' },
  { value: 5, label: 'Very high' },
]

function EnergyChoices({ direction, value, onChange, error }) {
  const label = direction === 'before' ? 'Energy before' : 'Energy after'
  return (
    <fieldset className="form-field energy-fieldset" aria-describedby={error ? `${direction}-energy-error` : undefined}>
      <legend>{label} <span className="required-word">Required</span></legend>
      <div className="energy-options">
        {ENERGY_OPTIONS.map((option) => (
          <label className="energy-option" key={option.value}>
            <input
              type="radio"
              name={`energy-${direction}`}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              aria-label={`${option.value} · ${option.label}`}
              aria-invalid={Boolean(error)}
            />
            <span className="energy-option-value">{option.value}</span>
            <span className="energy-option-name">{option.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="field-error" id={`${direction}-energy-error`} role="alert">{error}</p>}
    </fieldset>
  )
}

export function SwitchRoleForm({ activeSession, roles, values, onSwitched, onCancel, onSave, autoFocus = false }) {
  const [incomingRoleId, setIncomingRoleId] = useState('')
  const [energyBefore, setEnergyBefore] = useState(null)
  const [energyAfter, setEnergyAfter] = useState(null)
  const [focusIntention, setFocusIntention] = useState('')
  const [valueIds, setValueIds] = useState([])
  const [boundaryNote, setBoundaryNote] = useState('')
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const requestRef = useRef(null)
  const availableRoles = roles.filter((role) => role.id !== activeSession.roleId)

  function update(setter, value) {
    setter(value)
    requestRef.current = null
    setErrors({})
    setSaveError('')
  }

  function toggleValue(id) {
    requestRef.current = null
    setValueIds((selected) => selected.includes(id)
      ? selected.filter((valueId) => valueId !== id)
      : [...selected, id])
    setErrors({})
    setSaveError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const nextErrors = {}
    if (!incomingRoleId) nextErrors.role = 'Choose a different active role.'
    if (energyBefore === null) nextErrors.before = 'Choose your energy level before the switch.'
    if (energyAfter === null) nextErrors.after = 'Choose your energy level for the next role.'
    if (!focusIntention.trim()) nextErrors.focus = 'Add a short focus intention to continue.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      setSaveError('')
      return
    }

    const logicalInput = {
      activeSessionId: activeSession.id,
      incomingRoleId,
      energyBefore,
      energyAfter,
      focusIntention: focusIntention.trim(),
      valueIds,
      boundaryNote: boundaryNote.trim() || null,
    }
    const request = requestRef.current ?? {
      payload: {
        ...logicalInput,
        switchedAt: new Date().toISOString(),
        requestId: crypto.randomUUID(),
      },
    }
    requestRef.current = request
    setSaving(true)
    setSaveError('')
    try {
      const result = onSave
        ? await onSave(request.payload)
        : await trackerApi.switchRole(request.payload)
      onSwitched(result.incomingSession)
    } catch {
      setSaveError("We couldn't save this switch. Your entries are still here; check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="session-panel switch-panel" aria-labelledby="switch-session-title">
      <div className="session-panel-heading">
        <p className="session-kicker">{activeSession.roleName} is ending</p>
        <h2 id="switch-session-title">Choose what comes next</h2>
        <p>Pause at the boundary, then set an intention for the role ahead.</p>
      </div>
      {availableRoles.length ? (
        <form className="session-form switch-form" onSubmit={handleSubmit} noValidate>
          <div className="switch-card switch-role-card">
            <div className="form-field">
              <label htmlFor="incoming-role">Switching into <span className="required-word">Required</span></label>
              <select
                id="incoming-role"
                autoFocus={autoFocus}
                value={incomingRoleId}
                onChange={(event) => update(setIncomingRoleId, event.target.value)}
                aria-invalid={Boolean(errors.role)}
                aria-describedby={errors.role ? 'switch-role-error' : undefined}
              >
                <option value="">Choose a different role</option>
                {availableRoles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
              {errors.role && <p className="field-error" id="switch-role-error" role="alert">{errors.role}</p>}
            </div>
          </div>

          <div className="switch-card switch-energy-card energy-fields">
            <EnergyChoices direction="before" value={energyBefore} onChange={(value) => update(setEnergyBefore, value)} error={errors.before} />
            <EnergyChoices direction="after" value={energyAfter} onChange={(value) => update(setEnergyAfter, value)} error={errors.after} />
          </div>

          <div className="switch-card switch-reflection-card">
            <div className="form-field">
              <label htmlFor="focus-intention">Focus intention <span className="required-word">Required</span></label>
              <input
                id="focus-intention"
                type="text"
                value={focusIntention}
                maxLength={160}
                placeholder="What would you like to focus on in this role?"
                onChange={(event) => update(setFocusIntention, event.target.value)}
                aria-invalid={Boolean(errors.focus)}
                aria-describedby={errors.focus ? 'focus-error' : undefined}
              />
              {errors.focus && <p className="field-error" id="focus-error" role="alert">{errors.focus}</p>}
            </div>

            {values.length > 0 && (
              <fieldset className="form-field values-fieldset">
                <legend>Values for this role <span className="optional-word">Optional</span></legend>
                <p className="field-hint">Choose any that feel relevant; they are not a score.</p>
                <div className="value-choice-list">
                  {values.map((value) => (
                    <label className="value-choice" key={value.id}>
                      <input
                        type="checkbox"
                        checked={valueIds.includes(value.id)}
                        onChange={() => toggleValue(value.id)}
                      />
                      <span>{value.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="form-field">
              <label htmlFor="boundary-note">Boundary note <span className="optional-word">Optional</span></label>
              <textarea
                id="boundary-note"
                rows="3"
                maxLength={400}
                value={boundaryNote}
                placeholder="A reminder or limit you want to keep in mind"
                onChange={(event) => update(setBoundaryNote, event.target.value)}
              />
            </div>
          </div>

          {saveError && <p className="field-error save-error" role="alert">{saveError}</p>}
          <div className="session-form-actions">
            {onCancel && <button className="button" type="button" onClick={onCancel}>Cancel</button>}
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? 'Saving switch…' : 'Save switch'}
            </button>
          </div>
        </form>
      ) : (
        <p className="session-empty-note">Add another active role in Settings before switching from {activeSession.roleName}.</p>
      )}
    </section>
  )
}
