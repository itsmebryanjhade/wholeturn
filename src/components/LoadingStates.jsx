import { BrandMark } from './BrandMark.jsx'
import { WorkspaceLayout } from './WorkspaceLayout.jsx'
import './loading-states.css'

export function BrandSplash() {
  return (
    <main className="brand-splash">
      <div className="brand-splash-content">
        <BrandMark />
        <h1>Wholeturn</h1>
        <p role="status" aria-live="polite">Bringing your day into view.</p>
      </div>
    </main>
  )
}

function LoadingLines() {
  return (
    <div className="loading-lines">
      <span className="loading-line loading-line-long" />
      <span className="loading-line loading-line-medium" />
      <span className="loading-line loading-line-short" />
    </div>
  )
}

export function WorkspaceSkeleton() {
  return (
    <WorkspaceLayout
      activeView="dashboard"
      workspaceName="Personal workspace"
      sidebarNote=""
      accountContent={<span className="loading-account" aria-hidden="true" />}
    >
      <main className="app-content loading-workspace" id="dashboard">
        <div className="page-heading">
          <p className="breadcrumb">Personal workspace / Dashboard</p>
          <h1>Today, in context</h1>
        </div>
        <div className="loading-workspace-body" role="status" aria-live="polite">
          <p className="loading-caption">Loading your workspace…</p>
          <div className="loading-workspace-grid" aria-hidden="true">
            <div className="loading-panel loading-workspace-current"><LoadingLines /></div>
            <div className="loading-panel loading-workspace-daybook"><LoadingLines /><LoadingLines /></div>
            <div className="loading-panel loading-workspace-summary"><LoadingLines /></div>
          </div>
        </div>
      </main>
    </WorkspaceLayout>
  )
}

export function DashboardSkeleton() {
  return (
    <>
      <div className="loading-panel loading-dashboard" role="status" aria-live="polite">
        <p className="loading-caption">Loading dashboard data…</p>
        <div aria-hidden="true"><LoadingLines /><LoadingLines /><LoadingLines /></div>
      </div>
      <div className="loading-dashboard-grid" aria-hidden="true">
        <div className="loading-panel loading-dashboard-summary"><LoadingLines /></div>
        <div className="loading-panel loading-dashboard-metric"><LoadingLines /></div>
        <div className="loading-panel loading-dashboard-metric"><LoadingLines /></div>
        <div className="loading-panel loading-dashboard-metric"><LoadingLines /></div>
      </div>
    </>
  )
}

export function HistorySkeleton() {
  return (
    <div className="loading-history" role="status" aria-live="polite">
      <p className="loading-caption">Loading saved transitions…</p>
      <div className="loading-history-rows" aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div className="loading-panel loading-history-row" key={row}>
            <span className="loading-line loading-line-time" />
            <LoadingLines />
          </div>
        ))}
      </div>
    </div>
  )
}
