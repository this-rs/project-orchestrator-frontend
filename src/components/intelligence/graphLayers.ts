// ============================================================================
// Graph layers — the arithmetic of a per-layer load
//
// History. A first "one request per layer" load (commit 58f0b4e2) was reverted
// because it only ever ADDED: selecting a layer merged its nodes in, but
// deselecting one never removed anything. The layer buttons looked dead and the
// canvas stopped updating.
//
// The two functions below are that missing arithmetic, kept pure so they can be
// tested without a network or a renderer. Any future per-layer loader must go
// through them: `splitBudget` to ask exactly the budget it owns, and
// `dropLayers` to remove what is no longer shown.
// ============================================================================

/** A node as the layer bookkeeping sees it: an id and the layer it belongs to. */
export interface LayerTagged {
  id: string
  layer: string
}

/**
 * Split a total node budget across the layers a request covers.
 *
 * The API applies `limit` PER CATEGORY, so a naive "ask 20 000 for each layer"
 * multiplies the payload. The remainder is distributed to the first layers so
 * the sum is EXACTLY `budget` — not "about".
 */
export function splitBudget(budget: number, layers: string[]): number[] {
  const n = layers.length
  if (n === 0) return []
  const safeBudget = Math.max(0, Math.floor(budget))
  const base = Math.floor(safeBudget / n)
  const remainder = safeBudget - base * n
  return layers.map((_, i) => base + (i < remainder ? 1 : 0))
}

/**
 * Remove everything that belongs to a layer no longer shown.
 *
 * Returns the SAME array reference when nothing has to be dropped, so a caller
 * can use it in a state setter without triggering a re-render for nothing.
 */
export function dropLayers<T extends LayerTagged>(items: T[], keep: Iterable<string>): T[] {
  const allowed = new Set(keep)
  let dropped = false
  const kept: T[] = []
  for (const item of items) {
    if (allowed.has(item.layer)) kept.push(item)
    else dropped = true
  }
  return dropped ? kept : items
}
