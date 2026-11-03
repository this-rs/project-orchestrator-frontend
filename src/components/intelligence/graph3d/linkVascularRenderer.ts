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
import { buildCorridors, type Corridor } from './linkRouting'
import { buildLinkSystem, fromCorridors, type DrawableBundle, type SystemBudget } from './linkSystem'
import { braidedOffsets, parallelTransportFrames, type Vec3 } from './linkVascular'
import { flowPositions, strataFor, stratumRadius, type Stratum } from './linkStrata'
import { communityToken } from './linkRibbon'
import { LINK_RENDER_ORDER } from './nodePoints'
import { isMobileLikeDevice } from './useRenderLoop'
import { buildRanges, bundleAtTriangle } from './linkVascularPicking'
import { distributePorts, type GroupEnvelope, type GroupPair } from './linkPorts'
import { radiusAt } from './linkRadius'

/** Radial segments. Eight reads round at these widths and stays cheap. */
const TUBE_SEGMENTS = 6
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
/** Rayon d'une fibre, en fraction du rayon du conduit. */
const MICRO_FIBER_RADIUS = 0.07

/** Branches per end — the vascular tree's first division. */
const BRANCHES_PER_END = 3
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
const CONDUIT_LIGHT_BUDGET = 1.9

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute vec3 aNormal;
  attribute float aEmit;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec3 vNormal;
  varying float vEmit;
  varying vec3 vView;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    // Normale de SURFACE : sans elle, un tube n'est qu'une tache de couleur et
    // seul l'additif peut le faire exister — d'ou l'eblouissement.
    vNormal = normalize(mat3(modelMatrix) * aNormal);
    vView = normalize(cameraPosition - wp.xyz);
    vColor = aColor;
    vAlpha = aAlpha;
    vEmit = aEmit;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uLightDir;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec3 vNormal;
  varying float vEmit;
  varying vec3 vView;
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
    float e = 1.0 - exp(-2.0 * vEmit * vAlpha);
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

/** One drawn conduit: a trunk lane or a branch, as a sheath + a core. */
interface Conduit {
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
}

interface Bundle {
  corridor: Corridor
  drawable: DrawableBundle
  color: LinkStyle
  /** Dernière couleur appliquée, pour que le flux puisse repeindre sans style. */
  lastStyle: LinkStyle
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

export interface VascularLinkRenderer extends LinkRenderer {
  /** Fait avancer le flux d'un tour de motif. Sans appel, l'image est stable. */
  setFlowTime?: (turns: number) => void
  /** Key of the bundle that owns this triangle (`faceIndex` from a raycast), or null. */
  bundleAt?: (faceIndex: number) => string | null
  /** Click callback, to be invoked by the DOM wiring. */
  onBundleClick?: (key: string) => void
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

    const nodeById = new Map<string, Graph3DNode>()
    for (const n of nodes) nodeById.set(n.id, n)

    const corridors = buildCorridors(links)
    if (corridors.length === 0) return null

    const system = buildLinkSystem(fromCorridors(corridors), budget)
    if (system.bundles.length === 0) return null

    // Bounding radius of the graph: every thickness is a share of what is on screen.
    let sceneRadius = 1
    for (const n of nodes) {
      const d = Math.hypot(n.x, n.y, n.z)
      if (Number.isFinite(d) && d > sceneRadius) sceneRadius = d
    }

    const corridorByKey = new Map(corridors.map((c) => [c.key, c]))

