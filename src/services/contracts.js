/** @typedef {string} UUID */
/** @typedef {string} UtcIsoString */
/** @typedef {1 | 2 | 3 | 4 | 5} EnergyRating */

/** @typedef {{ id: UUID, name: string, color: string | null, icon: string | null, archivedAt: UtcIsoString | null, createdAt: UtcIsoString }} Role */
/** @typedef {{ id: UUID, label: string, archivedAt: UtcIsoString | null, createdAt: UtcIsoString }} Value */
/** @typedef {{ id: UUID, roleId: UUID, roleName: string, startedAt: UtcIsoString, endedAt: UtcIsoString | null }} Session */
/** @typedef {{ id: UUID, outgoingSessionId: UUID, incomingSessionId: UUID, switchedAt: UtcIsoString, energyBefore: EnergyRating, energyAfter: EnergyRating, focusIntention: string, valueIds: UUID[], boundaryNote: string | null }} Transition */
/** @typedef {{ before: EnergyRating, after: EnergyRating, switchedAt: UtcIsoString }} EnergyObservation */
/** @typedef {{ roleSeconds: Array<{ roleId: UUID, roleName: string, seconds: number }>, transitionCount: number, energyObservations: EnergyObservation[], valueAlignment: Array<{ valueId: UUID, label: string, taggedCount: number, transitionCount: number }>, activeSession: Session | null }} DashboardSummary */
/** @typedef {{ code: string, field?: string, cause: unknown } & Error} TrackerApiError */

/**
 * These JSDoc aliases mirror docs/api/tracker-contract.md so editor tooling
 * can follow the shared JavaScript API without introducing a TypeScript build.
 */
export {}
