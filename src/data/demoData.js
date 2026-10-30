const localInstant = (day, time) =>
  new Date(`2026-10-${day}T${time}:00+08:00`).toISOString()

export const demoSnapshot = {
  timeZone: 'Asia/Manila',
  startsAt: localInstant('22', '13:50'),
  asOf: localInstant('22', '16:30'),
}

export const demoRoles = [
  { id: 'study', name: 'Study', color: '#356b55' },
  { id: 'freelance', name: 'Freelance', color: '#61766e' },
  { id: 'family', name: 'Family', color: '#827761' },
  { id: 'rest', name: 'Rest & reset', color: '#7b8180' },
]

export const demoValues = [
  { id: 'learning', label: 'Learning' },
  { id: 'reliability', label: 'Reliability' },
  { id: 'presence', label: 'Presence' },
  { id: 'balance', label: 'Balance' },
]

export const demoSessions = [
  { id: 's1', roleId: 'study', startedAt: localInstant('20', '08:30'), endedAt: localInstant('20', '10:45') },
  { id: 's2', roleId: 'freelance', startedAt: localInstant('20', '10:45'), endedAt: localInstant('20', '12:20') },
  { id: 's3', roleId: 'family', startedAt: localInstant('20', '12:20'), endedAt: localInstant('20', '13:10') },
  { id: 's4', roleId: 'rest', startedAt: localInstant('20', '13:10'), endedAt: localInstant('20', '14:00') },
  { id: 's5', roleId: 'study', startedAt: localInstant('21', '09:00'), endedAt: localInstant('21', '11:15') },
  { id: 's6', roleId: 'freelance', startedAt: localInstant('21', '11:15'), endedAt: localInstant('21', '13:30') },
  { id: 's7', roleId: 'family', startedAt: localInstant('21', '13:30'), endedAt: localInstant('21', '14:15') },
  { id: 's8', roleId: 'study', startedAt: localInstant('21', '14:15'), endedAt: localInstant('21', '15:00') },
  { id: 's9', roleId: 'rest', startedAt: localInstant('21', '15:00'), endedAt: localInstant('21', '15:40') },
  { id: 's10', roleId: 'study', startedAt: localInstant('22', '09:00'), endedAt: localInstant('22', '10:30') },
  { id: 's11', roleId: 'freelance', startedAt: localInstant('22', '10:30'), endedAt: localInstant('22', '12:15') },
  { id: 's12', roleId: 'family', startedAt: localInstant('22', '12:15'), endedAt: localInstant('22', '13:00') },
  { id: 's13', roleId: 'study', startedAt: localInstant('22', '13:00'), endedAt: localInstant('22', '13:50') },
  { id: 's14', roleId: 'freelance', startedAt: demoSnapshot.startsAt, endedAt: null },
]

