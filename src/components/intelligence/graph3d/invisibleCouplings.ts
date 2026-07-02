// ============================================================================
// invisibleCouplings — temporal coupling with NO structural relationship
// ============================================================================
//
// A CO_CHANGED pair with no direct IMPORTS/CALLS/EXTENDS/IMPLEMENTS edge is a
// relationship that NO static code view can reveal: the files evolve together
// (git history proves it) yet nothing in the code connects them. These are the
// highest-signal fibers of the mental tissue — hidden coupling through shared
// concepts, duplicated logic, implicit contracts or config coincidence.
// ============================================================================

export interface RelationEdgeLike {
  source: string
  target: string
  relationType: string
}

const STRUCTURAL_RELATIONS = new Set(['IMPORTS', 'CALLS', 'EXTENDS', 'IMPLEMENTS'])
const COUPLING_RELATIONS = new Set(['CO_CHANGED', 'CO_CHANGED_TRANSITIVE'])

/** Order-independent pair key */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Return the set of pair keys whose CO_CHANGED coupling has NO direct
 * structural edge — the "invisible couplings".
 */
export function detectInvisibleCouplings(edges: RelationEdgeLike[]): Set<string> {
  const structuralPairs = new Set<string>()
  for (const e of edges) {
    if (STRUCTURAL_RELATIONS.has(e.relationType)) {
      structuralPairs.add(pairKey(e.source, e.target))
    }
  }

  const invisible = new Set<string>()
  for (const e of edges) {
    if (COUPLING_RELATIONS.has(e.relationType) && !structuralPairs.has(pairKey(e.source, e.target))) {
      invisible.add(pairKey(e.source, e.target))
    }
  }
  return invisible
}
