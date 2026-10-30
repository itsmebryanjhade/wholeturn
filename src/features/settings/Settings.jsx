import { useState } from 'react'
import { TrackerApiError, trackerApi } from '../../services/trackerApi.js'
import './settings.css'

const ROLE_SUGGESTIONS = ['Study', 'Freelance', 'Family', 'Rest & reset']
const VALUE_SUGGESTIONS = ['Learning', 'Reliability', 'Presence', 'Balance']
const fallbackError = "We couldn't save that change. Check your connection and try again."

function itemName(item, kind) {
  return kind === 'role' ? item.name : item.label
}

function ChoiceRow({ item, kind, editing, busy, onEdit, onCancel, onSave, onArchive }) {
  const name = itemName(item, kind)
  const noun = kind === 'role' ? 'Role' : 'Value'

  if (editing) {
    return (
      <li className="settings-choice-row settings-choice-row-editing">
        <form
          className="settings-edit-form"
          onSubmit={(event) => {
            event.preventDefault()
            onSave(kind, item, editing.value)
          }}
        >
          <label htmlFor={`edit-${kind}-${item.id}`}>Edit {noun.toLowerCase()} name</label>
          <input
            id={`edit-${kind}-${item.id}`}
            value={editing.value}
            onChange={(event) => onEdit({ ...editing, value: event.target.value })}
            required
          />
          <div className="settings-row-actions">
            <button className="button" type="submit" disabled={busy || !editing.value.trim()}>
              Save {kind}
            </button>
            <button className="button" type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="settings-choice-row">
      <span className="settings-choice-name">{name}</span>
      <div className="settings-row-actions">
        <button
          className="button"
          type="button"
          onClick={() => onEdit({ kind, id: item.id, value: name })}
          disabled={busy}
          aria-label={`Edit ${kind} ${name}`}
        >
          Edit
        </button>
        <button
          className="button"
          type="button"
          onClick={() => onArchive(kind, item)}
          disabled={busy}
          aria-label={`${item.archivedAt ? 'Restore' : 'Archive'} ${kind} ${name}`}
        >
          {item.archivedAt ? 'Restore' : 'Archive'}
        </button>
      </div>
    </li>
  )
}

function ChoiceList({ items, kind, editing, busy, onEdit, onCancel, onSave, onArchive }) {
  const activeItems = items.filter((item) => !item.archivedAt)
  const archivedItems = items.filter((item) => item.archivedAt)
  const plural = kind === 'role' ? 'roles' : 'values'

  return (
    <div className="settings-lists">
      <div>
        <h3>Active {plural}</h3>
        {activeItems.length ? (
          <ul className="settings-choice-list">
            {activeItems.map((item) => (
              <ChoiceRow
                key={item.id}
                item={item}
                kind={kind}
                editing={editing?.kind === kind && editing.id === item.id ? editing : null}
                busy={busy}
                onEdit={onEdit}
                onCancel={onCancel}
                onSave={onSave}
                onArchive={onArchive}
              />
            ))}
          </ul>
        ) : (
          <p className="settings-empty">No active {plural} yet. Add one to start tracking your day.</p>
        )}
      </div>
      {archivedItems.length > 0 && (
        <div>
          <h3>Archived {plural}</h3>
          <ul className="settings-choice-list">
            {archivedItems.map((item) => (
              <ChoiceRow
                key={item.id}
                item={item}
                kind={kind}
                editing={editing?.kind === kind && editing.id === item.id ? editing : null}
                busy={busy}
                onEdit={onEdit}
                onCancel={onCancel}
                onSave={onSave}
                onArchive={onArchive}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StarterSuggestions({ kind, items, busy, suggestions, onChoose }) {
  const existing = new Set(items.map((item) => itemName(item, kind).trim().toLocaleLowerCase()))
  const available = suggestions.filter((suggestion) => !existing.has(suggestion.toLocaleLowerCase()))
  if (!available.length) return null

  return (
    <div className="settings-suggestions">
      <span>Starter suggestions</span>
      <div>
        {available.map((suggestion) => (
          <button
            className="settings-suggestion"
            key={suggestion}
            type="button"
            onClick={() => onChoose(suggestion)}
            disabled={busy}
            aria-label={`Use suggestion: ${suggestion}`}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Settings({ roles, values, onRefresh }) {
  const [roleName, setRoleName] = useState('')
  const [valueName, setValueName] = useState('')
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [refreshFailed, setRefreshFailed] = useState(false)

  async function refreshAfterChange(action, successMessage, afterSave) {
    setBusy(true)
    setError('')
    setNotice('')
    setRefreshFailed(false)

    try {
      await action()
    } catch (cause) {
      setError(cause instanceof TrackerApiError ? cause.message : fallbackError)
      setBusy(false)
      return false
    }

    afterSave?.()
    try {
      await onRefresh()
      setNotice(successMessage)
    } catch {
      setError("Your change was saved, but the list couldn't refresh. Try again.")
      setRefreshFailed(true)
    } finally {
      setBusy(false)
    }
    return true
  }

  async function retryRefresh() {
    setBusy(true)
    setError('')
    try {
      await onRefresh()
      setRefreshFailed(false)
      setNotice('Your lists are up to date.')
    } catch {
      setError("We couldn't refresh your lists. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  async function addChoice(kind, event) {
    event.preventDefault()
    const name = kind === 'role' ? roleName.trim() : valueName.trim()
    if (!name) return

    const created = await refreshAfterChange(
      () => kind === 'role' ? trackerApi.createRole({ name }) : trackerApi.createValue({ label: name }),
      `${kind === 'role' ? 'Role' : 'Value'} added.`,
      () => kind === 'role' ? setRoleName('') : setValueName(''),
    )
    if (created) setEditing(null)
  }

  async function saveEdit(kind, item, name) {
    const nextName = name.trim()
    if (!nextName) return
    const currentName = itemName(item, kind)
    if (nextName === currentName) {
      setEditing(null)
      return
    }

    const saved = await refreshAfterChange(
      () => kind === 'role'
        ? trackerApi.updateRole(item.id, { name: nextName })
        : trackerApi.updateValue(item.id, { label: nextName }),
      `${kind === 'role' ? 'Role' : 'Value'} updated.`,
      () => setEditing(null),
    )
    if (saved) setEditing(null)
  }

  async function toggleArchive(kind, item) {
    const archived = !item.archivedAt
    await refreshAfterChange(
      () => kind === 'role'
        ? trackerApi.setRoleArchived(item.id, archived)
        : trackerApi.setValueArchived(item.id, archived),
      `${kind === 'role' ? 'Role' : 'Value'} ${archived ? 'archived' : 'restored'}.`,
    )
  }

  function renderSection(kind) {
    const isRole = kind === 'role'
    const items = isRole ? roles : values
    const suggestions = isRole ? ROLE_SUGGESTIONS : VALUE_SUGGESTIONS
    const name = isRole ? roleName : valueName
    const setName = isRole ? setRoleName : setValueName

    return (
      <section className="settings-section" aria-labelledby={`settings-${kind}-title`} key={kind}>
        <div className="settings-section-copy">
          <h2 id={`settings-${kind}-title`}>{isRole ? 'Roles' : 'Values'}</h2>
          <p>
            {isRole
              ? 'Name the parts of your day. Active roles are available when you start or switch.'
              : 'Choose the values you may want to notice at a role switch.'}
          </p>
          <p className="settings-section-note">
            Archived {isRole ? 'roles' : 'values'} remain in past entries and can be restored later.
          </p>
        </div>
        <div className="settings-panel">
          <form className="settings-add-form" onSubmit={(event) => addChoice(kind, event)}>
            <label htmlFor={`new-${kind}-name`}>New {kind} name</label>
            <div className="settings-add-row">
              <input
                id={`new-${kind}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
                required
              />
              <button
                className={isRole ? 'button button-primary' : 'button'}
                type="submit"
                disabled={busy || !name.trim()}
              >
                Add {kind}
              </button>
            </div>
          </form>
          <StarterSuggestions
            kind={kind}
            items={items}
            busy={busy}
            suggestions={suggestions}
            onChoose={setName}
          />
          <ChoiceList
            items={items}
            kind={kind}
            editing={editing}
            busy={busy}
            onEdit={setEditing}
            onCancel={() => setEditing(null)}
            onSave={saveEdit}
            onArchive={toggleArchive}
          />
        </div>
      </section>
    )
  }

  return (
    <div className="settings-screen" aria-busy={busy}>
      {(error || notice) && (
        <div className="settings-feedback">
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {refreshFailed && (
            <button className="button" type="button" onClick={retryRefresh} disabled={busy}>
              Try again
            </button>
          )}
        </div>
      )}
      {renderSection('role')}
      {renderSection('value')}
    </div>
  )
}
