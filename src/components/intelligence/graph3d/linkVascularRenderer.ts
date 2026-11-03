// ============================================================================
// linkVascularRenderer — the vascular link layer of the Organic Link Engine V2
// ============================================================================
//
// Les planches de référence montrent des VAISSEAUX, pas des fils : un tronc
// lumineux, translucide sur ses bords, brillant en son cœur, qui SE RAMIFIE
// dans les grappes qu'il relie. La version précédente dessinait un tube d'un
// pixel entre deux centroïdes : à l'écran, une toile de fils qui traverse le
// vide. Trois écarts, corrigés ici.
//
// 1. DU VOLUME, PAS UN TRAIT. Chaque conduit est dessiné DEUX fois, en deux
//    tubes concentriques : une GAINE large et très transparente (la lumière qui
//    diffuse autour du vaisseau) et un CŒUR étroit et brillant (le flux). C'est
//    ce contraste gaine/cœur qui fait lire un volume, là où un seul tube
//    translucide se lit comme un fil.
//
// 2. DES RAMIFICATIONS RÉELLES. Un tronc relie deux ensembles, mais il ne
//    s'arrête pas dans le vide : à chaque extrémité il se divise en branches qui
//    rejoignent des NŒUDS RÉELS du corridor (les mieux connectés). Rien n'est
//    inventé : chaque branche pointe vers un sommet qui appartient vraiment à
//    l'ensemble.
//
// 3. LA MAGNITUDE PORTE L'ÉPAISSEUR. Le rayon est une fraction du rayon de la
//    scène multipliée par l'ordre de grandeur, et le nombre de brins suit la
//    morphologie. 10⁶ et 10⁹ ne font pas la même chose à l'écran.
//
// Coût : dépend du nombre de CORRIDORS et de leur LOD, jamais du nombre de
// relations résumées. `linkSystem.ts` tient le budget ; ce fichier l'obéit.
// ============================================================================

import * as THREE from 'three'
import type { Graph3DLink, Graph3DNode } from './useGraph3DLayout'
import type { LinkRenderer } from './linkRibbons'
import type { LinkStyle, LinkStyleFn } from './linkRibbon'
import { buildCorridors, endpointToken, type Corridor } from './linkRouting'
import { buildLinkSystem, fromCorridors, type DrawableBundle, type SystemBudget } from './linkSystem'
import { braidedOffsets, parallelTransportFrames, type Vec3 } from './linkVascular'
import { strataFor, type Stratum } from './linkStrata'
import { SECTION_SEGMENTS, type GeometryStats, trianglesFromIndex } from './linkGeometryCost'

import { LINK_RENDER_ORDER } from './nodePoints'
import { isMobileLikeDevice } from './useRenderLoop'
import { buildRanges, bundleAtTriangle } from './linkVascularPicking'
import { distributePorts, placePort, type GroupEnvelope, type GroupPair } from './linkPorts'
import { radiusAt } from './linkRadius'

/** Radial segments. Eight reads round at these widths and stays cheap. */
const TUBE_SEGMENTS = SECTION_SEGMENTS
/** Share of the link length used as the spline's bow. */
const BOW = 0.16
/** Hard ceiling on lanes drawn for one trunk. */
const MAX_STRANDS = 5
/**
 * Fibres internes d'un conduit.
 *
 * Les planches ne montrent pas un tube : elles montrent un FAISCEAU — une gaine
 * translucide dans laquelle on voit courir des dizaines de fibres parallèles.
 * C'est cette structure interne qui fait lire « vaisseau » et non « fil ». Elles
 * tournent en hélice lente autour de l'axe, donc la lumière accroche par
 * intermittence, comme dans les références.
 */
const MICRO_FIBERS = 5
/**
 * Budget réduit sur mobile.
 *
 * Un téléphone chauffe sur le SURDESSIN, pas sur le nombre de triangles seul :
 * des dizaines de couches translucides qui se recouvrent coûtent une passe de
 * fragment par pixel et par couche. Mesuré côté client : le rendu faisait
 * chauffer l'appareil. Sur mobile, deux fibres au lieu de cinq et un anneau de
 * moins : la silhouette reste, le coût par pixel tombe.
 */
const MOBILE_LIKE = isMobileLikeDevice()
/**
 * Rayon d'un sous-canal, en fraction du rayon du conduit.
 *
 * PHASE 5 : les canaux doivent être des SOUS-CONDUITS distincts, répartis
 * autour de l'axe, pas des coques concentriques. À 0,07 ils étaient des fils
 * invisibles ; à 0,16 ils ont un volume propre et laissent voir les ESPACES
 * entre eux — que la spec dit aussi importants que les surfaces.
 */
const MICRO_FIBER_RADIUS = 0.16
/** Rayon de l'orbite des sous-canaux, et son aplatissement (ellipse, pas cercle). */
const CHANNEL_ORBIT = 0.52
const CHANNEL_ELLIPSE = 0.78
/**
 * Étendue réelle du contenu d'un conduit : l'orbite des canaux plus leur rayon.
 * Au-delà, il n'y a RIEN à envelopper.
 */
export const CHANNEL_EXTENT = CHANNEL_ORBIT + MICRO_FIBER_RADIUS
/**
 * Épaisseur d'une peau de membrane, en fraction du rayon du conduit.
 *
 * La gaine était posée à 1,0 et le halo à 1,45 autour d'un contenu qui s'arrête
 * à 0,68 : la membrane faisait plus de deux fois ce qu'elle contient, et se
 * lisait comme un manchon épais et plat (retour client du 03/11). Une membrane
 * est une COUCHE FINE collée à ce qu'elle représente : chaque peau ajoute 0,04.
 */
export const MEMBRANE_SKIN = 0.04

/**
 * Les cinq identités géométriques d'un conduit (phase 5).
 *
 * Chacune a un rayon, une opacité et un rôle distincts :
 *   0 halo        — l'atmosphère, très large et presque transparente
 *   1 gaine       — l'enveloppe translucide
 *   2 structure   — la couche qui accroche la lumière (reflets, relief)
 *   3..N canaux   — les sous-conduits, répartis AUTOUR de l'axe
 *   N+1 cœur      — le canal de flux, axial et émissif
 */
export interface LayerSpec {
  kind: 'halo' | 'sheath' | 'structure' | 'channel' | 'core'
  radius: number
  alpha: number
  emit: boolean
  /** Indice du canal (pour son angle d'orbite). */
  channel?: number
}

/**
 * Déport du CENTRE d'un anneau dans le repère (normale, binormale), en unités
 * monde. Toutes les couches partagent l'axe de tresse (`braid * thickness`) ;
 * seuls les canaux s'en écartent, sur leur orbite. Utilisé tel quel par la
 * boucle de maillage : le tester, c'est tester ce qui est dessiné.
 */
export function ringCenterOffset(
  spec: LayerSpec,
  braid: readonly [number, number],
  thickness: number,
  channelCount: number,
  u: number,
): [number, number] {
  let ox = braid[0] * thickness
  let oy = braid[1] * thickness
  if (spec.kind === 'channel') {
    const angle = ((spec.channel ?? 0) / Math.max(1, channelCount)) * Math.PI * 2 + u * 1.8
    ox += Math.cos(angle) * thickness * CHANNEL_ORBIT
    oy += Math.sin(angle) * thickness * CHANNEL_ORBIT * CHANNEL_ELLIPSE
  }
  return [ox, oy]
}

