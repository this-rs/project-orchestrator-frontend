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
import { buildCorridors, endpointId, endpointToken, type Corridor } from './linkRouting'
import { buildLinkSystem, DEFAULT_SYSTEM_BUDGET, fromCorridors, type DrawableBundle, type SystemBudget } from './linkSystem'
import {
  bundleCorridor,
  corridorTree,
  forEachTreeConduit,
  treeConduitLayers,
  treeConduitSamples,
  vascularShapeOf,
} from './linkVascularTree'
import { braidedOffsets, parallelTransportFrames, type Vec3 } from './linkVascular'
import {
  SECTION_SEGMENTS,
  type GeometryStats,
  trianglesFromIndex,
} from './linkGeometryCost'

import { LINK_RENDER_ORDER } from './nodePoints'
import { isMobileLikeDevice } from './useRenderLoop'
import { buildRanges, bundleAtTriangle } from './linkVascularPicking'
import { distributePorts, pairDirection, placePort, type GroupEnvelope, type GroupPair } from './linkPorts'
import { linkRadiusFor, nearestNeighbourScale, softCap } from './linkRadius'


/** Radial segments. Eight reads round at these widths and stays cheap. */
const TUBE_SEGMENTS = SECTION_SEGMENTS
/** Share of the link length used as the spline's bow. */
/**
 * Share of the chord used as the outward bow. It was 0.16: seen in the browser
 * on the real graph, the links made wide loops far around what they join (« les
 * liaisons sont trop grandes »). A link stays close to its two ends; the small
 * bow only keeps parallel trunks from lying on each other.
 */
const BOW = 0.05
/**
 * Fibres internes d'un conduit.
 *
 * Les planches ne montrent pas un tube : elles montrent un FAISCEAU — une gaine
 * translucide dans laquelle on voit courir des dizaines de fibres parallèles.
 * C'est cette structure interne qui fait lire « vaisseau » et non « fil ». Elles
 * tournent en hélice lente autour de l'axe, donc la lumière accroche par
 * intermittence, comme dans les références. Au plus MAX_CONDUIT_CHANNELS
 * (linkGeometryCost), selon ce que porte le conduit (conduitChannels).
 */
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

/** Rayon du cœur, en unités d'épaisseur. */
const CORE_RADIUS = 0.16

