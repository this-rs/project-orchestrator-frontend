// ============================================================================
// linkGeometryCost — ce que la géométrie coûte VRAIMENT
// ============================================================================
//
// PHASE 8 du plan Organic Neural Network V3.
//
// LE DÉFAUT. `linkSystem` estimait un budget de triangles avec une formule qui
// ignorait tout ce que le renderer produit réellement : gaines, strates,
// sous-canaux, branches. L'estimation sous-comptait d'un facteur égal au nombre
// de couches par conduit (cinq à dix), donc le budget « 240 000 triangles »
// autorisait en pratique plusieurs millions — et le téléphone chauffait.
//
// LA RÈGLE. Un seul modèle de coût, partagé par l'estimateur (qui décide quoi
// dessiner) et par le renderer (qui dessine). Si les deux divergent, c'est ce
// module qui a raison.
//
// Module pur : aucune dépendance.

/** Segments d'un anneau de section. Doit rester aligné sur le renderer. */
export const SECTION_SEGMENTS = 6

/** Nombre de couches d'un conduit : halo + gaine + structure + N canaux + cœur. */
export function layersForChannels(channels: number): number {
  return 3 + Math.max(0, channels) + 1
}

/** Triangles d'un tronçon de tube : (samples−1) anneaux × segments × 2, par couche. */
export function conduitTriangles(samples: number, layers: number): number {
  const rings = Math.max(0, samples - 1)
  return rings * SECTION_SEGMENTS * 2 * Math.max(1, layers)
}

/** Ce que coûte un bundle complet : son tronc + ses branches. */
export interface BundleCostInput {
  samples: number
  channels: number
  /** Nombre de branches effectivement générées (niveau 1 + niveau 2). */
  branches: number
  /** Échantillons par branche. */
  branchSamples?: number
  /** Couches d'une branche : elles n'ont ni canaux ni cœur. */
  branchLayers?: number
}

export function bundleTrianglesCost(input: BundleCostInput): number {
  const trunk = conduitTriangles(input.samples, layersForChannels(input.channels))
  const branchSamples = input.branchSamples ?? 5
  const branchLayers = input.branchLayers ?? layersForChannels(0)
  return trunk + input.branches * conduitTriangles(branchSamples, branchLayers)
}

/** Mesures réelles, lues sur les tampons produits. */
export interface GeometryStats {
  vertices: number
  triangles: number
  conduits: number
  layers: number
  /** Triangles dont l'alpha moyen dépasse zéro : ce qui coûte en surdessin. */
  transparentTriangles: number
}

/** Compte les triangles d'un index de géométrie. */
export function trianglesFromIndex(indexLength: number): number {
  return Math.floor(indexLength / 3)
}