export function layerSpecs(channelCount: number): LayerSpec[] {
  const out: LayerSpec[] = [
    // Couches plus DISCRÈTES : l'empilement de gaines opaques faisait une purée
    // où l'on ne distinguait plus rien. Chaque couche porte maintenant un rôle
    // lisible et une opacité basse ; le contraste vient du cœur, pas du nombre.
    // Les trois peaux sont COLLÉES au contenu (CHANNEL_EXTENT) : la structure
    // l'affleure, la gaine et le halo n'ajoutent chacun qu'une peau fine.
    { kind: 'halo', radius: CHANNEL_EXTENT + 2 * MEMBRANE_SKIN, alpha: 0.03, emit: false },
    { kind: 'sheath', radius: CHANNEL_EXTENT + MEMBRANE_SKIN, alpha: 0.08, emit: false },
    { kind: 'structure', radius: CHANNEL_EXTENT, alpha: 0.16, emit: false },
  ]
  for (let i = 0; i < channelCount; i++) {
    out.push({ kind: 'channel', radius: MICRO_FIBER_RADIUS, alpha: 0.3, emit: false, channel: i })
  }
  out.push({ kind: 'core', radius: 0.16, alpha: 0.7, emit: true })
  return out
}

/**
 * ARBRE VASCULAIRE (phase 2).
 *
 * Le tronc ne se divisait qu'une fois, vers trois nœuds choisis par degré. Un
 * vrai réseau est dendritique : artère → branches secondaires → capillaires,
 * et les branches se regroupent par PROXIMITÉ SPATIALE des extrémités réelles,
 * pas par identifiant de communauté.
 */
const SUB_HUBS_PER_END = 3
const CAPILLARIES_PER_SUB_HUB = 3
/** Samples along a branch (shorter than a trunk, so fewer). */
const BRANCH_SAMPLES = 5
/**
 * Couleur par famille de relation.
 *
 * Les planches montrent des familles DISTINGUABLES dans un même faisceau
 * (directionnel / dépendance / connaissance / agrégat). Une voie par famille,
 * c'est une VRAIE partition des relations du corridor — pas une métaphore : le
 * brief interdit d'inventer un embranchement qui suggère une relation
 * inexistante, et une famille est, elle, un fait des données.
 */
const FAMILY_RGB: Record<string, [number, number, number]> = {
  // Teintes FRANCHES : en additif, une teinte pastel se lave dès que deux
  // conduits se superposent. Les planches montrent des faisceaux nettement
  // colorés, pas des pastels.
  IMPORTS: [0.0, 1.0, 0.62],
  CALLS: [0.15, 0.55, 1.0],
  IMPLEMENTS: [0.55, 0.3, 1.0],
  EXTENDS: [0.8, 0.2, 1.0],
  TOUCHES: [1.0, 0.75, 0.1],
  CO_CHANGED: [1.0, 0.42, 0.05],
  CO_CHANGED_TRANSITIVE: [1.0, 0.28, 0.12],
  DISCUSSED: [1.0, 0.35, 0.75],
  AFFECTS: [1.0, 0.2, 0.45],
  UNKNOWN: [0.45, 0.6, 0.7],
}

function familyRgb(relation: string | null | undefined): [number, number, number] {
  return FAMILY_RGB[relation ?? 'UNKNOWN'] ?? FAMILY_RGB.UNKNOWN
}

/**
 * Part du style (surbrillance, sélection, couleur de couche) qui TEINTE une
 * voie de famille. La famille reste lisible ; le style la module.
 */
const FAMILY_TINT = 0.3

