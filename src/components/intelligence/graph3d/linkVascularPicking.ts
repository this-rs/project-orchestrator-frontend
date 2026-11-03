// ============================================================================
// linkVascularPicking — retrouver le bundle sous un clic (noyau pur)
// ============================================================================
//
// La couche vasculaire dessine TOUS les bundles dans une seule BufferGeometry
// indexée. Un raycast rend un `faceIndex` (indice de triangle) ; ce module le
// convertit en clé de bundle. Aucun import de three : testable sans WebGL.
//
// Règle dure : un clic ne peut jamais inventer un bundle. Hors de toute plage,
// la réponse est `null`.
// ============================================================================

/** Plage d'indices de triangles appartenant à un bundle : [start, end[. */
export interface BundleRange {
  key: string
  /** Premier triangle du bundle (inclus). */
  start: number
  /** Premier triangle APRÈS le bundle (exclu). */
  end: number
}

/**
 * Retrouve la clé du bundle qui possède ce triangle.
 *
 * `ranges` doit être trié par `start` croissant et sans chevauchement (c'est
 * ce que produit `buildRanges`). Recherche binaire O(log n). Les plages vides
 * (start === end) ne possèdent aucun triangle et ne sont jamais retournées.
 *
 * @param faceIndex indice de triangle fourni par three.js
 * @returns la clé du bundle, ou null si l'indice est hors de toute plage
 */
export function bundleAtTriangle(ranges: readonly BundleRange[], faceIndex: number): string | null {
  if (!Number.isInteger(faceIndex) || faceIndex < 0) return null
  let lo = 0
  let hi = ranges.length - 1
  // Dernière plage dont start <= faceIndex ; les plages vides partageant le
  // même start que la suivante sont écartées par le test `faceIndex < end`.
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (ranges[mid].start <= faceIndex) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (found < 0) return null
  const r = ranges[found]
  return faceIndex < r.end ? r.key : null
}

/**
 * Construit les plages contiguës depuis le nombre de triangles de chaque
 * bundle, dans l'ordre des bundles : la fin d'une plage est le début de la
 * suivante. Une longueur négative ou non finie compte pour 0.
 */
export function buildRanges(keys: readonly string[], trianglesPerBundle: readonly number[]): BundleRange[] {
  const ranges: BundleRange[] = []
  let cursor = 0
  for (let i = 0; i < keys.length; i++) {
    const n = Number.isFinite(trianglesPerBundle[i]) ? Math.max(0, Math.floor(trianglesPerBundle[i])) : 0
    ranges.push({ key: keys[i], start: cursor, end: cursor + n })
    cursor += n
  }
  return ranges
}
