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

/**
 * Forme de l'arbre (phase 2), partagée par l'estimateur et le renderer.
 * Sous-moyeux par extrémité, capillaires par sous-moyeu, et leurs échantillons.
 */
export const SUB_HUBS_PER_END = 3
export const CAPILLARIES_PER_SUB_HUB = 3
/** Échantillons d'une branche (plus courte qu'un tronc). */
export const BRANCH_SAMPLES = 5
/** Artère secondaire (moyeu → sous-moyeu) : BRANCH_SAMPLES + 2. */
export const ARTERY_SAMPLES = BRANCH_SAMPLES + 2
/** Capillaire (sous-moyeu → nœud réel) : BRANCH_SAMPLES. */
export const CAPILLARY_SAMPLES = BRANCH_SAMPLES

/** Voies (une par famille de relation) d'un tronc, au plus. */
export const MAX_TRUNK_LANES = 5
/** Canaux d'un conduit : au plus 5, 2 sur mobile. */
export const MAX_CONDUIT_CHANNELS = 5
export const MOBILE_CONDUIT_CHANNELS = 2
/** Échantillons d'une capsule de jonction (pôles fermés). */
export const JUNCTION_SAMPLES = 5

/**
 * Nombre de couches d'un conduit : halo + gaine + structure + N canaux + cœur ;
 * sans canal (une relation), le cœur et une seule peau.
 */
export function layersForChannels(channels: number): number {
  if (channels <= 0) return 2
  return 3 + channels + 1
}

/**
 * Canaux d'un conduit selon ce qu'il PORTE (loi d'échelle) : une relation
 * n'a pas de canal (cœur + une peau) ; au-delà, un canal de plus à chaque
 * doublement, borné par le nombre de familles réellement présentes et par
 * MAX_CONDUIT_CHANNELS (2 sur mobile).
 */
export function conduitChannels(n: number, families: number, mobile = false): number {
  if (!(n > 1)) return 0
  const cap = mobile ? MOBILE_CONDUIT_CHANNELS : MAX_CONDUIT_CHANNELS
  return Math.max(1, Math.min(cap, Math.max(1, Math.floor(families) || 0), 1 + Math.floor(Math.log2(n))))
}

/** Couches d'un conduit qui porte n relations de `families` familles. */
export function conduitLayers(n: number, families: number, mobile = false): number {
  return layersForChannels(conduitChannels(n, families, mobile))
}

/** Voies d'un tronc : une par famille, bornée par les canaux et MAX_TRUNK_LANES. */
export function trunkLanes(families: number, morphologyChannels: number): number {
  return Math.min(
    MAX_TRUNK_LANES,
    Math.max(1, Math.min(Math.max(1, Math.floor(families) || 0), Math.max(1, Math.floor(morphologyChannels) || 0))),
  )
}

/**
 * BORNE HAUTE de l'arbre d'UN côté, pour `endpoints` extrémités distinctes
 * et sans les positions : au plus SUB_HUBS_PER_END artères (une par paquet
 * spatial), au plus CAPILLARIES_PER_SUB_HUB capillaires chacune, et jamais
 * plus de capillaires que d'extrémités. Le compte EXACT dépend du
 * regroupement spatial : il vient de `treeShape` (linkVascularTree.ts).
 */
export function sideTree(endpoints: number): { arteries: number; capillaries: number } {
  const n = Math.max(0, Math.floor(endpoints))
  return {
    arteries: Math.min(SUB_HUBS_PER_END, n),
    capillaries: n <= 1 ? 0 : Math.min(n, SUB_HUBS_PER_END * CAPILLARIES_PER_SUB_HUB),
  }
}

