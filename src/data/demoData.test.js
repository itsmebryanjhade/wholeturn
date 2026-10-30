import { describe, expect, it } from 'vitest'
import { demoRoles, demoSessions, demoTransitions, demoValues, getDemoDashboardData, demoSnapshot } from './demoData.js'

const from = '2026-10-20T00:00:00+08:00'
const to = '2026-10-23T00:00:00+08:00'

describe('fictional demo data', () => {
  it('derives role durations, transition counts, energy directions, and value denominators from sample records', () => {
    const { summary, sessions, transitions } = getDemoDashboardData({
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
    })

    const expectedSeconds = demoRoles.map((role) => ({
      roleId: role.id,
      roleName: role.name,
      seconds: demoSessions
        .filter((session) => session.roleId === role.id)
        .reduce((total, session) => {
          const start = Math.max(Date.parse(session.startedAt), Date.parse(from))
          const end = Math.min(Date.parse(session.endedAt ?? demoSnapshot.asOf), Date.parse(to))
          return total + Math.max(0, Math.floor((end - start) / 1000))
        }, 0),
    }))

    expect(summary.roleSeconds).toEqual(expectedSeconds)
    expect(summary.roleSeconds.find(({ roleId }) => roleId === 'freelance').seconds).toBe(8 * 60 * 60 + 15 * 60)
    expect(summary.transitionCount).toBe(transitions.length)
    expect(summary.energyObservations).toHaveLength(transitions.length)
    expect(summary.energyObservations.filter(({ before, after }) => after > before)).toHaveLength(6)
    expect(summary.energyObservations.filter(({ before, after }) => after < before)).toHaveLength(5)
    expect(summary.energyObservations.filter(({ before, after }) => after === before)).toHaveLength(0)
    expect(summary.valueAlignment).toEqual(demoValues.map((value) => ({
      valueId: value.id,
      label: value.label,
      taggedCount: transitions.filter(({ valueIds }) => valueIds.includes(value.id)).length,
      transitionCount: transitions.length,
    })))
    expect(sessions).toHaveLength(demoSessions.length)
  })

  it('only returns records that overlap the selected date range', () => {
    const { summary, sessions, transitions } = getDemoDashboardData({
      from: new Date('2026-10-22T00:00:00+08:00').toISOString(),
      to: new Date('2026-10-23T00:00:00+08:00').toISOString(),
    })

    expect(summary.transitionCount).toBe(4)
    expect(transitions).toHaveLength(4)
    expect(sessions.every((session) => Date.parse(session.endedAt ?? demoSnapshot.asOf) > Date.parse('2026-10-22T00:00:00+08:00'))).toBe(true)
  })

  it('keeps every transition linked to sessions and values from the fictional dataset', () => {
    const sessionIds = new Set(demoSessions.map(({ id }) => id))
    const valueIds = new Set(demoValues.map(({ id }) => id))

    expect(demoTransitions.every(({ outgoingSessionId, incomingSessionId, valueIds: ids }) =>
      sessionIds.has(outgoingSessionId) &&
      sessionIds.has(incomingSessionId) &&
      ids.every((id) => valueIds.has(id)),
    )).toBe(true)
  })

  it('calculates dashboard totals from caller-provided in-memory sample records', () => {
    const sampleSessions = [
      { id: 'sample-1', roleId: 'study', startedAt: '2026-10-22T08:30:00+08:00', endedAt: '2026-10-22T12:30:00+08:00' },
      { id: 'sample-2', roleId: 'freelance', startedAt: '2026-10-22T12:30:00+08:00', endedAt: null },
    ]
    const sampleTransitions = [
      { id: 'sample-transition', outgoingSessionId: 'sample-1', incomingSessionId: 'sample-2', switchedAt: '2026-10-22T12:30:00+08:00', energyBefore: 2, energyAfter: 3, focusIntention: 'Finish the client update', valueIds: ['learning'], boundaryNote: 'Pause at lunch' },
    ]
    const { summary, sessions, transitions } = getDemoDashboardData({
      from: '2026-10-22T00:00:00+08:00',
      to: '2026-10-23T00:00:00+08:00',
      sessions: sampleSessions,
      transitions: sampleTransitions,
      roles: demoRoles,
      values: demoValues,
      asOf: '2026-10-22T13:00:00+08:00',
    })

    expect(summary.roleSeconds.find(({ roleId }) => roleId === 'study').seconds).toBe(4 * 60 * 60)
    expect(summary.roleSeconds.find(({ roleId }) => roleId === 'freelance').seconds).toBe(30 * 60)
    expect(summary.transitionCount).toBe(1)
    expect(summary.activeSession.id).toBe('sample-2')
    expect(summary.valueAlignment.find(({ valueId }) => valueId === 'learning')).toMatchObject({ taggedCount: 1, transitionCount: 1 })
    expect(sessions).toHaveLength(2)
    expect(transitions).toEqual(sampleTransitions)
  })

  it('keeps optional sample values empty without changing transition totals', () => {
    const { summary, transitions } = getDemoDashboardData({
      from: '2026-10-22T00:00:00+08:00',
      to: '2026-10-23T00:00:00+08:00',
      sessions: [],
      transitions: [{ switchedAt: '2026-10-22T12:30:00+08:00', valueIds: [], boundaryNote: null }],
      roles: demoRoles,
      values: demoValues,
      asOf: '2026-10-22T13:00:00+08:00',
    })

    expect(summary.transitionCount).toBe(1)
    expect(summary.valueAlignment.every(({ taggedCount }) => taggedCount === 0)).toBe(true)
    expect(transitions[0].boundaryNote).toBeNull()
  })
})
