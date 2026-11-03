/**
 * What a scene object is BUILT from, as a short key — so a data refresh that
 * changes nothing structural does not rebuild it.
 *
 * Every WebSocket flush hands the 3D view a new `graphData` (new arrays, new
 * node objects) even when it carries the same entities at the same places. The
 * creation effects keyed on that identity rebuilt the LineSegments / vascular
 * links, the Points, the tubes and the SpriteText labels (one canvas texture
 * each) on every flush. They now key on these strings instead; an in-place
 * update covers the rest.
 *
 * A key covers what the object's GEOMETRY reads: ids in order (buffer slots are
 * indices), positions (rounded to 0.01), and the grouping that decides how a
 * link bows and bundles (layer, community, group). Styles are not in it — they
 * are rewritten in place. Two 32-bit FNV-1a lanes with different seeds keep the
 * odds of a collision negligible for a key that is only ever compared with the
 * previous one.
 */
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'

class KeyHasher {
  private a = 0x811c9dc5
  private b = 0x01000193 ^ 0x9e3779b9
  private n = 0

  str(s: string): this {
    for (let i = 0; i < s.length; i++) this.code(s.charCodeAt(i))
    this.code(0x1f) // separator: "ab"+"c" ≠ "a"+"bc"
    return this
  }

  num(v: number | undefined): this {
    return this.str(v === undefined || !Number.isFinite(v) ? '_' : String(Math.round(v * 100)))
  }

  private code(c: number): void {
    this.a = Math.imul(this.a ^ c, 0x01000193) >>> 0
    this.b = Math.imul(this.b ^ c, 0x01000193 ^ 0x5bd1e995) >>> 0
    this.n++
  }

  digest(): string {
    return `${this.n.toString(36)}.${this.a.toString(36)}.${this.b.toString(36)}`
  }
}

const endpointId = (end: unknown): string =>
  typeof end === 'object' && end !== null ? String((end as { id?: unknown }).id) : String(end)

/** Ids (in order), positions and grouping of the nodes. */
export function nodeStructureKey(nodes: readonly Graph3DNode[]): string {
  if (nodes.length === 0) return ''
  const h = new KeyHasher()
  for (const n of nodes) {
    h.str(n.id).num(n.x).num(n.y).num(n.z).str(n.layer ?? '').str(n.entityType ?? '')
      .num(n.communityId).str(n.groupKey ?? '')
  }
  return h.digest()
}

/** Endpoints (in order), relation and magnitude of the links. */
export function linkStructureKey(links: readonly Graph3DLink[]): string {
  if (links.length === 0) return ''
  const h = new KeyHasher()
  for (const l of links) {
    h.str(endpointId(l.source)).str(endpointId(l.target)).str(l.relationType ?? '')
      .num(l.weight).num(l.count).num(l.width)
  }
  return h.digest()
}

/** What a super-node label shows: id, text and bundle size (plus its position). */
export function labelStructureKey(nodes: readonly Graph3DNode[]): string {
  if (nodes.length === 0) return ''
  const h = new KeyHasher()
  for (const n of nodes) {
    h.str(n.id).str(n.label ?? '').num(n.data?.count as number | undefined).num(n.x).num(n.y).num(n.z)
  }
  return h.digest()
}