/** Ce que le renderer dessine pour un faisceau. */
export interface RenderedBundleShape {
  /** Échantillons du tronc (SAMPLES_BASE + SAMPLES_PER_DEPTH × profondeur). */
  trunkSamples: number
  /** Canaux de la morphologie (morphology.graphical.channels). */
  morphologyChannels: number
  /** Relations portées par le faisceau (borne du contenu de chaque conduit). */
  n?: number
  /** Familles de relations du corridor ; inconnu ⇒ borne haute (MAX_TRUNK_LANES). */
  families?: number
  /** Extrémités distinctes de chaque côté ; inconnu ⇒ arbre complet (borne haute). */
  endpoints?: readonly [number, number]
  /** Appareil « mobile » : 2 canaux au plus par conduit. */
  mobile?: boolean
  /**
   * Forme EXACTE, calculée sur les positions (linkVascularTree.treeShape) :
   * couches de chaque voie, et triangles de tout le reste (artères,
   * capillaires, capsules). Quand elle est donnée, c'est elle qui compte.
   */
  exact?: ExactShape | null
}

/** Forme exacte d'un faisceau, hors échantillons du tronc (qui dépendent du LOD). */
export interface ExactShape {
  laneLayers: number[]
  treeTriangles: number
}

/**
 * Triangles qu'un faisceau coûte DANS LE RENDERER.
 *
 * Avec `exact` : au triangle près. Sans : une BORNE HAUTE — chaque conduit
 * au contenu du faisceau entier (un enfant porte au plus ce que porte son
 * parent), l'arbre complet de chaque côté, une capsule par port et par
 * sous-moyeu.
 */
export function renderedBundleTriangles(shape: RenderedBundleShape): number {
  if (shape.exact) {
    let total = shape.exact.treeTriangles
    for (const l of shape.exact.laneLayers) total += conduitTriangles(shape.trunkSamples, l)
    return total
  }
  if (shape.exact === null) return 0
  const n = shape.n ?? Number.MAX_SAFE_INTEGER
  const families = shape.families ?? MAX_TRUNK_LANES
  const layers = conduitLayers(n, families, shape.mobile)
  const lanes = trunkLanes(families, shape.morphologyChannels)
  const full = SUB_HUBS_PER_END * CAPILLARIES_PER_SUB_HUB
  const [ea, eb] = shape.endpoints ?? [full, full]
  let total = lanes * conduitTriangles(shape.trunkSamples, layers)
  for (const side of [sideTree(ea), sideTree(eb)]) {
    total += side.arteries * conduitTriangles(ARTERY_SAMPLES, layers)
    total += side.capillaries * conduitTriangles(CAPILLARY_SAMPLES, layers)
    total += (1 + side.arteries) * conduitTriangles(JUNCTION_SAMPLES, layersForChannels(0))
  }
  return total
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
  /** Nombre de branches (forme simple, sans distinction de niveau). */
  branches?: number
  /** Artères secondaires (niveau 2) et capillaires (niveau 3). */
  arteries?: number
  capillaries?: number
  arterySamples?: number
  capillarySamples?: number
  /** Échantillons par branche. */
  branchSamples?: number
  /** Couches d'une branche : elles n'ont ni canaux ni cœur. */
  branchLayers?: number
}

export function bundleTrianglesCost(input: BundleCostInput): number {
  const trunk = conduitTriangles(input.samples, layersForChannels(input.channels))
  const branchLayers = input.branchLayers ?? layersForChannels(0)
  const arteries = input.arteries ?? 0
  const capillaries = input.capillaries ?? 0
  const legacy = input.branches ?? arteries + capillaries
  const arterySamples = input.arterySamples ?? ARTERY_SAMPLES
  const capillarySamples = input.capillarySamples ?? CAPILLARY_SAMPLES
  // Les deux niveaux de l'arbre n'ont pas le même nombre d'échantillons.
  const branchCost =
    arteries > 0 || capillaries > 0
      ? arteries * conduitTriangles(arterySamples, branchLayers) +
        capillaries * conduitTriangles(capillarySamples, branchLayers)
      : legacy * conduitTriangles(input.branchSamples ?? CAPILLARY_SAMPLES, branchLayers)
  return trunk + branchCost
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