/** Sheath alpha, and how much brighter the core is. */
const SHEATH_ALPHA = 1.0
/**
 * Budget de lumière d'un conduit, réparti entre ses couches.
 *
 * Chaque couche ajoutait son opacité à la précédente (halo + gaine + strates +
 * cœur) : la somme dépassait 1 et le tronc virait au blanc plein — le rendu
 * additif sature. Un conduit a désormais un budget FIXE, partagé
 * proportionnellement entre ses couches : plus il a de strates, plus chacune est
 * discrète, et l'ensemble reste dans la plage lisible.
 */

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute vec3 aNormal;
  attribute float aEmit;
  attribute float aU;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec3 vNormal;
  varying float vEmit;
  varying vec3 vView;
  varying float vU;
  varying float vPhase;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // Normale de SURFACE : sans elle, un tube n'est qu'une tache de couleur et
    // seul l'additif peut le faire exister — d'ou l'eblouissement.
    vNormal = normalize(mat3(modelMatrix) * aNormal);
    vView = normalize(cameraPosition - wp.xyz);
    vColor = aColor;
    vAlpha = aAlpha;
    vEmit = aEmit;
    vU = aU;
    vPhase = aPhase;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uLightDir;
  uniform float uFlowTime;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec3 vNormal;
  varying float vEmit;
  varying vec3 vView;
  varying float vU;
  varying float vPhase;
  void main() {
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    float diff = max(dot(N, normalize(uLightDir)), 0.0);
    float rim = pow(1.0 - max(dot(N, normalize(vView)), 0.0), 2.0);
    // La surface existe PAR ELLE-MEME : diffusion + bord. Elle reste lisible
    // meme emission coupee (critere de la phase 4).
    vec3 surface = vColor * (0.32 + 0.68 * diff) + vColor * rim * 0.55;
    // L'emission est un SUPPLEMENT, borne par une courbe compressive : deux
    // dizaines de couches ne peuvent plus saturer le meme pixel.
    // LE FLUX VIT ICI. Impulsions fines, décalées par conduit, qui avancent avec
    // uFlowTime : la géométrie et les couleurs ne bougent jamais pendant
    // l'animation — c'est la phase 7 du plan.
    float pulse = 1.0;
    if (vEmit > 0.5) {
      float wave = fract(vU * 6.0 - uFlowTime + vPhase);
      pulse = 0.55 + 0.75 * smoothstep(0.0, 0.35, wave) * smoothstep(1.0, 0.65, wave);
    }
    float e = (1.0 - exp(-2.0 * vEmit * vAlpha)) * pulse;
    vec3 col = surface * (1.0 - vEmit) + vColor * e;
    float a = clamp(vAlpha * (1.0 - vEmit) * 1.0 + e, 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`

const endpointId = (e: string | { id: string }): string => (typeof e === 'string' ? e : e.id)

/**
 * Avancement du flux, en tours de motif.
 *
 * Module-level et non par rendu : c'est un CADENCE, pas une donnée du graphe.
 * `setFlowTime` le fait avancer quand l'appelant décide d'animer ; à l'arrêt la
 * valeur reste, et l'image reste stable et reproductible.
 */
let flowTime = 0

/** Deterministic 0..2π seed from a corridor key, so a trunk's bow never flickers. */
function hashKey(key: string): number {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) / 4294967296) * Math.PI * 2
}

/** Niveau d'un conduit dans l'arbre vasculaire. */
export type ConduitKind = 'trunk' | 'artery' | 'capillary'

/** One drawn conduit: a trunk lane or a branch, as a sheath + a core. */
interface Conduit {
  kind: ConduitKind
  fromId: string
  toId: string
  /** Radius multiplier applied to the bundle's base radius. */
  radius: number
  /** Alpha multiplier applied to the style's alpha. */
  alpha: number
  /** Braid lane (only for trunk lanes). */
  lane: number
  samples: number
  /** Concentric layers of this conduit, outermost first. Empty = single tube. */
  strata: Stratum[]
  /** Relation family this lane carries (null for branches: they inherit). */
  family: string | null
  /** Flowing grain offset, so two conduits never pulse in step. */
  flowPhase: number
  /** Combien de faisceaux se rejoignent sur ses moyeux — divise sa lumière. */
  load: number
  /** Multiplicateurs de rayon au départ et à l'arrivée : le conduit s'affine. */
  startRadius: number
  endRadius: number
  /** First vertex of this conduit in the shared buffers. */
  vertexStart: number
  vertexCount: number
  /** Couches (anneaux concentriques) de ce conduit. */
  layers: number
}

/** Ce que `inspect()` expose d'un conduit : de quoi mesurer la géométrie. */
export interface ConduitInfo {
  key: string
  kind: ConduitKind
  fromId: string
  toId: string
  /** Position COURANTE des deux ancres. */
  from: Vec3
  to: Vec3
  vertexStart: number
  samples: number
  layers: number
  lane: number
  family: string | null
}

/** Un point qui a une position : un nœud réel, ou une ancre calculée. */
interface Point3 {
  x: number
  y: number
  z: number
}

interface Bundle {
  corridor: Corridor
  drawable: DrawableBundle
  color: LinkStyle
  /** Dernier style appliqué : le tick suivant du layout repeint avec lui. */
  lastStyle: LinkStyle
  /** Couches de chaque conduit du faisceau (même nombre de canaux partout). */
  specs: LayerSpec[]
  bowSeed: number
  conduits: Conduit[]
  vertexStart: number
  vertexCount: number
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function norm3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

/** A bowed pair of control points between two anchors: the trunk never runs straight. */
function bowAnchors(a: Vec3, b: Vec3, seed: number): [Vec3, Vec3] {
  const d = sub3(b, a)
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const mid = lerp3(a, b, 0.5)
  // Le ventre est poussé VERS L'EXTÉRIEUR du graphe : les vaisseaux contournent
  // le centre au lieu de s'y croiser. Vingt et un corridors entre six grappes
  // faisaient un nœud illisible au milieu ; les planches montrent des arcs qui
  // enveloppent.
  const radialLen = Math.hypot(mid[0], mid[1], mid[2])
  const radial: Vec3 = radialLen > 1e-6 ? [mid[0] / radialLen, mid[1] / radialLen, mid[2] / radialLen] : [0, 1, 0]
  const axis = norm3([d[1] * 0.7 + Math.cos(seed) * 0.3, d[2] * 0.7 + Math.sin(seed) * 0.3, d[0] * 0.7])
  const tangential = norm3(cross3(norm3(d), axis))
  // Un peu de tangentiel pour l'irrégularité, beaucoup de radial pour envelopper.
  const perp = norm3([
    radial[0] * 0.85 + tangential[0] * 0.35,
    radial[1] * 0.85 + tangential[1] * 0.35,
    radial[2] * 0.85 + tangential[2] * 0.35,
  ])
  const bow = len * BOW
  const c1 = lerp3(a, b, 1 / 3)
  const c2 = lerp3(a, b, 2 / 3)
  // Les deux contrôles partent de part et d'autre : une S, pas un arc. Un arc
  // unique donnait des cordes tendues d'un point à l'autre — « de simples fils »
  // entre les nœuds, exactement ce que le client refuse.
  return [
    [c1[0] + perp[0] * bow, c1[1] + perp[1] * bow, c1[2] + perp[2] * bow],
    [c2[0] - perp[0] * bow, c2[1] - perp[1] * bow, c2[2] - perp[2] * bow],
  ]
}

/** Cubic Bézier sampling between two anchors through two controls. */
function sampleCurve(a: Vec3, c1: Vec3, c2: Vec3, b: Vec3, samples: number): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < samples; i++) {
    const u = samples === 1 ? 0 : i / (samples - 1)
    const v = 1 - u
    out.push([
      v * v * v * a[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u * u * u * b[0],
      v * v * v * a[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u * u * u * b[1],
      v * v * v * a[2] + 3 * v * v * u * c1[2] + 3 * v * u * u * c2[2] + u * u * u * b[2],
    ])
  }
  return out
}

/**
 * Le flux animé est-il autorisé sur cet appareil ?
 *
 * PHASE 7 : « ne pas activer automatiquement l'animation continue sur mobile
 * tant que les mesures thermiques ne sont pas satisfaisantes ». Désactivé par
 * défaut sur mobile, activable par l'appelant après mesure.
 */
export const ORGANIC_FLOW_ENABLED = !MOBILE_LIKE

export interface VascularLinkRenderer extends LinkRenderer {
  /** Mesures RÉELLES de ce qui a été produit (phase 8). */
  stats?: GeometryStats
  /** Fait avancer le flux d'un tour de motif. Sans appel, l'image est stable. */
  setFlowTime?: (turns: number) => void
  /** Key of the bundle that owns this triangle (`faceIndex` from a raycast), or null. */
  bundleAt?: (faceIndex: number) => string | null
  /** Click callback, to be invoked by the DOM wiring. */
  onBundleClick?: (key: string) => void
  /** Conduits dessinés et position courante de leurs ancres (tests, diagnostics). */
  inspect?: () => ConduitInfo[]
}

/**
 * Build the vascular link layer, or null when the data cannot carry it.
 */
export function createVascularLinks(
  nodes: Graph3DNode[],
  links: Graph3DLink[],
  budget: Partial<SystemBudget> = {},
  onBundleClick?: (key: string) => void,
): VascularLinkRenderer | null {
  try {
    if (!Array.isArray(nodes) || !Array.isArray(links) || links.length === 0) return null
    for (const n of nodes) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || !Number.isFinite(n.z)) return null
    }

    const nodeById = new Map<string, Point3>()
    for (const n of nodes) nodeById.set(n.id, n)

    const corridors = buildCorridors(links)
    if (corridors.length === 0) return null

    const system = buildLinkSystem(fromCorridors(corridors), budget)
    if (system.bundles.length === 0) return null

    const corridorByKey = new Map(corridors.map((c) => [c.key, c]))

    // ── MOYEUX : un point d'union par ensemble ──────────────────────────────
    // Un tronc partait d'un NŒUD arbitraire de l'ensemble : rien ne pouvait donc
    // s'unir, et vingt et un corridors dessinaient vingt et un faisceaux
    // indépendants qui se croisaient. Chaque ensemble reçoit un moyeu — le
    // centre de ses nœuds — et TOUS les troncs qui le touchent y convergent :
    // ils fusionnent là, puis se divisent vers leur destination. C'est la
    // demande : « des formes évoluées pour connecter les ensembles quand ils
    // s'unissent, et les redviser automatiquement ».
    //
    // ── ANCRES VIVANTES ─────────────────────────────────────────────────
    // Moyeux, ports et sous-moyeux ne sont PAS des nœuds : ce sont des points
    // calculés depuis les nœuds réels. Ils étaient copiés une fois, à la
    // construction, puis figés : le layout déplaçait les nœuds, troncs et
    // artères restaient sur place (mesuré : 47 078 sommets immobiles après un
    // déplacement de +1000). Chaque ancre garde maintenant ses SOURCES — des
    // références vers les nœuds réels — et se recalcule, sans allocation, à
    // chaque `updatePositions`. Seule la TOPOLOGIE (qui appartient à quel port,
    // à quel sous-moyeu) est figée à la construction.
    interface Hub {
      token: string
      /** Extrémités réelles, avec leur multiplicité (une par lien). */
      members: Point3[]
      center: Vec3
      radius: number
    }
    const hubs = new Map<string, Hub>()
    const hubOf = (token: string): Hub => {
      let h = hubs.get(token)
      if (!h) {
        h = { token, members: [], center: [0, 0, 0], radius: 0 }
        hubs.set(token, h)
      }
      return h
    }
    for (const link of links) {
      const sNode = nodeById.get(endpointId(link.source))
      const tNode = nodeById.get(endpointId(link.target))
      if (sNode) hubOf(endpointToken(link.sourceCommunityId, endpointId(link.source))).members.push(sNode)
      if (tNode) hubOf(endpointToken(link.targetCommunityId, endpointId(link.target))).members.push(tNode)
    }

    // Bounding radius of the graph: every thickness is a share of what is on screen.
    let sceneRadius = 1
    const recomputeHubs = () => {
      sceneRadius = 1
      for (const n of nodes) {
        const d = Math.hypot(n.x, n.y, n.z)
        if (Number.isFinite(d) && d > sceneRadius) sceneRadius = d
      }
      for (const h of hubs.values()) {
        const count = h.members.length
        if (count === 0) continue
        let x = 0, y = 0, z = 0
        for (const m of h.members) { x += m.x; y += m.y; z += m.z }
        h.center[0] = x / count
        h.center[1] = y / count
        h.center[2] = z / count
        // Rayon de l'ensemble : écart moyen de ses extrémités à son centre.
        let sum = 0
        for (const m of h.members) sum += Math.hypot(m.x - h.center[0], m.y - h.center[1], m.z - h.center[2])
        h.radius = Math.max(8, sum / count)
      }
    }
    recomputeHubs()
    const envelopeRadius = {
      get: (token: string): number | undefined => hubs.get(token)?.radius,
    }

    const envelopes: GroupEnvelope[] = []
    for (const h of hubs.values()) {
      if (h.members.length === 0) continue
      envelopes.push({ id: h.token, center: [h.center[0], h.center[1], h.center[2]], radius: h.radius })
    }
    const groupPairs: GroupPair[] = corridors
      .filter((c) => c.from !== c.to)
      .map((c) => ({ key: c.key, from: c.from, to: c.to }))
    const { ports, pairPorts } = distributePorts(envelopes, groupPairs)

    // Les ports sont des points de ROUTAGE : ils n'ont ni compte ni relation.
    // On les enregistre comme ancres pour que les conduits puissent s'y
    // accrocher, avec les groupes vers lesquels ils regardent : c'est ce qui
    // permet de les reposer quand les groupes bougent.
    interface PortRec {
      anchor: Point3
      hub: Hub
      others: Hub[]
      sum: Vec3
      position: Vec3
      direction: Vec3
    }
    const portRecs: PortRec[] = []
    const portById = new Map<string, PortRec>()
    for (const port of ports) {
      const hub = hubs.get(port.group)
      if (!hub) continue
      const rec: PortRec = {
        anchor: { x: port.position[0], y: port.position[1], z: port.position[2] },
        hub,
        others: [],
        sum: [0, 0, 0],
        position: [...port.position],
        direction: [...port.direction],
      }
      portRecs.push(rec)
      portById.set(port.id, rec)
      nodeById.set(port.id, rec.anchor)
    }
    for (const [key, pp] of pairPorts) {
      const c = corridorByKey.get(key)
      if (!c) continue
      const toHub = hubs.get(c.to)
      const fromHub = hubs.get(c.from)
      if (toHub) portById.get(pp.from)?.others.push(toHub)
      if (fromHub) portById.get(pp.to)?.others.push(fromHub)
    }
    /** Même règle que `distributePorts` : somme des directions sortantes, posée sur l'enveloppe. */
    const recomputePorts = () => {
      for (const rec of portRecs) {
        const c = rec.hub.center
        rec.sum[0] = 0; rec.sum[1] = 0; rec.sum[2] = 0
        for (const o of rec.others) {
          const dx = o.center[0] - c[0], dy = o.center[1] - c[1], dz = o.center[2] - c[2]
          const len = Math.hypot(dx, dy, dz)
          if (len < 1e-9) { rec.sum[1] += 1; continue }
          rec.sum[0] += dx / len; rec.sum[1] += dy / len; rec.sum[2] += dz / len
        }
        placePort(c, rec.hub.radius, rec.sum, rec)
        rec.anchor.x = rec.position[0]
        rec.anchor.y = rec.position[1]
        rec.anchor.z = rec.position[2]
      }
    }

    /** Sous-moyeux : centre de leurs extrémités réelles, recalculé à chaque tick. */
    interface SubRec {
      anchor: Point3
      members: Point3[]
    }
    const subRecs: SubRec[] = []
    const recomputeSubs = () => {
      for (const s of subRecs) {
        let x = 0, y = 0, z = 0
        for (const m of s.members) { x += m.x; y += m.y; z += m.z }
        const n = s.members.length
        s.anchor.x = x / n
        s.anchor.y = y / n
        s.anchor.z = z / n
      }
    }
    const recomputeAnchors = () => {
      recomputeHubs()
      recomputePorts()
      recomputeSubs()
    }

    /** Centroids of a corridor's two sides, plus the branch targets on each side. */
    const geometryOf = (corridor: Corridor) => {
      let ax = 0, ay = 0, az = 0, an = 0
      let bx = 0, by = 0, bz = 0, bn = 0
      const sideA: { id: string; deg: number }[] = []
      const sideB: { id: string; deg: number }[] = []
      const degree = new Map<string, number>()
      for (const link of corridor.links) {
        const s = endpointId(link.source)
        const t = endpointId(link.target)
        degree.set(s, (degree.get(s) ?? 0) + 1)
        degree.set(t, (degree.get(t) ?? 0) + 1)
      }
      for (const link of corridor.links) {
        const s = endpointId(link.source)
        const t = endpointId(link.target)
        const sn = nodeById.get(s)
        const tn = nodeById.get(t)
        if (!sn || !tn) continue
        if (endpointToken(link.sourceCommunityId, endpointId(link.source)) === corridor.from) {
          ax += sn.x; ay += sn.y; az += sn.z; an++
          bx += tn.x; by += tn.y; bz += tn.z; bn++
          sideA.push({ id: s, deg: degree.get(s) ?? 0 })
          sideB.push({ id: t, deg: degree.get(t) ?? 0 })
        } else {
          ax += tn.x; ay += tn.y; az += tn.z; an++
          bx += sn.x; by += sn.y; bz += sn.z; bn++
          sideA.push({ id: t, deg: degree.get(t) ?? 0 })
          sideB.push({ id: s, deg: degree.get(s) ?? 0 })
        }
      }
      if (an === 0 || bn === 0) return null
      /**
       * Regroupe les extrémités RÉELLES d'un côté en sous-moyeux spatiaux.
       *
       * Tri par angle autour du centre du côté, puis découpe en autant de
       * paquets que de sous-moyeux autorisés : deux nœuds voisins tombent dans
       * le même paquet, deux nœuds opposés non. C'est le clustering que la
       * phase 2 demande, réduit à ce qui se calcule en O(n log n).
       */
      const pick = (list: { id: string; deg: number }[]) => {
        const seen = new Set<string>()
        const unique = [...list]
          .sort((p, q) => q.deg - p.deg || (p.id < q.id ? -1 : 1))
          .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
        if (unique.length === 0) return [] as string[][]
        // Centre du côté, puis angle de chaque extrémité autour de ce centre.
        let cx = 0, cy = 0, _cz = 0
        const pts = unique.map((x) => {
          const n = nodeById.get(x.id)!
          cx += n.x; cy += n.y; _cz += n.z
          return { id: x.id, deg: x.deg, n }
        })
        cx /= pts.length; cy /= pts.length
        const angle = (p: { n: { x: number; y: number; z: number } }) =>
          Math.atan2(p.n.y - cy, p.n.x - cx)
        const byAngle = [...pts].sort((a, b) => angle(a) - angle(b) || (a.id < b.id ? -1 : 1))
        const groups: string[][] = []
        const per = Math.max(1, Math.ceil(byAngle.length / SUB_HUBS_PER_END))
        for (let i = 0; i < byAngle.length; i += per) {
          groups.push(
            byAngle
              .slice(i, i + per)
              .sort((a, b) => b.deg - a.deg || (a.id < b.id ? -1 : 1))
              .slice(0, CAPILLARIES_PER_SUB_HUB)
              .map((x) => x.id),
          )
        }
        return groups.filter((g) => g.length > 0)
      }
      return {
        a: [ax / an, ay / an, az / an] as Vec3,
        b: [bx / bn, by / bn, bz / bn] as Vec3,
        branchA: pick(sideA),
        branchB: pick(sideB),
      }
    }

    // ── Charge des moyeux ────────────────────────────────────────────────
    // Combien de faisceaux se rejoignent sur chaque moyeu ? Au centre, vingt et
    // un troncs se superposent : leur lumière S'ADDITIONNE. C'était le blanc
    // éblouissant des captures. Chaque conduit divise donc son budget par la
    // charge de ses deux moyeux — une correction qui vient des données, pas d'un
    // réglage à l'œil.
    const hubLoad = new Map<string, number>()
    // Masse exacte portée par chaque ensemble : c'est elle qui décide de la
    // section du parent dans la loi de confluence.
    const hubMass = new Map<string, number>()
    for (const c of corridors) {
      const n = Number(c.magnitude.exactCount)
      hubLoad.set(c.from, (hubLoad.get(c.from) ?? 0) + 1)
      hubLoad.set(c.to, (hubLoad.get(c.to) ?? 0) + 1)
      hubMass.set(c.from, (hubMass.get(c.from) ?? 0) + n)
      hubMass.set(c.to, (hubMass.get(c.to) ?? 0) + n)
    }

    // ── Buffers ──────────────────────────────────────────────────────────
    const bundles: Bundle[] = []
    const position: number[] = []
    const color: number[] = []
    const alpha: number[] = []
    const normal: number[] = []
    const emit: number[] = []
    const curv: number[] = []
    const phase: number[] = []
    const index: number[] = []
    const trianglesPerBundle: number[] = []

    for (const drawable of system.bundles) {
      const corridor = corridorByKey.get(drawable.corridor.key)
      if (!corridor) continue
      const geo = geometryOf(corridor)
      if (!geo) continue

      // Le nombre de VOIES vient de la structure, pas du LOD.
      //
      // Il valait `drawable.strands`, c'est-à-dire 1 dès que le LOD est au
      // niveau agrégé — donc un corridor de 150 relations portant TROIS familles
      // et cinq canaux était dessiné comme un seul fil. Mesuré sur l'aperçu hors
      // navigateur : vingt et un corridors, cinq courbes visibles.
      const load = Math.max(1, Math.max(hubLoad.get(corridor.from) ?? 1, hubLoad.get(corridor.to) ?? 1))
      const lanes = Math.min(
        MAX_STRANDS,
        Math.max(1, Math.min(
          Math.max(1, corridor.families.length),
          Math.max(1, drawable.morphology.graphical.channels),
        )),
      )
      const trunkSamples = drawable.samples
      const order = corridor.magnitude.magnitudeOrder
      // ÉPAISSEUR = f(nombre) × f(CE QUI EST CONNECTÉ).
      //
      // Le rayon ne dépendait que du nombre de relations. Deux ensembles
      // minuscules reliés par 10 000 relations dessinaient donc le même tronc
      // que deux ensembles immenses reliés par le même nombre. La taille des
      // ensembles connectés entre maintenant dans le calcul : un vaisseau qui
      // relie de grands territoires est plus gros, à quantité égale.
      const extFrom = envelopeRadius.get(corridor.from) ?? 0
      const extTo = envelopeRadius.get(corridor.to) ?? 0
      const territory = Math.min(1.8, 0.55 + (extFrom + extTo) / Math.max(1, sceneRadius))
      const baseRadius = sceneRadius * 0.005 * (1 + 0.30 * Math.min(9, order)) * territory

      const conduits: Conduit[] = []
      const vertexStart = position.length / 3
      let trianglesBefore = index.length / 3

      const addConduit = (
        kind: ConduitKind,
        fromId: string,
        toId: string,
        radius: number,
        alphaMul: number,
        lane: number,
        samples: number,
        strata: Stratum[],
        family: string | null,
        flowPhase: number,
        load: number,
        startRadius: number,
        endRadius: number,
      ) => {
        // One vertex ring per stratum: the tube is CONCENTRIC layers, not one
        // shell. That is what distinguishes a 1 000-relation conduit from a
        // 10 000-relation trunk once the projected width has hit its ceiling.
        // Les couches ont maintenant des IDENTITÉS fixes (phase 5), pas un
        // empilement de coques : halo, gaine, structure, canaux, cœur.
        // La gamme vient de la MORPHOLOGIE, pas d'une constante : 10⁴ et 10⁹
        // doivent porter des faisceaux différents. Bornée pour le surdessin.
        const channelCount = MOBILE_LIKE
          ? 2
          : Math.max(2, Math.min(MICRO_FIBERS, drawable.morphology.graphical.channels))
        const layers = layerSpecs(channelCount).length
        const count = samples * TUBE_SEGMENTS * layers
        conduits.push({
          kind,
          layers,
          fromId,
          toId,
          radius,
          alpha: alphaMul,
          lane,
          samples,
          strata,
          family,
          flowPhase,
          load,
          startRadius,
          endRadius,
          vertexStart: position.length / 3,
          vertexCount: count,
        })
        for (let i = 0; i < count; i++) {
          position.push(0, 0, 0)
          color.push(0.4, 0.8, 0.7)
          alpha.push(0)
          normal.push(0, 1, 0)
          emit.push(0)
          curv.push(0)
          phase.push(0)
        }
        const base = position.length / 3 - count
        for (let layer = 0; layer < layers; layer++) {
          const layerBase = base + layer * samples * TUBE_SEGMENTS
          for (let i = 0; i < samples - 1; i++) {
            for (let k = 0; k < TUBE_SEGMENTS; k++) {
              const a0 = layerBase + i * TUBE_SEGMENTS + k
              const a1 = layerBase + i * TUBE_SEGMENTS + ((k + 1) % TUBE_SEGMENTS)
              const b0 = a0 + TUBE_SEGMENTS
              const b1 = a1 + TUBE_SEGMENTS
              index.push(a0, b0, a1, a1, b0, b1)
            }
          }
        }
      }

      // ── Voies = FAMILLES de relations (une vraie partition) ──────────────
      // Le brief : « un même corridor peut transporter plusieurs familles de
      // relations, qui restent distinguables et comptabilisées séparément ».
      // Une voie par famille, colorée par elle : ce n'est pas une métaphore,
      // c'est la composition réelle du corridor.
      const families = [...corridor.families]
        .sort((x, y) => (y.exactCount === x.exactCount ? (x.relation < y.relation ? -1 : 1) : y.exactCount > x.exactCount ? 1 : -1))
        .slice(0, lanes)
      const laneFamilies = families.length > 0 ? families.map((f) => f.relation) : [null]
      // Nombre de strates AUTORISÉ par la morphologie : elle seule décide, et
      // `strataFor` n'en dessine jamais davantage.
      const strata = strataFor(Math.max(0, Math.min(6, drawable.morphology.graphical.strata)), order)
      // Le tronc va d'un PORT à un PORT : deux corridors qui partent dans des
      // directions différentes quittent l'ensemble par des points différents.
      const assigned = pairPorts.get(corridor.key)
      // Part de ce corridor dans la masse de chacun de ses deux moyeux, en
      // racine cubique : c'est la loi de confluence appliquée au port.
      const pairCount = Number(corridor.magnitude.exactCount)
      const massFrom = Math.max(pairCount, hubMass.get(corridor.from) ?? pairCount)
      const massTo = Math.max(pairCount, hubMass.get(corridor.to) ?? pairCount)
      const shareFrom = Math.cbrt(pairCount / massFrom)
      const shareTo = Math.cbrt(pairCount / massTo)
      // Gonflement de confluence : un ensemble où se rejoignent dix corridors
      // porte plus qu'un ensemble où il n'en arrive qu'un.
      const hubSwellFrom = Math.cbrt(Math.max(1, hubLoad.get(corridor.from) ?? 1)) / 2
      const hubSwellTo = Math.cbrt(Math.max(1, hubLoad.get(corridor.to) ?? 1)) / 2
      const trunkFrom = assigned?.from ?? (geo.branchA[0]?.[0] ?? endpointId(corridor.links[0].source))
      const trunkTo = assigned?.to ?? (geo.branchB[0]?.[0] ?? endpointId(corridor.links[0].target))

      laneFamilies.forEach((family, s) => {
        const lane = laneFamilies.length === 1 ? 0.5 : s / (laneFamilies.length - 1)
        addConduit('trunk', trunkFrom, trunkTo, 1, SHEATH_ALPHA, lane, trunkSamples, strata, family, s * 0.37, load, 0.85 + 0.5 * shareFrom + hubSwellFrom, 0.85 + 0.5 * shareTo + hubSwellTo)
      })

      const branchStrata = strata.slice(-1)

      /**
       * ARBRE A TROIS NIVEAUX (phase 2).
       *
       *   moyeu -> sous-moyeux (centre d'un groupe d'extremites voisines)
       *         -> capillaire (un noeud reel du groupe)
       *
       * Les sous-moyeux sont des points de ROUTAGE : aucun compte, aucune
       * relation. Ils existent parce que plusieurs extremites reelles passent par
       * le meme coude - c'est ce que dessine un arbre vasculaire, et ce qui
       * manquait : un tronc unique qui s'arretait net.
       */
      const addTree = (hub: string, groups: string[][], tag: string, share: number) => {
        groups.forEach((members, gi) => {
          if (members.length === 0) return
          const pts: Point3[] = []
          for (const id of members) {
            const nd = nodeById.get(id)
            if (nd) pts.push(nd)
          }
          if (pts.length === 0) return
          const subId = `sub:${tag}:${gi}`
          const sub: SubRec = { anchor: { x: 0, y: 0, z: 0 }, members: pts }
          subRecs.push(sub)
          nodeById.set(subId, sub.anchor)
          recomputeSubs()
          // Artere secondaire : epaisse, elle se detache du tronc.
          addConduit('artery', hub, subId, 0.62, SHEATH_ALPHA, 0.5, BRANCH_SAMPLES + 2, branchStrata, null, 0.31, load, 0.9 + 0.4 * share, 0.5)
          // Capillaires : fins, ils rejoignent les noeuds REELS du groupe.
          for (const id of members) {
            addConduit('capillary', subId, id, 0.3, SHEATH_ALPHA, 0.5, BRANCH_SAMPLES, branchStrata, null, 0.13, load, 0.45, 0.12)
          }
        })
      }
      addTree(trunkFrom, geo.branchA, `${corridor.key}:a`, shareFrom)
      addTree(trunkTo, geo.branchB, `${corridor.key}:b`, shareTo)

      const vertexCount = position.length / 3 - vertexStart
      trianglesPerBundle.push(index.length / 3 - trianglesBefore)
      trianglesBefore = index.length / 3
      bundles.push({
        corridor,
        drawable,
        color: { r: 0.35, g: 0.85, b: 0.75, r2: 0.55, g2: 0.95, b2: 0.85, a: 0.3 },
        lastStyle: { r: 0.35, g: 0.85, b: 0.75, r2: 0.55, g2: 0.95, b2: 0.85, a: 0.3 },
        bowSeed: hashKey(corridor.key),
        specs: layerSpecs(MOBILE_LIKE ? 2 : Math.max(2, Math.min(MICRO_FIBERS, drawable.morphology.graphical.channels))),
        conduits,
        vertexStart,
        vertexCount,
      })
      void baseRadius
    }

    if (bundles.length === 0) return null

    const geometry = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(new Float32Array(position), 3)
    const colorAttr = new THREE.BufferAttribute(new Float32Array(color), 3)
    const alphaAttr = new THREE.BufferAttribute(new Float32Array(alpha), 1)
    const normalAttr = new THREE.BufferAttribute(new Float32Array(normal), 3)
    const emitAttr = new THREE.BufferAttribute(new Float32Array(emit), 1)
    const curvAttr = new THREE.BufferAttribute(new Float32Array(curv), 1)
    const phaseAttr = new THREE.BufferAttribute(new Float32Array(phase), 1)
    positionAttr.setUsage(THREE.DynamicDrawUsage)
    colorAttr.setUsage(THREE.DynamicDrawUsage)
    alphaAttr.setUsage(THREE.DynamicDrawUsage)
    normalAttr.setUsage(THREE.DynamicDrawUsage)
    emitAttr.setUsage(THREE.DynamicDrawUsage)
    curvAttr.setUsage(THREE.DynamicDrawUsage)
    phaseAttr.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aColor', colorAttr)
    geometry.setAttribute('aAlpha', alphaAttr)
    geometry.setAttribute('aNormal', normalAttr)
    geometry.setAttribute('aEmit', emitAttr)
    geometry.setAttribute('aU', curvAttr)
    geometry.setAttribute('aPhase', phaseAttr)
    geometry.setIndex(index)

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      // PLUS D'ADDITIF : c'est lui qui saturait le centre. La composition
      // alpha normale empêche l'empilement de gaines de virer au blanc, et
      // l'émission est bornée dans le fragment.
      blending: THREE.NormalBlending,
      uniforms: {
        uLightDir: { value: new THREE.Vector3(0.45, 0.8, 0.6).normalize() },
        uFlowTime: { value: 0 },
      },
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = LINK_RENDER_ORDER
    mesh.frustumCulled = false
    const group = new THREE.Group()
    group.add(mesh)

    const ranges = buildRanges(
      bundles.map((b) => b.corridor.key),
      trianglesPerBundle,
    )

    /**
     * Efface un conduit : toutes ses positions sur un même point (triangles de
     * surface nulle) et opacité zéro. Rien ne subsiste à l'écran.
     */
    const hideConduit = (conduit: Conduit) => {
      const pos = positionAttr.array as Float32Array
      const alp = alphaAttr.array as Float32Array
      const emi = emitAttr.array as Float32Array
      const end = conduit.vertexStart + conduit.vertexCount
      for (let v = conduit.vertexStart; v < end; v++) {
        pos[v * 3] = 0
        pos[v * 3 + 1] = 0
        pos[v * 3 + 2] = 0
        alp[v] = 0
        emi[v] = 0
      }
    }

    /** Write one conduit's tube into the shared buffers. */
    const fillConduit = (bundle: Bundle, conduit: Conduit, style: LinkStyle) => {
      const s = nodeById.get(conduit.fromId)
      const t = nodeById.get(conduit.toId)
      if (!s || !t) {
        // Un nœud a disparu : on EFFACE le conduit au lieu de le laisser.
        // L'ancien code faisait `return` en laissant les positions précédentes
        // dans le tampon — le tube restait donc affiché à son ancienne place,
        // un fantôme qui ne part plus.
        hideConduit(conduit)
        return
      }
      const a: Vec3 = [s.x, s.y, s.z]
      const b: Vec3 = [t.x, t.y, t.z]
      const [c1, c2] = bowAnchors(a, b, bundle.bowSeed + conduit.lane * 0.9)
      const points = sampleCurve(a, c1, c2, b, conduit.samples)
      const frames = parallelTransportFrames(points)
      const order = bundle.corridor.magnitude.magnitudeOrder
      const thickness = sceneRadius * 0.005 * (1 + 0.30 * Math.min(9, order)) * conduit.radius
      const offsets = braidedOffsets(
        Math.max(1, conduit.lane === 0.5 ? 1 : Math.round(bundle.conduits.length / 2)),
        conduit.samples,
        1.4,
        0.5,
      )[0] ?? []
      const pos = positionAttr.array as Float32Array
      const nrm = normalAttr.array as Float32Array
      const emi = emitAttr.array as Float32Array
      const crv = curvAttr.array as Float32Array
      const pha = phaseAttr.array as Float32Array
      const specs = bundle.specs
      const channelCount = specs.length - 4
      const layers = specs.length
      const samplesPerLayer = conduit.samples * TUBE_SEGMENTS
      const base = conduit.vertexStart
      for (let layer = 0; layer < layers; layer++) {
        const spec = specs[layer]
        const layerBase = base + layer * samplesPerLayer
        for (let i = 0; i < conduit.samples; i++) {
          const f = frames[Math.min(i, frames.length - 1)]
          if (!f) continue
          const u = conduit.samples === 1 ? 0 : i / (conduit.samples - 1)
          // Le rayon VARIE le long du conduit : gonflement a la confluence,
          // amincissement vers le capillaire, sans cassure (smoothstep).
          // Le profil porte sur le RATIO, pas sur le rayon absolu : radiusAt
          // borne ses résultats à l'échelle d'un rayon relatif (0,05 à 2), et
          // lui passer des unités monde (plusieurs unités) écrasait tout à 1 —
          // les conduits redevenaient des fils.
          const taper = radiusAt(u, conduit.startRadius, conduit.endRadius, 0.5, { min: 0.05, max: 2 })
          const thicknessAt = thickness * taper
          // Orbite des canaux : ELLIPSE (pas un cercle), avec une vrille lente.
          // Le déport de tresse est UN axe commun à toutes les couches. Il était
          // multiplié par le rayon de CHAQUE couche : le halo (1,45) partait
          // 1,45 fois plus loin que le cœur, la membrane n'était plus centrée
          // sur ce qu'elle enveloppe et débordait d'un côté en manchon plat.
          const layerRadius = thicknessAt * spec.radius
          const off = offsets[i] ?? [0, 0, 0]
          const [ox, oy] = ringCenterOffset(spec, [off[0], off[1]], thicknessAt, channelCount, u)
          const cx = f.position[0] + f.normal[0] * ox + f.binormal[0] * oy
          const cy = f.position[1] + f.normal[1] * ox + f.binormal[1] * oy
          const cz = f.position[2] + f.normal[2] * ox + f.binormal[2] * oy
          // La couleur ne porte PAS le flux : elle est stable, et c'est le
          // shader qui anime (`setFlowTime` ne réécrit aucun tampon).
          for (let k = 0; k < TUBE_SEGMENTS; k++) {
            const ang = (k / TUBE_SEGMENTS) * Math.PI * 2
            const nx = Math.cos(ang)
            const ny = Math.sin(ang)
            const vi = (layerBase + i * TUBE_SEGMENTS + k) * 3
            pos[vi] = cx + f.normal[0] * nx * layerRadius + f.binormal[0] * ny * layerRadius
            pos[vi + 1] = cy + f.normal[1] * nx * layerRadius + f.binormal[1] * ny * layerRadius
            pos[vi + 2] = cz + f.normal[2] * nx * layerRadius + f.binormal[2] * ny * layerRadius
            // Normale de surface : la direction radiale du repère de transport.
            // C'est elle qui donne du volume à la rotation, émission coupée.
            nrm[vi] = f.normal[0] * nx + f.binormal[0] * ny
            nrm[vi + 1] = f.normal[1] * nx + f.binormal[1] * ny
            nrm[vi + 2] = f.normal[2] * nx + f.binormal[2] * ny
            const vi1 = layerBase + i * TUBE_SEGMENTS + k
            // Seule la couche qui porte le flux émet ; tout le reste est surface.
            emi[vi1] = spec.emit ? 1 : 0
            // Position curviligne et phase : le shader en fait une impulsion.
            crv[vi1] = u
            pha[vi1] = conduit.flowPhase
          }
        }
      }
      paintConduit(bundle, conduit, style)
    }

    /**
     * Couleur et opacité de TOUTES les couches d'un conduit.
     *
     * Une seule fonction, partagée par le maillage et la recoloration. La
     * recoloration ne repeignait que la couche 0 (le halo) avec `style.a` brut :
     * le halo devenait dix fois trop opaque, portait seul la couleur de
     * surbrillance, et le tick suivant du layout remettait tout à l'ancienne
     * couleur — un clignotement.
     *
     * Chaque couche garde SON opacité (spec × style × conduit). La couleur
     * d'une voie reste celle de sa famille : la surbrillance la TEINTE, elle ne
     * la remplace pas.
     */
    const paintConduit = (bundle: Bundle, conduit: Conduit, style: LinkStyle) => {
      const col = colorAttr.array as Float32Array
      const alp = alphaAttr.array as Float32Array
      const fam = conduit.family ? familyRgb(conduit.family) : null
      const sr = style.r, sg = style.g, sb = style.b
      const sr2 = style.r2 ?? sr, sg2 = style.g2 ?? sg, sb2 = style.b2 ?? sb
      const specs = bundle.specs
      const baseAlpha = Math.max(0.6, Math.max(0.3, style.a))
      const samplesPerLayer = conduit.samples * TUBE_SEGMENTS
      for (let layer = 0; layer < specs.length; layer++) {
        // Opacité propre à l'identité de la couche, pas une part d'un budget
        // commun : chaque strate garde une identité CLAIRE.
        const layerAlpha = Math.min(1, specs[layer].alpha * baseAlpha * conduit.alpha)
        const layerBase = conduit.vertexStart + layer * samplesPerLayer
        for (let i = 0; i < conduit.samples; i++) {
          const u = conduit.samples === 1 ? 0 : i / (conduit.samples - 1)
          let r = sr + (sr2 - sr) * u
          let g = sg + (sg2 - sg) * u
          let b = sb + (sb2 - sb) * u
          if (fam) {
            r = fam[0] + (r - fam[0]) * FAMILY_TINT
            g = fam[1] + (g - fam[1]) * FAMILY_TINT
            b = fam[2] + (b - fam[2]) * FAMILY_TINT
          }
          for (let k = 0; k < TUBE_SEGMENTS; k++) {
            const v = layerBase + i * TUBE_SEGMENTS + k
            col[v * 3] = r
            col[v * 3 + 1] = g
            col[v * 3 + 2] = b
            alp[v] = layerAlpha
          }
        }
      }
    }

    const fillGeometry = () => {
      for (const bundle of bundles) {
        for (const conduit of bundle.conduits) fillConduit(bundle, conduit, bundle.lastStyle)
      }
      positionAttr.needsUpdate = true
      colorAttr.needsUpdate = true
      alphaAttr.needsUpdate = true
      normalAttr.needsUpdate = true
      emitAttr.needsUpdate = true
      geometry.computeBoundingSphere()
    }

    /**
     * Repeint les faisceaux choisis. Le style appliqué est MÉMORISÉ : le tick
     * suivant du layout (`fillGeometry`) repeint avec lui, pas avec la couleur
     * de construction.
     */
    const fillColors = (targets: Iterable<Bundle>, styleOf: (bundle: Bundle) => LinkStyle) => {
      for (const bundle of targets) {
        const style = styleOf(bundle)
        bundle.lastStyle = style
        for (const conduit of bundle.conduits) {
          if (!nodeById.has(conduit.fromId) || !nodeById.has(conduit.toId)) continue
          paintConduit(bundle, conduit, style)
        }
      }
      colorAttr.needsUpdate = true
      alphaAttr.needsUpdate = true
    }

    // Faisceaux touchés par chaque nœud réel : la surbrillance d'un nœud ne
    // repeint que ce qui le concerne, sans parcourir tous les liens.
    const bundlesByNode = new Map<string, Bundle[]>()
    for (const b of bundles) {
      for (const link of b.corridor.links) {
        for (const id of [endpointId(link.source), endpointId(link.target)]) {
          const list = bundlesByNode.get(id)
          if (!list) bundlesByNode.set(id, [b])
          else if (list[list.length - 1] !== b) list.push(b)
        }
      }
    }

    fillGeometry()

    return {
      object: group,
      updatePositions: () => {
        recomputeAnchors()
        fillGeometry()
      },
      inspect: () => {
        const out: ConduitInfo[] = []
        const at = (id: string): Vec3 => {
          const p = nodeById.get(id)
          return p ? [p.x, p.y, p.z] : [NaN, NaN, NaN]
        }
        for (const b of bundles) {
          for (const c of b.conduits) {
            out.push({
              key: b.corridor.key, kind: c.kind, fromId: c.fromId, toId: c.toId,
              from: at(c.fromId), to: at(c.toId), vertexStart: c.vertexStart,
              samples: c.samples, layers: c.layers, lane: c.lane, family: c.family,
            })
          }
        }
        return out
      },
      updateColors: (styleFn: LinkStyleFn) => fillColors(bundles, (b) => styleFn(b.corridor.links[0])),
      updateColorsForNodes: (nodeIds: readonly string[], styleFn: LinkStyleFn) => {
        // Seuls les faisceaux qui touchent ces nœuds sont repeints ; les autres
        // GARDENT leur style courant (ils étaient remis à la couleur de
        // construction, ce qui effaçait la sélection en cours).
        // Le style est évalué sur un lien du corridor qui touche VRAIMENT l'un
        // de ces nœuds (le premier lien du corridor peut ne pas le toucher).
        const set = new Set(nodeIds)
        const touched = new Map<Bundle, Graph3DLink>()
        for (const id of nodeIds) {
          for (const b of bundlesByNode.get(id) ?? []) {
            if (touched.has(b)) continue
            const link = b.corridor.links.find((l) => set.has(endpointId(l.source)) || set.has(endpointId(l.target)))
            touched.set(b, link ?? b.corridor.links[0])
          }
        }
        fillColors(touched.keys(), (b) => styleFn(touched.get(b)!))
      },
      bundleAt: (faceIndex: number) => bundleAtTriangle(ranges, faceIndex),
      onBundleClick,
      // Aucun tampon réécrit, aucune géométrie reconstruite : un uniforme.
      stats: {
        vertices: positionAttr.count,
        triangles: trianglesFromIndex(index.length),
        conduits: bundles.reduce((n, b) => n + b.conduits.length, 0),
        // Couches d'un conduit = son nombre de vertex / (samples × segments).
        layers: 0,
        // Toutes les couches sont transparentes sauf le cœur : on compte les
        // triangles des surfaces translucides, ceux qui coûtent en surdessin.
        // Toutes les couches sont transparentes : le surdessin est le coût total
        // moins la part du seul cœur émissif (une couche sur ~cinq).
        transparentTriangles: Math.round(trianglesFromIndex(index.length) * 0.8),
      },
      setFlowTime: (turns: number) => {
        flowTime = Number.isFinite(turns) ? turns % 1 : 0
        material.uniforms.uFlowTime.value = flowTime
      },
      dispose: () => {
        // Retirer de la scène AVANT de libérer : un groupe laissé attaché
        // continue d'être dessiné après le remplacement du renderer, et ses
        // tubes restent « imprimés » sur l'image.
        group.removeFromParent()
        geometry.dispose()
        material.dispose()
        group.clear()
      },
    }
  } catch {
    // Any failure keeps the previous renderer: the graph never disappears.
    return null
  }
}