export const demoTransitions = [
  { id: 't1', outgoingSessionId: 's1', incomingSessionId: 's2', switchedAt: localInstant('20', '10:45'), energyBefore: 2, energyAfter: 3, focusIntention: 'Finish client wireframes', valueIds: ['reliability'], boundaryNote: 'Pause for lunch at 12:20.' },
  { id: 't2', outgoingSessionId: 's2', incomingSessionId: 's3', switchedAt: localInstant('20', '12:20'), energyBefore: 3, energyAfter: 2, focusIntention: 'Give lunch my full attention', valueIds: ['presence'], boundaryNote: null },
  { id: 't3', outgoingSessionId: 's3', incomingSessionId: 's4', switchedAt: localInstant('20', '13:10'), energyBefore: 2, energyAfter: 3, focusIntention: 'Take a screen break', valueIds: ['balance'], boundaryNote: null },
  { id: 't4', outgoingSessionId: 's5', incomingSessionId: 's6', switchedAt: localInstant('21', '11:15'), energyBefore: 3, energyAfter: 2, focusIntention: 'Send one clear project update', valueIds: ['reliability'], boundaryNote: 'Keep the task list short.' },
  { id: 't5', outgoingSessionId: 's6', incomingSessionId: 's7', switchedAt: localInstant('21', '13:30'), energyBefore: 2, energyAfter: 3, focusIntention: 'Be present for lunch', valueIds: ['presence'], boundaryNote: null },
  { id: 't6', outgoingSessionId: 's7', incomingSessionId: 's8', switchedAt: localInstant('21', '14:15'), energyBefore: 3, energyAfter: 2, focusIntention: 'Review the lecture outline', valueIds: ['learning'], boundaryNote: null },
  { id: 't7', outgoingSessionId: 's8', incomingSessionId: 's9', switchedAt: localInstant('21', '15:00'), energyBefore: 2, energyAfter: 3, focusIntention: 'Step away from the screen', valueIds: ['balance'], boundaryNote: 'No more work after 15:40.' },
  { id: 't8', outgoingSessionId: 's10', incomingSessionId: 's11', switchedAt: localInstant('22', '10:30'), energyBefore: 3, energyAfter: 2, focusIntention: 'Review client feedback', valueIds: ['reliability'], boundaryNote: null },
  { id: 't9', outgoingSessionId: 's11', incomingSessionId: 's12', switchedAt: localInstant('22', '12:15'), energyBefore: 2, energyAfter: 3, focusIntention: 'Share lunch without multitasking', valueIds: ['presence'], boundaryNote: null },
  { id: 't10', outgoingSessionId: 's12', incomingSessionId: 's13', switchedAt: localInstant('22', '13:00'), energyBefore: 3, energyAfter: 2, focusIntention: 'Prepare the next module', valueIds: ['learning'], boundaryNote: null },
  { id: 't11', outgoingSessionId: 's13', incomingSessionId: 's14', switchedAt: localInstant('22', '13:50'), energyBefore: 2, energyAfter: 3, focusIntention: 'Send the final project note', valueIds: ['learning', 'reliability'], boundaryNote: 'Review the response tomorrow.' },
]

export function getDemoDashboardData({
  from,
  to,
  sessions = demoSessions,
  transitions = demoTransitions,
  roles = demoRoles,
  values = demoValues,
  asOf = demoSnapshot.asOf,
}) {
  const fromTime = Date.parse(from)
  const toTime = Date.parse(to)
  const asOfTime = Date.parse(asOf)
  const boundedSessions = sessions
    .filter((session) => {
      const end = session.endedAt ? Date.parse(session.endedAt) : asOfTime
      return Date.parse(session.startedAt) < toTime && end > fromTime
    })
    .map((session) => ({
      ...session,
      roleName: roles.find((role) => role.id === session.roleId)?.name ?? 'Unknown role',
    }))
  const boundedTransitions = transitions.filter(({ switchedAt }) => {
    const timestamp = Date.parse(switchedAt)
    return timestamp >= fromTime && timestamp < toTime
  })
  const roleSeconds = roles.map((role) => ({
    roleId: role.id,
    roleName: role.name,
    seconds: sessions
      .filter((session) => session.roleId === role.id)
      .reduce((total, session) => {
        const start = Math.max(Date.parse(session.startedAt), fromTime)
        const end = Math.min(
          Date.parse(session.endedAt ?? asOf),
          toTime,
          asOfTime,
        )
        return total + Math.max(0, Math.floor((end - start) / 1000))
      }, 0),
  }))
  const activeSession = sessions.find((session) => !session.endedAt)

  return {
    summary: {
      roleSeconds,
      transitionCount: boundedTransitions.length,
      energyObservations: boundedTransitions.map(({ energyBefore: before, energyAfter: after, switchedAt }) => ({
        before,
        after,
        switchedAt,
      })),
      valueAlignment: values.map((value) => ({
        valueId: value.id,
        label: value.label,
        taggedCount: boundedTransitions.filter(({ valueIds }) => valueIds.includes(value.id)).length,
        transitionCount: boundedTransitions.length,
      })),
      activeSession: activeSession
        ? {
            ...activeSession,
            roleName: roles.find((role) => role.id === activeSession.roleId)?.name ?? 'Unknown role',
          }
        : null,
    },
    sessions: boundedSessions,
    transitions: boundedTransitions,
  }
}