    // ── MOYEUX : un point d'union par ensemble ──────────────────────────────
    // Un tronc partait d'un NŒUD arbitraire de l'ensemble : rien ne pouvait donc
    // s'unir, et vingt et un corridors dessinaient vingt et un faisceaux
    // indépendants qui se croisaient. Chaque ensemble reçoit un moyeu — le
    // centre de ses nœuds — et TOUS les troncs qui le touchent y convergent :
    // ils fusionnent là, puis se divisent vers leur destination. C'est la
    // demande : « des formes évoluées pour connecter les ensembles quand ils
    // s'unissent, et les redviser automatiquement ».
    const hubId = (token: string) => `hub:${token}`
    const hubPoints = new Map<string, { x: number; y: number; z: number; n: number }>()
    for (const link of links) {
      const sNode = nodeById.get(endpointId(link.source))
      const tNode = nodeById.get(endpointId(link.target))
      if (sNode) {
        const k = communityToken(link.sourceCommunityId)
        const acc = hubPoints.get(k) ?? { x: 0, y: 0, z: 0, n: 0 }
        acc.x += sNode.x; acc.y += sNode.y; acc.z += sNode.z; acc.n++
        hubPoints.set(k, acc)
      }
      if (tNode) {
        const k = communityToken(link.targetCommunityId)
        const acc = hubPoints.get(k) ?? { x: 0, y: 0, z: 0, n: 0 }
        acc.x += tNode.x; acc.y += tNode.y; acc.z += tNode.z; acc.n++
        hubPoints.set(k, acc)
      }
    }
    // Rayon de chaque ensemble : écart moyen de ses extrémités à son centre.
    const envelopeRadius = new Map<string, number>()
    for (const link of links) {
      for (const [end, token] of [
        [nodeById.get(endpointId(link.source)), communityToken(link.sourceCommunityId)] as const,
        [nodeById.get(endpointId(link.target)), communityToken(link.targetCommunityId)] as const,
      ]) {
        const acc = hubPoints.get(token)
        if (!end || !acc || acc.n === 0) continue
        const cx = acc.x / acc.n, cy = acc.y / acc.n, cz = acc.z / acc.n
        const d = Math.hypot(end.x - cx, end.y - cy, end.z - cz)
        envelopeRadius.set(token, (envelopeRadius.get(token) ?? 0) + d)
      }
    }
    for (const [token, sum] of envelopeRadius) {
      const acc = hubPoints.get(token)
      if (!acc || acc.n === 0) continue
      envelopeRadius.set(token, Math.max(8, sum / acc.n))
    }

    const envelopes: GroupEnvelope[] = []
    for (const [token, acc] of hubPoints) {
      if (acc.n === 0) continue
      envelopes.push({
        id: token,
        center: [acc.x / acc.n, acc.y / acc.n, acc.z / acc.n],
        radius: envelopeRadius.get(token) ?? 40,
      })
    }
    const groupPairs: GroupPair[] = corridors
      .filter((c) => c.from !== c.to)
      .map((c) => ({ key: c.key, from: c.from, to: c.to }))
    const { ports, pairPorts } = distributePorts(envelopes, groupPairs)

