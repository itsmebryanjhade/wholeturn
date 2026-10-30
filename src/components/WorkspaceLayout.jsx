import { useEffect, useRef, useState } from 'react'
import { WORKSPACE_VIEWS } from './workspaceViews.js'
import { BrandMark } from './BrandMark.jsx'

const NAV_ICONS = {
  dashboard: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  switch: <><path d="M4 8h15l-3-3m3 3-3 3" /><path d="M20 16H5l3 3m-3-3 3-3" /></>,
  history: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V6h2.6v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.5 1Z" /></>,
}

function NavIcon({ name }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_ICONS[name]}
    </svg>
  )
}

function Navigation({ activeView, onNavigate, className = '', isSidebar = false, isExpanded = true }) {
  return (
    <nav className={className} aria-label="Main navigation">
      {WORKSPACE_VIEWS.map(({ id, label }) => onNavigate ? (
        <button
          key={id}
          className="nav-link"
          type="button"
          aria-current={activeView === id ? 'page' : undefined}
          onClick={() => onNavigate(id, isSidebar && !isExpanded)}
        >
          <NavIcon name={id} />
          <span className="nav-label">{label}</span>
          <span className="nav-tooltip" aria-hidden="true">{label}</span>
          <span className="nav-active-pulse" aria-hidden="true" />
          <span className="nav-active-indicator" aria-hidden="true" />
        </button>
      ) : (
        <span key={id} className="nav-link" aria-current={activeView === id ? 'page' : undefined}>
          <NavIcon name={id} />
          <span className="nav-label">{label}</span>
          <span className="nav-tooltip" aria-hidden="true">{label}</span>
          <span className="nav-active-pulse" aria-hidden="true" />
          <span className="nav-active-indicator" aria-hidden="true" />
        </span>
      ))}
    </nav>
  )
}

export function WorkspaceLayout({
  activeView,
  onNavigate,
  workspaceName,
  sidebarNote,
  accountContent,
  children,
}) {
  const [isNavExpanded, setNavExpanded] = useState(true)
  const navigationTimeout = useRef(null)

  useEffect(() => () => window.clearTimeout(navigationTimeout.current), [])

  function navigate(id, expandFirst = false) {
    window.clearTimeout(navigationTimeout.current)
    if (expandFirst) {
      setNavExpanded(true)
      navigationTimeout.current = window.setTimeout(() => {
        navigationTimeout.current = null
        onNavigate?.(id)
      }, 150)
      return
    }
    onNavigate?.(id)
  }

  return (
    <div className={`app-frame${isNavExpanded ? ' is-nav-expanded' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className={`sidebar${isNavExpanded ? ' is-expanded' : ''}`} aria-label="Wholeturn workspace">
        <div className="sidebar-header">
          <a
            className="brand"
            href={onNavigate ? '#dashboard' : '/'}
            onClick={onNavigate ? () => onNavigate('dashboard') : undefined}
            aria-label="Wholeturn home"
          >
            <BrandMark />
            <span className="brand-name">
              <strong>Wholeturn</strong>
            </span>
          </a>
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={isNavExpanded ? 'Collapse navigation' : 'Expand navigation'}
            aria-expanded={isNavExpanded}
            onClick={() => setNavExpanded(!isNavExpanded)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              {isNavExpanded ? <path d="m6 6 8 8M14 6l-8 8" /> : <path d="m7 4 6 6-6 6" />}
            </svg>
          </button>
        </div>
        <div className="workspace-name">{workspaceName}</div>
        <Navigation
          activeView={activeView}
          onNavigate={onNavigate ? navigate : undefined}
          className="primary-nav"
          isSidebar
          isExpanded={isNavExpanded}
        />
        <div className="sidebar-bottom">
          <p className="privacy-note">{sidebarNote}</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span className="mobile-brand">
            <BrandMark />
            <span>Wholeturn</span>
          </span>
          <div className="topbar-account">{accountContent}</div>
        </header>
        <div className="sheet" id="main-content" tabIndex="-1">{children}</div>
      </div>

      <Navigation activeView={activeView} onNavigate={onNavigate ? navigate : undefined} className="mobile-nav" />
    </div>
  )
}