export function layerSpecs(channelCount: number): LayerSpec[] {
  // UNE relation (aucun canal) : le cœur et une seule peau collée à lui. Trois
  // membranes autour d'un fil, c'était trois fois plus de surface que de
  // contenu.
  if (channelCount <= 0) {
    return [
      { kind: 'sheath', radius: CORE_RADIUS + MEMBRANE_SKIN, alpha: 0.08, emit: false },
      { kind: 'core', radius: CORE_RADIUS, alpha: 0.7, emit: true },
    ]
  }
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
  out.push({ kind: 'core', radius: CORE_RADIUS, alpha: 0.7, emit: true })
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
  attribute vec3 aAxis;
  uniform float uViewportH;
  uniform float uPxFloor;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec3 vNormal;
  varying float vEmit;
  varying vec3 vView;
  varying float vU;
  varying float vPhase;
  void main() {
    vec3 p = position;
    // PLANCHER ÉCRAN DU CŒUR : un lien d'une relation fait 3 % de l'espacement
    // des nœuds, soit moins d'un pixel au cadrage. Le cœur (et lui seul — la
    // membrane garde son rayon monde) est élargi jusqu'à uPxFloor pixels autour
    // de son axe, pour rester lisible sans grossir le reste.
    if (aEmit > 0.5 && uViewportH > 0.0) {
      vec4 axisView = modelViewMatrix * vec4(aAxis, 1.0);
      float depth = max(1e-6, -axisView.z);
      float worldPerPx = 2.0 * depth / (projectionMatrix[1][1] * uViewportH);
      vec3 radial = position - aAxis;
      float len = length(radial);
      float floorR = uPxFloor * worldPerPx;
      if (len > 1e-9 && len < floorR) p = aAxis + radial * (floorR / len);
    }
    vec4 wp = modelMatrix * vec4(p, 1.0);
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
export type ConduitKind = 'trunk' | 'artery' | 'capillary' | 'junction'

/** One drawn conduit: a trunk lane, a branch, or a junction capsule. */
interface Conduit {
  /** Indice global (ordre de `inspect()`). */
  id: number
  kind: ConduitKind
  fromId: string
  toId: string
  /** Côté du corridor (a = `from`, b = `to`) ; null pour une voie de tronc. */
  side: 'a' | 'b' | null
  /** Relations RÉELLES portées au départ, et encore portées à l'arrivée. */
  n: bigint
  nEnd: bigint
  /** Rayons monde (après plafond), recalculés avec l'échelle. */
  radius: number
  endRadius: number
  /** Indice de voie dans la tresse, et nombre de voies (1 hors tronc). */
  lane: number
  strands: number
  samples: number
  /** Relation family this lane carries (null for branches: they inherit). */
  family: string | null
  /** Flowing grain offset, so two conduits never pulse in step. */
  flowPhase: number
  /** Couches de CE conduit (le contenu dépend de n). */
  specs: LayerSpec[]
  /** First vertex of this conduit in the shared buffers. */
  vertexStart: number
  vertexCount: number
  layers: number
  /** Conduit parent dans l'arbre (-1 = aucun). */
  parent: number
  /** Jonction : ancre vers laquelle pointe l'axe de la capsule. */
  toward: string | null
  /** Axe courant (centres des anneaux), pour le picking écran. */
  axis: Float32Array
  /** Gain de survol (1 = repos). */
  glow: number
}

/** Ce que `inspect()` expose d'un conduit : de quoi mesurer la géométrie. */
export interface ConduitInfo {
  id: number
  key: string
  kind: ConduitKind
  side: 'a' | 'b' | null
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
  /** Nombre EXACT de relations portées (infobulle). */
  n: bigint
  /** Relations encore portées à l'arrivée (artère : ses capillaires dessinés). */
  nEnd: bigint
  parent: number
  radius: number
  endRadius: number
  /** Plafond de cohérence du faisceau. */
  rMax: number
}

/** Résultat d'un picking écran. */
export interface ConduitPick {
  id: number
  key: string
  kind: ConduitKind
  n: bigint
  /** Distance écran à l'axe, en pixels. */
  distancePx: number
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
  bowSeed: number
  conduits: Conduit[]
  /** Groupes touchés (pour le plafond). */
  hubA: string
  hubB: string
  /** Extrémités du tronc (pour sa longueur). */
  trunkFrom: string
  trunkTo: string
  /** Plafond de cohérence courant. */
  rMax: number
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

/** Amplitude de la petite S posée sur l'arc, en part du ventre. */
const S_TWIST = 0.35

/**
 * Deux points de contrôle qui CINTRENT le tronc vers l'extérieur du graphe.
 *
 * Les vaisseaux contournent le centre au lieu de s'y croiser : vingt et un
 * corridors entre six grappes faisaient un nœud illisible au milieu ; les
 * planches montrent des arcs qui enveloppent.
 *
 * Les deux contrôles étaient poussés de part et d'autre (+ventre / −ventre) :
 * B(0,5) retombait EXACTEMENT au milieu de la corde, le ventre vers
 * l'extérieur s'annulait et tous les troncs traversaient le centre. Ils sont
 * maintenant du MÊME côté (arc sortant, B(0,5) = milieu + ¾·ventre) ; une
 * petite S tangentielle, de signe dicté par la graine, garde l'irrégularité.
 *
 * Le ventre est une part de la longueur — rien d'absolu : une corde nulle n'a
 * pas de ventre. L'extérieur se mesure depuis `center` (le centre du graphe),
 * pas depuis l'origine du monde.
 */
export function bowAnchors(a: Vec3, b: Vec3, seed: number, center: Vec3 = [0, 0, 0]): [Vec3, Vec3] {
  const c1 = lerp3(a, b, 1 / 3)
  const c2 = lerp3(a, b, 2 / 3)
  const d = sub3(b, a)
  const len = Math.hypot(d[0], d[1], d[2])
  if (!(len > 1e-9)) return [c1, c2]
  const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len]
  const mid = lerp3(a, b, 0.5)
  // Direction radiale, rendue perpendiculaire à la corde.
  let r = sub3(mid, center)
  const along = r[0] * dir[0] + r[1] * dir[1] + r[2] * dir[2]
  r = [r[0] - dir[0] * along, r[1] - dir[1] * along, r[2] - dir[2] * along]
  if (Math.hypot(r[0], r[1], r[2]) < 1e-6 * len) {
    // La corde passe par le centre : une direction perpendiculaire choisie
    // par la graine, déterministe.
    const helper: Vec3 = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const p = norm3(cross3(dir, helper))
    const q = cross3(dir, p)
    r = [p[0] * Math.cos(seed) + q[0] * Math.sin(seed), p[1] * Math.cos(seed) + q[1] * Math.sin(seed), p[2] * Math.cos(seed) + q[2] * Math.sin(seed)]
  }
  const radial = norm3(r)
  const tangential = norm3(cross3(dir, radial))
  const bow = len * BOW
  const twist = bow * S_TWIST * Math.cos(seed)
  return [
    [c1[0] + radial[0] * bow + tangential[0] * twist, c1[1] + radial[1] * bow + tangential[1] * twist, c1[2] + radial[2] * bow + tangential[2] * twist],
    [c2[0] + radial[0] * bow - tangential[0] * twist, c2[1] + radial[1] * bow - tangential[1] * twist, c2[2] + radial[2] * bow - tangential[2] * twist],
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
  /** Unité d'échelle courante d0 (distance médiane au plus proche voisin). */
  unit?: () => number
  /**
   * Conduit le plus proche du pointeur, en distance ÉCRAN le long des axes
   * (un capillaire fin ne se rate plus au lancer de rayon). `ndc` en [-1, 1].
   */
  pickAt?: (ndcX: number, ndcY: number, camera: THREE.Camera, viewportHeightPx: number, tolerancePx?: number) => ConduitPick | null
  /** Conduits allumés quand on survole `id` : ancêtres jusqu'au tronc, et descendants. */
  pathOf?: (id: number) => number[]
  /** Allume le chemin de `id` (null = éteint). */
  highlightConduit?: (id: number | null) => void
}

/** Plancher de rayon ÉCRAN du cœur, en pixels : un lien d'une relation reste visible. */
export const CORE_SCREEN_FLOOR_PX = 0.6
/** Gain d'opacité d'un chemin survolé. */
const GLOW_GAIN = 2.2
/** Plafond : part du rayon du plus petit groupe touché, et de la longueur du tronc. */
export const CAP_GROUP_SHARE = 0.15
export const CAP_TRUNK_SHARE = 0.06

/**
 * Le budget EXACT du renderer vasculaire : la forme de chaque faisceau
 * calculée sur les positions (vascularShapeOf), le rayon de la scène mesuré
 * depuis son CENTRE (pour le LOD, lodOptionsForScene) et le type d'appareil.
 * Le renderer s'en sert ; un test qui veut l'estimation exacte aussi.
 */
export function vascularBudget(
  nodes: readonly { id: string; x: number; y: number; z: number }[],
  corridors: readonly Corridor[],
  budget: Partial<SystemBudget> = {},
): Partial<SystemBudget> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  let cx = 0, cy = 0, cz = 0
  for (const n of nodes) { cx += n.x; cy += n.y; cz += n.z }
  const count = Math.max(1, nodes.length)
  cx /= count; cy /= count; cz /= count
  let sceneRadius = 0
  for (const n of nodes) sceneRadius = Math.max(sceneRadius, Math.hypot(n.x - cx, n.y - cy, n.z - cz))
  return {
    ...budget,
    ...(sceneRadius > 0 ? { sceneRadius } : {}),
    mobile: MOBILE_LIKE,
    shapeOf: vascularShapeOf((id) => byId.get(id), corridors, MOBILE_LIKE),
  }
}

/**
 * Build the vascular link layer, or null when the data cannot carry it.
 */
/**
 * The frame the link law is measured in, taken from the WHOLE graph by the
 * caller. With the dynamic scale the drawn set changes at every cut (60 spread
 * groups ↔ hundreds of close files): a unit and a centre measured on what is
 * drawn collapsed and moved at each zoom step, and every tube changed width and
 * place — « les tubes bougent pendant le zoom ». Given, they never move: a zoom
 * only makes the tubes grow and shrink on screen.
 */
export interface VascularSceneFrame {
  /** d0 of the whole graph (median nearest-neighbour distance). */
  unit: number
  /** Centre of the whole graph (the outward bow is measured from it). */
  center: Vec3
}

export function createVascularLinks(
  nodes: Graph3DNode[],
  links: Graph3DLink[],
  budget: Partial<SystemBudget> = {},
  onBundleClick?: (key: string) => void,
  frame?: VascularSceneFrame,
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

    const system = buildLinkSystem(fromCorridors(corridors), vascularBudget(nodes, corridors, budget))
    if (system.bundles.length === 0) return null

    const corridorByKey = new Map(corridors.map((c) => [c.key, c]))

    // ── MOYEUX : un point d'union par ensemble ──────────────────────────────
    // Chaque ensemble reçoit un moyeu — le centre de ses extrémités — et les
    // troncs qui le touchent partent de PORTS posés sur son enveloppe.
    //
    // ── ANCRES VIVANTES ─────────────────────────────────────────────────
    // Moyeux, ports et sous-moyeux ne sont PAS des nœuds : ce sont des points
    // calculés depuis les nœuds réels, recalculés sans allocation à chaque
    // `updatePositions`. Seule la TOPOLOGIE (qui appartient à quel port, à quel
    // sous-moyeu) est figée à la construction.
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

    // ── ÉCHELLE ─────────────────────────────────────────────────────────
    // L'unité est d0, la distance médiane d'un nœud à son plus proche voisin
    // (linkRadius.ts). Elle n'est recalculée que si l'étendue du graphe a
    // changé de plus de 10 % : une translation ne la change pas, un zoom du
    // layout (positions × k) la multiplie par k.
    let d0 = 1
    let d0Extent = -1
    const sceneCenter: Vec3 = [0, 0, 0]
    const recomputeScale = () => {
      if (frame && frame.unit > 0) {
        d0 = frame.unit
        sceneCenter[0] = frame.center[0]
        sceneCenter[1] = frame.center[1]
        sceneCenter[2] = frame.center[2]
        return
      }
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
      let gx = 0, gy = 0, gz = 0
      for (const n of nodes) {
        gx += n.x; gy += n.y; gz += n.z
        if (n.x < minX) minX = n.x
        if (n.y < minY) minY = n.y
        if (n.z < minZ) minZ = n.z
        if (n.x > maxX) maxX = n.x
        if (n.y > maxY) maxY = n.y
        if (n.z > maxZ) maxZ = n.z
      }
      const count = Math.max(1, nodes.length)
      sceneCenter[0] = gx / count
      sceneCenter[1] = gy / count
      sceneCenter[2] = gz / count
      const extent = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
      if (d0Extent < 0 || Math.abs(extent - d0Extent) > 0.1 * d0Extent) {
        const d = nearestNeighbourScale(nodes)
        // Graphe dégénéré (tous les nœuds confondus) : une unité tirée de
        // l'étendue, ou 1 à défaut — jamais zéro.
        d0 = d > 0 ? d : extent > 0 ? extent / Math.max(1, Math.cbrt(nodes.length)) : 1
        d0Extent = extent
      }
    }

    const recomputeHubs = () => {
      for (const h of hubs.values()) {
        const count = h.members.length
        if (count === 0) continue
        let x = 0, y = 0, z = 0
        for (const m of h.members) { x += m.x; y += m.y; z += m.z }
        h.center[0] = x / count
        h.center[1] = y / count
        h.center[2] = z / count
        // Rayon de l'ensemble : écart moyen de ses extrémités à son centre.
        // Plancher RELATIF (un dixième de d0, plus de 8 unités monde) : un groupe
        // d'un seul nœud pose ses ports tout près de lui, sans les faire
        // traverser jusqu'au voisin.
        let sum = 0
        for (const m of h.members) sum += Math.hypot(m.x - h.center[0], m.y - h.center[1], m.z - h.center[2])
        h.radius = Math.max(0.1 * d0, sum / count)
      }
    }
    recomputeScale()
    recomputeHubs()

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
    interface PortRec {
      anchor: Point3
      hub: Hub
      /** Liaisons qui partent de ce port : le groupe d'en face, et de quel côté. */
      others: { from: Hub; to: Hub; key: string; side: 'from' | 'to' }[]
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
      if (!toHub || !fromHub) continue
      portById.get(pp.from)?.others.push({ from: fromHub, to: toHub, key, side: 'from' })
      portById.get(pp.to)?.others.push({ from: fromHub, to: toHub, key, side: 'to' })
    }
    /** Même règle que `distributePorts` : somme des directions sortantes, posée sur l'enveloppe. */
    const recomputePorts = () => {
      for (const rec of portRecs) {
        const c = rec.hub.center
        rec.sum[0] = 0; rec.sum[1] = 0; rec.sum[2] = 0
        for (const o of rec.others) {
          const d = pairDirection(o.from.center, o.to.center, o.key, o.side)
          rec.sum[0] += d[0]; rec.sum[1] += d[1]; rec.sum[2] += d[2]
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
      recomputeScale()
      recomputeHubs()
      recomputePorts()
      recomputeSubs()
    }

    // ── Buffers ──────────────────────────────────────────────────────────
    const bundles: Bundle[] = []
    const allConduits: Conduit[] = []
    const position: number[] = []
    const index: number[] = []
    const trianglesPerBundle: number[] = []
    let coreTriangles = 0
    const positionOf = (id: string) => nodeById.get(id)

    for (const drawable of system.bundles) {
      // Un faisceau AGRÉGÉ (drawable.members) est dessiné comme un corridor
      // synthétique : la paire de son plus gros membre, la somme exacte de ses
      // membres, leurs liens réels. Le budget l'a compté de la même façon.
      const corridor = bundleCorridor(drawable.corridor, drawable.members, corridorByKey)
      if (!corridor) continue
      const tree = corridorTree(corridor, positionOf, drawable.morphology.graphical.channels)
      if (!tree) continue
      const trunkSamples = drawable.samples

      const conduits: Conduit[] = []
      const vertexStart = position.length / 3
      const trianglesBefore = index.length / 3

      const addConduit = (c: {
        kind: ConduitKind
        fromId: string
        toId: string
        side: 'a' | 'b' | null
        n: bigint
        nEnd?: bigint
        layers: number
        lane?: number
        strands?: number
        samples: number
        family?: string | null
        flowPhase: number
        parent?: number
        toward?: string | null
      }): Conduit => {
        const specs = layerSpecs(c.layers <= 2 ? 0 : c.layers - 4)
        const layers = specs.length
        const count = c.samples * TUBE_SEGMENTS * layers
        const conduit: Conduit = {
          id: allConduits.length,
          kind: c.kind,
          fromId: c.fromId,
          toId: c.toId,
          side: c.side,
          n: c.n,
          nEnd: c.nEnd ?? c.n,
          radius: 0,
          endRadius: 0,
          lane: c.lane ?? 0,
          strands: c.strands ?? 1,
          samples: c.samples,
          family: c.family ?? null,
          flowPhase: c.flowPhase,
          specs,
          vertexStart: position.length / 3,
          vertexCount: count,
          layers,
          parent: c.parent ?? -1,
          toward: c.toward ?? null,
          axis: new Float32Array(c.samples * 3),
          glow: 1,
        }
        conduits.push(conduit)
        allConduits.push(conduit)
        for (let i = 0; i < count; i++) position.push(0, 0, 0)
        const base = conduit.vertexStart
        for (let layer = 0; layer < layers; layer++) {
          const layerBase = base + layer * c.samples * TUBE_SEGMENTS
          for (let i = 0; i < c.samples - 1; i++) {
            for (let k = 0; k < TUBE_SEGMENTS; k++) {
              const a0 = layerBase + i * TUBE_SEGMENTS + k
              const a1 = layerBase + i * TUBE_SEGMENTS + ((k + 1) % TUBE_SEGMENTS)
              const b0 = a0 + TUBE_SEGMENTS
              const b1 = a1 + TUBE_SEGMENTS
              index.push(a0, b0, a1, a1, b0, b1)
            }
          }
          if (specs[layer].emit) coreTriangles += (c.samples - 1) * TUBE_SEGMENTS * 2
        }
        return conduit
      }

      // Le tronc va d'un PORT à un PORT (ceux de la paire du corridor — pour
      // un agrégat, ceux de son plus gros membre) ; un corridor interne relie
      // deux extrémités réelles distinctes.
      const assigned = pairPorts.get(corridor.key) ?? (drawable.members ? pairPorts.get(drawable.members[0]) : undefined)
      let trunkFrom = tree.a.ranked[0].id
      let trunkTo = tree.b.ranked[0].id
      if (tree.trunk?.kind === 'ports' && assigned?.from && assigned.to) {
        trunkFrom = assigned.from
        trunkTo = assigned.to
      } else if (tree.trunk?.kind === 'nodes') {
        trunkFrom = tree.trunk.from
        trunkTo = tree.trunk.to
      }

      // ── Construction, dans l'ordre EXACT de l'énumération partagée ──────
      // Voies = FAMILLES (une vraie partition, chacune son n exact) ; puis de
      // chaque côté : capsule du port, et par paquet son artère, la capsule
      // du sous-moyeu et ses capillaires. Le budget compte la même liste.
      const laneIds: number[] = []
      let currentArtery = -1
      let currentSub = ''
      forEachTreeConduit(tree, (tc) => {
        const layers = treeConduitLayers(tc, MOBILE_LIKE)
        const samples = treeConduitSamples(tc, trunkSamples)
        if (tc.kind === 'trunk') {
          const lane = addConduit({
            kind: 'trunk', fromId: trunkFrom, toId: trunkTo, side: null, n: tc.def.n, layers,
            lane: tc.lane, strands: tree.lanes.length, samples, family: tc.def.family, flowPhase: tc.lane * 0.37,
          })
          laneIds.push(lane.id)
          return
        }
        const hub = tc.side === 'a' ? trunkFrom : trunkTo
        const other = tc.side === 'a' ? trunkTo : trunkFrom
        const trunkParent = laneIds[0] ?? -1
        if (tc.kind === 'junction' && tc.at === 'port') {
          // Capsule du port : rayon du tronc entier (toutes voies confondues).
          addConduit({
            kind: 'junction', fromId: hub, toId: hub, side: tc.side, n: tc.n, layers,
            samples, flowPhase: 0, parent: trunkParent, toward: other,
          })
          return
        }
        if (tc.kind === 'artery') {
          if (tc.direct) {
            // Un paquet d'UNE extrémité : pas de sous-moyeu (il serait le
            // nœud lui-même) ; l'artère rejoint directement le nœud réel.
            addConduit({
              kind: 'artery', fromId: hub, toId: tc.direct.id, side: tc.side, n: tc.n, layers,
              samples, flowPhase: 0.31, parent: trunkParent,
            })
            return
          }
          const group = tree[tc.side].groups[tc.group]
          currentSub = `sub:${corridor.key}:${tc.side}:${tc.group}`
          const sub: SubRec = { anchor: { x: 0, y: 0, z: 0 }, members: group.drawn.map((e) => nodeById.get(e.id)!) }
          subRecs.push(sub)
          nodeById.set(currentSub, sub.anchor)
          // L'artère porte tout son paquet au départ, et seulement ce que ses
          // capillaires dessinés emportent à l'arrivée : elle s'affine en route
          // (les extrémités non dessinées). Murray tient aux DEUX jonctions.
          currentArtery = addConduit({
            kind: 'artery', fromId: hub, toId: currentSub, side: tc.side, n: tc.n, nEnd: tc.nEnd, layers,
            samples, flowPhase: 0.31, parent: trunkParent,
          }).id
          return
        }
        if (tc.kind === 'junction') {
          addConduit({
            kind: 'junction', fromId: currentSub, toId: currentSub, side: tc.side, n: tc.n, layers,
            samples, flowPhase: 0, parent: currentArtery, toward: hub,
          })
          return
        }
        addConduit({
          kind: 'capillary', fromId: currentSub, toId: tc.end.id, side: tc.side, n: tc.end.n, layers,
          samples, flowPhase: 0.13, parent: currentArtery,
        })
      })

      if (conduits.length === 0) continue
      const vertexCount = position.length / 3 - vertexStart
      trianglesPerBundle.push(index.length / 3 - trianglesBefore)
      bundles.push({
        corridor,
        drawable,
        color: { r: 0.35, g: 0.85, b: 0.75, r2: 0.55, g2: 0.95, b2: 0.85, a: 0.3 },
        lastStyle: { r: 0.35, g: 0.85, b: 0.75, r2: 0.55, g2: 0.95, b2: 0.85, a: 0.3 },
        bowSeed: hashKey(corridor.key),
        conduits,
        hubA: corridor.from,
        hubB: corridor.to,
        trunkFrom,
        trunkTo,
        rMax: Infinity,
        vertexStart,
        vertexCount,
      })
    }

    // PLAFOND DUR. Le modèle de coût partagé rend l'estimation exacte ; si un
    // écart réapparaissait (un bug du modèle), le budget reste un plafond : on
    // retire les plus petits faisceaux (fin de liste) jusqu'à rentrer dedans.
    const maxTriangles = budget.maxTriangles ?? DEFAULT_SYSTEM_BUDGET.maxTriangles
    if (index.length / 3 > maxTriangles) {
      if (import.meta.env?.DEV) {
        console.warn(`[linkVascular] ${index.length / 3} triangles produits pour un budget de ${maxTriangles} : troncature`)
      }
      while (bundles.length > 0 && index.length / 3 > maxTriangles) {
        const last = bundles.pop()!
        trianglesPerBundle.pop()

        const firstTriangle = trianglesPerBundle.reduce((s, t) => s + t, 0)
        index.length = firstTriangle * 3
        position.length = last.vertexStart * 3
        allConduits.length -= last.conduits.length
        coreTriangles = 0
        for (const b of bundles) for (const c of b.conduits) for (const s of c.specs) if (s.emit) coreTriangles += (c.samples - 1) * TUBE_SEGMENTS * 2
      }
    }

    if (bundles.length === 0) return null

    const vertexTotal = position.length / 3
    const geometry = new THREE.BufferGeometry()
    const dyn = (arr: Float32Array, size: number) => {
      const attr = new THREE.BufferAttribute(arr, size)
      attr.setUsage(THREE.DynamicDrawUsage)
      return attr
    }
    const positionAttr = dyn(new Float32Array(position), 3)
    const colorAttr = dyn(new Float32Array(vertexTotal * 3), 3)
    const alphaAttr = dyn(new Float32Array(vertexTotal), 1)
    const normalAttr = dyn(new Float32Array(vertexTotal * 3), 3)
    const emitAttr = dyn(new Float32Array(vertexTotal), 1)
    const curvAttr = dyn(new Float32Array(vertexTotal), 1)
    const phaseAttr = dyn(new Float32Array(vertexTotal), 1)
    const axisAttr = dyn(new Float32Array(vertexTotal * 3), 3)
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aColor', colorAttr)
    geometry.setAttribute('aAlpha', alphaAttr)
    geometry.setAttribute('aNormal', normalAttr)
    geometry.setAttribute('aEmit', emitAttr)
    geometry.setAttribute('aU', curvAttr)
    geometry.setAttribute('aPhase', phaseAttr)
    geometry.setAttribute('aAxis', axisAttr)
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
        uViewportH: { value: 0 },
        uPxFloor: { value: CORE_SCREEN_FLOOR_PX },
      },
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.renderOrder = LINK_RENDER_ORDER
    mesh.frustumCulled = false
    // Le plancher écran du cœur a besoin de la hauteur réelle du tampon.
    const drawSize = new THREE.Vector2()
    mesh.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(drawSize)
      material.uniforms.uViewportH.value = drawSize.y
    }
    const group = new THREE.Group()
    group.add(mesh)

    const ranges = buildRanges(
      bundles.map((b) => b.corridor.key),
      trianglesPerBundle,
    )

    /** Rayons de chaque conduit : la loi r(n), puis le plafond du faisceau. */
    const recomputeRadii = () => {
      for (const b of bundles) {
        const ha = hubs.get(b.hubA)
        const hb = hubs.get(b.hubB)
        // Pour le plafond, un groupe occupe au moins l'espacement d'un nœud.
        const smallest = Math.max(d0, Math.min(ha?.radius ?? Infinity, hb?.radius ?? Infinity))
        const s = nodeById.get(b.trunkFrom)
        const t = nodeById.get(b.trunkTo)
        const trunkLen = s && t ? Math.hypot(t.x - s.x, t.y - s.y, t.z - s.z) : Infinity
        let rMax = Math.min(CAP_GROUP_SHARE * smallest, trunkLen > 0 ? CAP_TRUNK_SHARE * trunkLen : Infinity)
        if (!Number.isFinite(rMax)) rMax = CAP_GROUP_SHARE * d0
        b.rMax = rMax
        for (const c of b.conduits) {
          c.radius = softCap(linkRadiusFor(Number(c.n), d0), rMax)
          c.endRadius = softCap(linkRadiusFor(Number(c.nEnd), d0), rMax)
        }
      }
    }

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
      conduit.axis.fill(NaN)
    }

    /** Écrit les anneaux d'un conduit le long de `points`, rayon `rAt(u)`. */
    const writeRings = (
      conduit: Conduit,
      points: Vec3[],
      rAt: (u: number) => number,
      braid: Vec3[] | null,
      braidScale: number,
    ) => {
      const frames = parallelTransportFrames(points)
      const pos = positionAttr.array as Float32Array
      const nrm = normalAttr.array as Float32Array
      const emi = emitAttr.array as Float32Array
      const crv = curvAttr.array as Float32Array
      const pha = phaseAttr.array as Float32Array
      const axs = axisAttr.array as Float32Array
      const specs = conduit.specs
      const channelCount = specs.filter((s) => s.kind === 'channel').length
      const outer = specs[0].radius
      const samplesPerLayer = conduit.samples * TUBE_SEGMENTS
      for (let i = 0; i < conduit.samples; i++) {
        const f = frames[Math.min(i, frames.length - 1)]
        if (!f) continue
        conduit.axis[i * 3] = f.position[0]
        conduit.axis[i * 3 + 1] = f.position[1]
        conduit.axis[i * 3 + 2] = f.position[2]
      }
      for (let layer = 0; layer < specs.length; layer++) {
        const spec = specs[layer]
        const layerBase = conduit.vertexStart + layer * samplesPerLayer
        for (let i = 0; i < conduit.samples; i++) {
          const f = frames[Math.min(i, frames.length - 1)]
          if (!f) continue
          const u = conduit.samples === 1 ? 0 : i / (conduit.samples - 1)
          // Le rayon VISIBLE (couche externe) vaut r ; les couches sont des
          // fractions de lui.
          const thicknessAt = rAt(u) / outer
          const layerRadius = thicknessAt * spec.radius
          // Tresse : un axe commun à toutes les couches de la voie, exprimé en
          // unités d'épaisseur pour ringCenterOffset.
          const off = braid ? braid[i] : null
          const bx = off && thicknessAt > 0 ? (off[0] * braidScale) / thicknessAt : 0
          const by = off && thicknessAt > 0 ? (off[1] * braidScale) / thicknessAt : 0
          const [ox, oy] = ringCenterOffset(spec, [bx, by], thicknessAt, channelCount, u)
          const cx = f.position[0] + f.normal[0] * ox + f.binormal[0] * oy
          const cy = f.position[1] + f.normal[1] * ox + f.binormal[1] * oy
          const cz = f.position[2] + f.normal[2] * ox + f.binormal[2] * oy
          for (let k = 0; k < TUBE_SEGMENTS; k++) {
            const ang = (k / TUBE_SEGMENTS) * Math.PI * 2
            const nx = Math.cos(ang)
            const ny = Math.sin(ang)
            const v = layerBase + i * TUBE_SEGMENTS + k
            const vi = v * 3
            pos[vi] = cx + f.normal[0] * nx * layerRadius + f.binormal[0] * ny * layerRadius
            pos[vi + 1] = cy + f.normal[1] * nx * layerRadius + f.binormal[1] * ny * layerRadius
            pos[vi + 2] = cz + f.normal[2] * nx * layerRadius + f.binormal[2] * ny * layerRadius
            axs[vi] = cx
            axs[vi + 1] = cy
            axs[vi + 2] = cz
            nrm[vi] = f.normal[0] * nx + f.binormal[0] * ny
            nrm[vi + 1] = f.normal[1] * nx + f.binormal[1] * ny
            nrm[vi + 2] = f.normal[2] * nx + f.binormal[2] * ny
            // Seule la couche qui porte le flux émet ; tout le reste est surface.
            emi[v] = spec.emit ? 1 : 0
            crv[v] = u
            pha[v] = conduit.flowPhase
          }
        }
      }
    }

    /** Tresse de chaque voie, calculée une fois : elle ne dépend que de la topologie. */
    const braidCache = new Map<Conduit, Vec3[]>()
    const braidOf = (conduit: Conduit): Vec3[] | null => {
      if (conduit.kind !== 'trunk' || conduit.strands < 2) return null
      let b = braidCache.get(conduit)
      if (!b) {
        // Le brin PROPRE de la voie, et une enveloppe sin(πu) : décalage nul
        // aux deux extrémités, les voies convergent exactement sur le port.
        const all = braidedOffsets(conduit.strands, conduit.samples, 1.4, 1)
        const own = all[conduit.lane] ?? []
        b = own.map((o, i) => {
          const u = conduit.samples === 1 ? 0 : i / (conduit.samples - 1)
          const env = Math.sin(Math.PI * u)
          return [o[0] * env, o[1] * env, 0] as Vec3
        })
        braidCache.set(conduit, b)
      }
      return b
    }

    /** Write one conduit's tube into the shared buffers. */
    const fillConduit = (bundle: Bundle, conduit: Conduit, style: LinkStyle) => {
      const s = nodeById.get(conduit.fromId)
      const t = nodeById.get(conduit.toId)
      if (!s || !t) {
        // Un nœud a disparu : on EFFACE le conduit au lieu de le laisser.
        hideConduit(conduit)
        return
      }
      if (conduit.kind === 'junction') {
        // Capsule fermée : un tronçon droit de ±R autour de l'ancre, dont les
        // anneaux suivent un profil de sphère (pôles fermés). Elle bouche la
        // jonction : ni trou, ni marche entre le parent et ses enfants.
        const w = nodeById.get(conduit.toward ?? '')
        const R = conduit.radius
        let dx = 0, dy = 1, dz = 0
        if (w) {
          const ex = w.x - s.x, ey = w.y - s.y, ez = w.z - s.z
          const len = Math.hypot(ex, ey, ez)
          if (len > 1e-9) { dx = ex / len; dy = ey / len; dz = ez / len }
        }
        const points: Vec3[] = []
        for (let i = 0; i < conduit.samples; i++) {
          const x = (2 * i) / (conduit.samples - 1) - 1
          points.push([s.x + dx * R * x, s.y + dy * R * x, s.z + dz * R * x])
        }
        writeRings(conduit, points, (u) => R * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)), null, 0)
        paintConduit(conduit, style)
        return
      }
      const a: Vec3 = [s.x, s.y, s.z]
      const b: Vec3 = [t.x, t.y, t.z]
      // Toutes les voies d'un tronc partagent la MÊME courbe ; seule la tresse
      // les sépare (et elle s'annule aux ports).
      const [c1, c2] = bowAnchors(a, b, bundle.bowSeed, sceneCenter)
      const points = sampleCurve(a, c1, c2, b, conduit.samples)
      const r0 = conduit.radius
      const r1 = conduit.endRadius
      // Rayon du tronc entier : la tresse tourne dans son enveloppe.
      const trunkR = conduit.kind === 'trunk'
        ? softCap(linkRadiusFor(Number(bundle.corridor.magnitude.exactCount), d0), bundle.rMax)
        : 0
      writeRings(
        conduit,
        points,
        (u) => r0 + (r1 - r0) * u * u * (3 - 2 * u),
        braidOf(conduit),
        trunkR * 0.5,
      )
      paintConduit(conduit, style)
    }

    /**
     * Couleur et opacité de TOUTES les couches d'un conduit.
     *
     * Une seule fonction, partagée par le maillage et la recoloration. Chaque
     * couche garde SON opacité (spec × style × conduit). La couleur d'une voie
     * reste celle de sa famille : la surbrillance la TEINTE, elle ne la
     * remplace pas. Un conduit survolé (`glow`) gagne en opacité et s'éclaircit.
     */
    const paintConduit = (conduit: Conduit, style: LinkStyle) => {
      const col = colorAttr.array as Float32Array
      const alp = alphaAttr.array as Float32Array
      const fam = conduit.family ? familyRgb(conduit.family) : null
      const sr = style.r, sg = style.g, sb = style.b
      const sr2 = style.r2 ?? sr, sg2 = style.g2 ?? sg, sb2 = style.b2 ?? sb
      const specs = conduit.specs
      const baseAlpha = Math.max(0.6, Math.max(0.3, style.a))
      const glow = conduit.glow
      const lift = glow > 1 ? 0.35 : 0
      const samplesPerLayer = conduit.samples * TUBE_SEGMENTS
      for (let layer = 0; layer < specs.length; layer++) {
        const layerAlpha = Math.min(1, specs[layer].alpha * baseAlpha * SHEATH_ALPHA * glow)
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
          r += (1 - r) * lift
          g += (1 - g) * lift
          b += (1 - b) * lift
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
      recomputeRadii()
      for (const bundle of bundles) {
        for (const conduit of bundle.conduits) fillConduit(bundle, conduit, bundle.lastStyle)
      }
      positionAttr.needsUpdate = true
      colorAttr.needsUpdate = true
      alphaAttr.needsUpdate = true
      normalAttr.needsUpdate = true
      emitAttr.needsUpdate = true
      curvAttr.needsUpdate = true
      phaseAttr.needsUpdate = true
      axisAttr.needsUpdate = true
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
          paintConduit(conduit, style)
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
    const bundleOfConduit = new Map<number, Bundle>()
    for (const b of bundles) for (const c of b.conduits) bundleOfConduit.set(c.id, b)

    /**
     * Chemin allumé au survol d'un conduit : ses ancêtres jusqu'au tronc (avec
     * les capsules traversées), et tous ses descendants. Survoler une voie de
     * tronc allume donc tout l'arbre du corridor.
     */
    const pathOf = (id: number): number[] => {
      const start = allConduits[id]
      const bundle = bundleOfConduit.get(id)
      if (!start || !bundle) return []
      const out = new Set<number>([id])
      if (start.kind === 'trunk') {
        for (const c of bundle.conduits) out.add(c.id)
        return [...out]
      }
      // Descendants.
      const stack = [id]
      while (stack.length > 0) {
        const cur = stack.pop()!
        for (const c of bundle.conduits) {
          if (c.parent === cur && !out.has(c.id)) { out.add(c.id); stack.push(c.id) }
        }
      }
      // Ancêtres : jusqu'au tronc, qui compte toutes ses voies.
      let p = start.parent
      while (p >= 0) {
        const pc = allConduits[p]
        out.add(p)
        if (pc.kind === 'trunk') {
          for (const c of bundle.conduits) if (c.kind === 'trunk') out.add(c.id)
          break
        }
        p = pc.parent
      }
      // Capsules traversées : celle du port de ce côté, celle du sous-moyeu.
      for (const c of bundle.conduits) {
        if (c.kind !== 'junction') continue
        if (out.has(c.parent) && (c.side === start.side || start.side === null)) out.add(c.id)
      }
      return [...out]
    }

    let glowing: number[] = []
    const highlightConduit = (id: number | null) => {
      const touched = new Set<Bundle>()
      for (const g of glowing) {
        allConduits[g].glow = 1
        const b = bundleOfConduit.get(g)
        if (b) touched.add(b)
      }
      glowing = id === null ? [] : pathOf(id)
      for (const g of glowing) {
        allConduits[g].glow = GLOW_GAIN
        const b = bundleOfConduit.get(g)
        if (b) touched.add(b)
      }
      fillColors(touched, (b) => b.lastStyle)
    }

    const projected = new THREE.Vector3()
    const pickAt = (
      ndcX: number,
      ndcY: number,
      camera: THREE.Camera,
      viewportHeightPx: number,
      tolerancePx = 6,
    ): ConduitPick | null => {
      if (!(viewportHeightPx > 0)) return null
      // Pixels par unité NDC : la moitié de la hauteur (l'aspect est absorbé
      // par la projection ; une distance en x est comptée à la même échelle,
      // ce qui reste une tolérance de l'ordre du pixel).
      const half = viewportHeightPx / 2
      let best: ConduitPick | null = null
      let px = 0, py = 0, pvalid = false
      for (const c of allConduits) {
        if (c.kind === 'junction') continue
        pvalid = false
        for (let i = 0; i < c.samples; i++) {
          const x = c.axis[i * 3]
          if (!Number.isFinite(x)) { pvalid = false; continue }
          projected.set(x, c.axis[i * 3 + 1], c.axis[i * 3 + 2]).project(camera)
          const inFront = projected.z >= -1 && projected.z <= 1
          const qx = projected.x * half
          const qy = projected.y * half
          if (inFront && pvalid) {
            // Distance du pointeur au segment écran [p, q].
            const mx = ndcX * half, my = ndcY * half
            const sx = qx - px, sy = qy - py
            const l2 = sx * sx + sy * sy
            const t = l2 > 0 ? Math.max(0, Math.min(1, ((mx - px) * sx + (my - py) * sy) / l2)) : 0
            const d = Math.hypot(mx - (px + sx * t), my - (py + sy * t))
            if (d <= tolerancePx && (!best || d < best.distancePx)) {
              const bundle = bundleOfConduit.get(c.id)!
              best = { id: c.id, key: bundle.corridor.key, kind: c.kind, n: c.n, distancePx: d }
            }
          }
          px = qx; py = qy; pvalid = inFront
        }
      }
      return best
    }

    recomputeSubs()
    fillGeometry()

    const totalTriangles = trianglesFromIndex(index.length)
    return {
      object: group,
      updatePositions: () => {
        recomputeAnchors()
        fillGeometry()
      },
      updateColors: (styleFn: LinkStyleFn) => fillColors(bundles, (b) => styleFn(b.corridor.links[0])),
      updateColorsForNodes: (nodeIds: readonly string[], styleFn: LinkStyleFn) => {
        // Seuls les faisceaux qui touchent ces nœuds sont repeints ; le style
        // est évalué sur un lien du corridor qui touche VRAIMENT l'un d'eux.
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
      inspect: () => {
        const at = (id: string): Vec3 => {
          const p = nodeById.get(id)
          return p ? [p.x, p.y, p.z] : [NaN, NaN, NaN]
        }
        const out: ConduitInfo[] = []
        for (const b of bundles) {
          for (const c of b.conduits) {
            out.push({
              id: c.id, key: b.corridor.key, kind: c.kind, side: c.side, fromId: c.fromId, toId: c.toId,
              from: at(c.fromId), to: at(c.toId), vertexStart: c.vertexStart,
              samples: c.samples, layers: c.layers, lane: c.lane, family: c.family,
              n: c.n, nEnd: c.nEnd, parent: c.parent, radius: c.radius, endRadius: c.endRadius, rMax: b.rMax,
            })
          }
        }
        return out
      },
      unit: () => d0,
      pickAt,
      pathOf,
      highlightConduit,
      stats: {
        vertices: positionAttr.count,
        triangles: totalTriangles,
        conduits: allConduits.length,
        // Couches du conduit le plus riche (elles varient avec n).
        layers: allConduits.reduce((m, c) => Math.max(m, c.layers), 0),
        // Tout est translucide sauf le cœur émissif : compté sur l'index réel.
        transparentTriangles: totalTriangles - coreTriangles,
      },
      setFlowTime: (turns: number) => {
        flowTime = Number.isFinite(turns) ? turns % 1 : 0
        material.uniforms.uFlowTime.value = flowTime
      },
      dispose: () => {
        // Retirer de la scène AVANT de libérer : un groupe laissé attaché
        // continue d'être dessiné après le remplacement du renderer.
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