    // Les ports sont des points de ROUTAGE : ils n'ont ni compte ni relation.
    // On les enregistre comme ancres pour que les conduits puissent s'y accrocher.
    for (const port of ports) {
      nodeById.set(port.id, {
        id: port.id,
        label: '',
        x: port.position[0],
        y: port.position[1],
        z: port.position[2],
      } as unknown as Graph3DNode)
    }
    void hubId

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
        if (communityToken(link.sourceCommunityId) === corridor.from) {
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
      // The most connected real nodes on each side become the branch tips: the
      // trunk visibly enters the cluster instead of stopping in the void.
      const pick = (list: { id: string; deg: number }[]) => {
        const seen = new Set<string>()
        return [...list]
          .sort((p, q) => q.deg - p.deg || (p.id < q.id ? -1 : 1))
          .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
          .slice(0, BRANCHES_PER_END)
          .map((x) => x.id)
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
      // Base radius: a share of the scene, growing with the magnitude order.
      const baseRadius = sceneRadius * 0.02 * (1 + 0.34 * Math.min(9, order))

      const conduits: Conduit[] = []
      const vertexStart = position.length / 3
      let trianglesBefore = index.length / 3

      const addConduit = (
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
        // halo + strates + fibres internes (voir fillConduit).
        const fiberCount = MOBILE_LIKE ? 2 : Math.min(MICRO_FIBERS, 1 + strata.length * 2)
        const layers = 1 + Math.max(1, strata.length) + fiberCount
        const count = samples * TUBE_SEGMENTS * layers
        conduits.push({
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
      const trunkFrom = assigned?.from ?? (geo.branchA[0] ?? endpointId(corridor.links[0].source))
      const trunkTo = assigned?.to ?? (geo.branchB[0] ?? endpointId(corridor.links[0].target))

      laneFamilies.forEach((family, s) => {
        const lane = laneFamilies.length === 1 ? 0.5 : s / (laneFamilies.length - 1)
        addConduit(trunkFrom, trunkTo, 1, SHEATH_ALPHA, lane, trunkSamples, strata, family, s * 0.37, load, 0.85 + 0.5 * shareFrom, 0.85 + 0.5 * shareTo)
      })

      // ── Branches, DEUX niveaux ───────────────────────────────────────────
      // Niveau 1 : du bout du tronc vers les nœuds réels les plus connectés.
      // Niveau 2 : de chaque branche vers un nœud voisin de la même extrémité —
      // c'est ce qui donne l'arborescence des planches, plutôt qu'un tronc qui
      // s'arrête net.
      const branchStrata = strata.slice(-1)
      const trunkEndA = geo.branchA[0]
      const trunkEndB = geo.branchB[0]
      const addBranches = (tip: string | undefined, ids: string[]) => {
        for (const id of ids) {
          if (!tip || id === tip) continue
          addConduit(tip, id, 0.5, SHEATH_ALPHA, 0.5, BRANCH_SAMPLES, branchStrata, null, 0.21, load, 0.85 + 0.5 * shareFrom, 0.2)
        }
        // Second level: one sub-branch per level-1 tip, to the next real node.
        const next = ids[1]
        if (next) {
          for (const id of ids.slice(2)) {
            addConduit(next, id, 0.3, SHEATH_ALPHA, 0.5, BRANCH_SAMPLES, branchStrata, null, 0.13, load, 0.45, 0.14)
          }
        }
      }
      addBranches(trunkEndA, geo.branchA)
      addBranches(trunkEndB, geo.branchB)

      const vertexCount = position.length / 3 - vertexStart
      trianglesPerBundle.push(index.length / 3 - trianglesBefore)
      trianglesBefore = index.length / 3
      bundles.push({
        corridor,
        drawable,
        color: { r: 0.35, g: 0.85, b: 0.75, r2: 0.55, g2: 0.95, b2: 0.85, a: 0.3 },
        lastStyle: { r: 0.35, g: 0.85, b: 0.75, r2: 0.55, g2: 0.95, b2: 0.85, a: 0.3 },
        bowSeed: hashKey(corridor.key),
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
    positionAttr.setUsage(THREE.DynamicDrawUsage)
    colorAttr.setUsage(THREE.DynamicDrawUsage)
    alphaAttr.setUsage(THREE.DynamicDrawUsage)
    normalAttr.setUsage(THREE.DynamicDrawUsage)
    emitAttr.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aColor', colorAttr)
    geometry.setAttribute('aAlpha', alphaAttr)
    geometry.setAttribute('aNormal', normalAttr)
    geometry.setAttribute('aEmit', emitAttr)
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
      uniforms: { uLightDir: { value: new THREE.Vector3(0.45, 0.8, 0.6).normalize() } },
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

    /** Write one conduit's tube into the shared buffers. */
    const fillConduit = (bundle: Bundle, conduit: Conduit, style: LinkStyle) => {
      const s = nodeById.get(conduit.fromId)
      const t = nodeById.get(conduit.toId)
      if (!s || !t) return
      const a: Vec3 = [s.x, s.y, s.z]
      const b: Vec3 = [t.x, t.y, t.z]
      const [c1, c2] = bowAnchors(a, b, bundle.bowSeed + conduit.lane * 0.9)
      const points = sampleCurve(a, c1, c2, b, conduit.samples)
      const frames = parallelTransportFrames(points)
      const order = bundle.corridor.magnitude.magnitudeOrder
      const thickness = sceneRadius * 0.02 * (1 + 0.34 * Math.min(9, order)) * conduit.radius
      const offsets = braidedOffsets(
        Math.max(1, conduit.lane === 0.5 ? 1 : Math.round(bundle.conduits.length / 2)),
        conduit.samples,
        1.4,
        0.5,
      )[0] ?? []
      const pos = positionAttr.array as Float32Array
      const col = colorAttr.array as Float32Array
      const alp = alphaAttr.array as Float32Array
      const nrm = normalAttr.array as Float32Array
      const emi = emitAttr.array as Float32Array
      // Couleur de la voie : celle de SA famille quand elle en porte une, pour
      // que deux familles du même corridor restent distinguables à l'œil.
      const fam = conduit.family ? familyRgb(conduit.family) : null
      const cr = fam ? fam[0] : style.r
      const cg = fam ? fam[1] : style.g
      const cb = fam ? fam[2] : style.b
      const cr2 = fam ? fam[0] : (style.r2 ?? style.r)
      const cg2 = fam ? fam[1] : (style.g2 ?? style.g)
      const cb2 = fam ? fam[2] : (style.b2 ?? style.b)
      const fiberCount = MOBILE_LIKE ? 2 : Math.min(MICRO_FIBERS, 1 + conduit.strata.length * 2)
      const layers = 1 + Math.max(1, conduit.strata.length) + fiberCount
      const samplesPerLayer = conduit.samples * TUBE_SEGMENTS
      // Part de lumière de chaque couche : halo 0,1 puis les strates.
      const shares = [0.05, ...conduit.strata.map((x) => x.alpha), ...Array.from({ length: fiberCount }, () => 0.5)]
      const shareTotal = shares.reduce((acc, v) => acc + v, 0) || 1
      // Grains du flux : leur motif lumineux court le long de la couche la plus
      // interne. `flowPositions` donne des abscisses régulières ; on s'en sert
      // comme d'une période pour moduler la brillance.
      const grains = flowPositions(6, 0, conduit.flowPhase)
      const base = conduit.vertexStart
      for (let layer = 0; layer < layers; layer++) {
        // Couche 0 : le HALO — une enveloppe large et tres faible qui diffuse
        // autour du vaisseau. C'est la lueur des planches, obtenue sans
        // compositeur de post-traitement : un bloom de geometrie, paye une fois.
        const stratumCount = Math.max(1, conduit.strata.length)
        const isHalo = layer === 0
        const isFiber = layer >= 1 + stratumCount
        const fiberIndex = layer - 1 - stratumCount
        const stratum = isHalo || isFiber
          ? { radius: 1.6, alpha: isHalo ? 0.08 : 0.5, carriesFlow: false }
          : (conduit.strata[layer - 1] ?? { radius: 1, alpha: 1, carriesFlow: false })
        // Les fibres sont réparties sur un cercle à 55 % du rayon : on les VOIT
        // courir à l'intérieur de la gaine, ce qui distingue un faisceau d'un
        // simple tube.
        const fiberAngle = isFiber ? (fiberIndex / Math.max(1, fiberCount)) * Math.PI * 2 : 0
        const layerBase = base + layer * samplesPerLayer
        // Un tronc represente des CENTAINES de relations : il ne peut pas
        // emprunter l'opacite au repos d'un fil isole (0,05 a 0,28), sinon il
        // s'eteint. On part d'un plancher propre au vaisseau.
        const baseAlpha = Math.max(0.3, style.a)
        const share = isHalo ? 0.05 : isFiber ? 0.5 : stratum.alpha
        const layerAlpha = Math.min(
          1,
          (CONDUIT_LIGHT_BUDGET * (share / shareTotal) * conduit.alpha * Math.max(0.55, baseAlpha)),
        )
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
          const fiberOrbit = thicknessAt * 0.55
          const layerRadius = isHalo
            ? thicknessAt * 1.7
            : isFiber
              ? thicknessAt * MICRO_FIBER_RADIUS
              : stratumRadius(stratum, thicknessAt)
          const off = offsets[i] ?? [0, 0, 0]
          // Vrille lente : la fibre tourne autour de l'axe en avançant.
          const twist = isFiber ? fiberAngle + u * 2.4 : 0
          const orbitX = isFiber ? Math.cos(twist) * fiberOrbit : 0
          const orbitY = isFiber ? Math.sin(twist) * fiberOrbit : 0
          const cx = f.position[0] + f.normal[0] * (off[0] * layerRadius + orbitX) + f.binormal[0] * (off[1] * layerRadius + orbitY)
          const cy = f.position[1] + f.normal[1] * (off[0] * layerRadius + orbitX) + f.binormal[1] * (off[1] * layerRadius + orbitY)
          const cz = f.position[2] + f.normal[2] * (off[0] * layerRadius + orbitX) + f.binormal[2] * (off[1] * layerRadius + orbitY)
          // Flux : une brillance périodique le long de la couche porteuse. Sans
          // animation c'est déjà des grains lisibles ; `setFlowTime` les fait
          // défiler (voir le champ exposé plus bas).
          let flowGain = 1
          if (stratum.carriesFlow && grains.length > 0) {
            const period = grains.length
            const pos = (u * period + flowTime + conduit.flowPhase) % 1
            const nearest = Math.abs(pos - Math.round(pos))
            flowGain = 0.45 + 0.85 * Math.max(0, 1 - nearest * 3.2)
          }
          for (let k = 0; k < TUBE_SEGMENTS; k++) {
            const ang = (k / TUBE_SEGMENTS) * Math.PI * 2
            const nx = Math.cos(ang)
            const ny = Math.sin(ang)
            const vi = (layerBase + i * TUBE_SEGMENTS + k) * 3
            pos[vi] = cx + f.normal[0] * nx * layerRadius + f.binormal[0] * ny * layerRadius
            pos[vi + 1] = cy + f.normal[1] * nx * layerRadius + f.binormal[1] * ny * layerRadius
            pos[vi + 2] = cz + f.normal[2] * nx * layerRadius + f.binormal[2] * ny * layerRadius
            const g = flowGain
            col[vi] = (cr + (cr2 - cr) * u) * g
            col[vi + 1] = (cg + (cg2 - cg) * u) * g
            col[vi + 2] = (cb + (cb2 - cb) * u) * g
            // Normale de surface : la direction radiale du repère de transport.
            // C'est elle qui donne du volume à la rotation, émission coupée.
            nrm[vi] = f.normal[0] * nx + f.binormal[0] * ny
            nrm[vi + 1] = f.normal[1] * nx + f.binormal[1] * ny
            nrm[vi + 2] = f.normal[2] * nx + f.binormal[2] * ny
            const vi1 = layerBase + i * TUBE_SEGMENTS + k
            alp[vi1] = Math.min(1, layerAlpha * g)
            // Seule la couche qui porte le flux émet ; tout le reste est surface.
            emi[vi1] = !isHalo && stratum.carriesFlow ? 1 : 0
          }
        }
      }
    }

    const fillGeometry = (styleOf: (bundle: Bundle) => LinkStyle) => {
      for (const bundle of bundles) {
        for (const conduit of bundle.conduits) fillConduit(bundle, conduit, styleOf(bundle))
      }
      positionAttr.needsUpdate = true
      colorAttr.needsUpdate = true
      alphaAttr.needsUpdate = true
      normalAttr.needsUpdate = true
      emitAttr.needsUpdate = true
      geometry.computeBoundingSphere()
    }

    const fillColors = (styleOf: (bundle: Bundle) => LinkStyle) => {
      const col = colorAttr.array as Float32Array
      const alp = alphaAttr.array as Float32Array
      for (const bundle of bundles) {
        const style = styleOf(bundle)
        bundle.lastStyle = style
        for (const conduit of bundle.conduits) {
          for (let i = 0; i < conduit.samples; i++) {
            const u = conduit.samples === 1 ? 0 : i / (conduit.samples - 1)
            for (let k = 0; k < TUBE_SEGMENTS; k++) {
              const vi = (conduit.vertexStart + i * TUBE_SEGMENTS + k) * 3
              col[vi] = style.r + ((style.r2 ?? style.r) - style.r) * u
              col[vi + 1] = style.g + ((style.g2 ?? style.g) - style.g) * u
              col[vi + 2] = style.b + ((style.b2 ?? style.b) - style.b) * u
              alp[conduit.vertexStart + i * TUBE_SEGMENTS + k] = Math.min(1, style.a * conduit.alpha)
            }
          }
        }
      }
      colorAttr.needsUpdate = true
      alphaAttr.needsUpdate = true
    }

    fillGeometry((b) => b.color)

    return {
      object: group,
      updatePositions: () => fillGeometry((b) => b.color),
      updateColors: (styleFn: LinkStyleFn) => fillColors((b) => styleFn(b.corridor.links[0])),
      updateColorsForNodes: (nodeIds: readonly string[], styleFn: LinkStyleFn) => {
        const set = new Set(nodeIds)
        fillColors((b) => {
          const link = b.corridor.links[0]
          const touches = set.has(endpointId(link.source)) || set.has(endpointId(link.target))
          return touches ? styleFn(link) : b.color
        })
      },
      bundleAt: (faceIndex: number) => bundleAtTriangle(ranges, faceIndex),
      onBundleClick,
      setFlowTime: (turns: number) => {
        flowTime = Number.isFinite(turns) ? turns % 1 : 0
        fillColors((b) => b.lastStyle)
      },
      dispose: () => {
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
