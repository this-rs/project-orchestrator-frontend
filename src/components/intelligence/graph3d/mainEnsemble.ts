// ============================================================================
// mainEnsemble — which ensemble (community) the camera is looking at
// ============================================================================
//
// Asked on 04/11/2026: « on doit détecter la vue principale (l'ensemble
// regardé) de la vue secondaire : si je zoome sur un ensemble, le fond doit
// être moins visible pour que je voie mieux mon ensemble ».
//
// The main ensemble is the community whose nodes weigh the most on screen,
// each node weighted by how central it sits (1 at the centre, 0 at the edge of
// the view rectangle). It exists only when one community clearly dominates
// (MAIN_ENSEMBLE_MIN_SHARE of the weight): an overview, where many share the
// screen, has none, and nothing is dimmed. The caller decides WHEN to ask
// (close enough to the graph); this module only reads what is in front.
// ============================================================================

/** Share of the on-screen weight a community needs to be the main ensemble. */
export const MAIN_ENSEMBLE_MIN_SHARE = 0.4

/** The camera, as the cut reads it (see clusterTree.CutView). */
export interface EnsembleView {
  position: readonly [number, number, number]
  forward?: readonly [number, number, number]
  up?: readonly [number, number, number]
  fovDeg: number
  aspect?: number
}

interface Positioned {
  x: number
  y: number
  z: number
  communityId?: number
}

/** The community looked at, or null when none dominates (or the view is incomplete). */
export function mainEnsembleOf(
  nodes: readonly Positioned[],
  view: EnsembleView,
  minShare = MAIN_ENSEMBLE_MIN_SHARE,
): number | null {
  const f = view.forward
  const u = view.up
  if (!f || !u) return null
  // right = forward × up
  const rx = f[1] * u[2] - f[2] * u[1]
  const ry = f[2] * u[0] - f[0] * u[2]
  const rz = f[0] * u[1] - f[1] * u[0]
  const tv = Math.tan((view.fovDeg * Math.PI) / 360)
  const th = tv * (view.aspect ?? 1)
  const [cx, cy, cz] = view.position
  const weight = new Map<number, number>()
  let total = 0
  for (const n of nodes) {
    const dx = n.x - cx
    const dy = n.y - cy
    const dz = n.z - cz
    const depth = dx * f[0] + dy * f[1] + dz * f[2]
    if (!(depth > 0)) continue
    const sx = Math.abs((dx * rx + dy * ry + dz * rz) / (depth * th))
    const sy = Math.abs((dx * u[0] + dy * u[1] + dz * u[2]) / (depth * tv))
    const edge = Math.max(sx, sy)
    if (!(edge < 1)) continue
    const w = 1 - edge
    total += w
    if (n.communityId == null) continue
    weight.set(n.communityId, (weight.get(n.communityId) ?? 0) + w)
  }
  if (!(total > 0)) return null
  let best: number | null = null
  let bestW = 0
  for (const [id, w] of weight) {
    if (w > bestW || (w === bestW && best != null && id < best)) {
      best = id
      bestW = w
    }
  }
  return best != null && bestW / total >= minShare ? best : null
}

/** The visibility bubble: a sphere around the point looked at (squared radius). */
export type Bubble = { x: number; y: number; z: number; r2: number }

/** Whether `p` lies in the bubble (false without a bubble or a position). */
export function inBubble(b: Bubble | null, p: { x?: number; y?: number; z?: number } | undefined): boolean {
  if (!b || !p || typeof p.x !== 'number' || typeof p.y !== 'number' || typeof p.z !== 'number') return false
  const dx = p.x - b.x
  const dy = p.y - b.y
  const dz = p.z - b.z
  return dx * dx + dy * dy + dz * dz <= b.r2
}
