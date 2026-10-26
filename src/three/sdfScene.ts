/**
 * Sculpted scenes for the chat: a tree of signed-distance volumes (data only, never code),
 * meshed by marching tetrahedra (`math3d.sdfToMesh`) and handed to the existing three-iso
 * renderer as smooth faces (per-vertex normals from the SDF gradient, soft edges).
 *
 *   { "title": "Head",
 *     "sdf": { "res": 56,
 *              "root": { "op": "smooth_union", "k": 0.12, "color": "skin", "of": [
 *                { "kind": "ellipsoid", "radii": [0.75, 0.85, 1.0], "at": [0, 0, 1.6] },
 *                { "op": "union", "mirror": "x", "of": [ { "kind": "sphere", "r": 0.12, "at": [0.3, -0.7, 1.75], "color": "sclera" } ] } ] } } }
 *
 * Frame of the tree: z up, the subject faces −y; `yaw` (degrees, default 180) turns the whole
 * subject about z: at 180 it faces the « Front » view (eye on +y) and shows three quarters in the
 * default iso view. The mesh is set on the ground (z ≥ 0).
 *
 * Colours are NAMES from a closed palette (the engine's materials and tones, plus organic hues):
 * never a free hex. A volume carved by `subtract` lends its colour to the carved surface.
 */
import { sdfToMesh, smin, type Vec3 } from './math3d'
import { LAMP, MAT, type Face } from '@/vendor/three-iso/iso'
import type { MachineDef } from '@/vendor/three-iso/machine'

/** Organic hues the mechanical palette lacks (faces, creatures, plants). */
export const ORGANIC: Readonly<Record<string, string>> = {
  skin_light: '#f1c9a8',
  skin: '#dda57f',
  skin_tan: '#b97c55',
  skin_deep: '#7c4c33',
  blush: '#d98c7c',
  lip: '#b65f5a',
  sclera: '#f1ede6',
  iris_blue: '#3f6f9f',
  iris_green: '#4e7a4b',
  iris_brown: '#5c3b20',
  pupil: '#141112',
  hair_dark: '#2a211e',
  hair_brown: '#5b3a25',
  hair_blond: '#c8a05f',
  hair_red: '#8e3b1f',
  hair_grey: '#9a958f',
  teeth: '#ece6d6',
  mouth: '#4a1f1f',
  leaf: '#5d8a3f',
  bark: '#6b4a32',
}

const PALETTE: Readonly<Record<string, string>> = { ...(MAT as Record<string, string>), ...(LAMP as Record<string, string>), ...ORGANIC }

export const SDF_LIMITS = { leaves: 96, depth: 8, res: [16, 128] as const, defaultRes: 56, size: [0.005, 6] as const, coord: 12 }

/**
 * Meshing work the chat can afford, in `volumes × res²` units: the surface band evaluates one grid
 * node per unit, so a scene's cost grows with its number of volumes and with res².
 *
 * Measured on a 26-volume bust (frontend/, 2026-10): res 72 -> 253 ms / 20.7k faces, res 96 ->
 * 400 ms / 38k, res 128 -> 676 ms / 67.8k, res 160 -> 1053 ms / 106k. The surface band already
 * divides the grid work by 7.6 at res 128; what is left is the evaluation itself.
 *
 * `res` is therefore capped per scene: 500 000 units is about 800 ms here, the point where a chat
 * frame is still worth the wait. A light scene may reach 128; a 96-volume one stops at 72, as before.
 */
export const SDF_BUDGET = 500_000

/**
 * How mesh time grows with resolution. Measured on a 26-volume bust: res 72 -> 253 ms,
 * 96 -> 400, 128 -> 676; the ratio is res^1.7, not res^2, because the fixed cost of the pass is
 * not negligible at low res. Used to buy the finest mesh a time budget affords.
 */
const COST_EXPONENT = 1.7

/** A mesh that knows the resolution it was actually built at (a budget may lower it). */
export interface BudgetedMesh extends SdfMesh {
  /** Resolution really used: never above what the scene asked for. */
  res: number
}

/**
 * Mesh the finest this scene can be within `budgetMs`.
 *
 * One cheap probe at res 40 measures the scene, `res^COST_EXPONENT` extrapolates what the rest of
 * the budget buys, and a single final pass builds it. Iterative re-meshing (24, 32, 43, 58, …)
 * was measured to waste 60 % of the budget on discarded passes: for 600 ms it reached res 58,
 * where one probe + one pass reaches res 101.
 *
 * `spec.res` stays a ceiling: a budget never buys MORE detail than the author asked for, only less.
 */
export function meshSdfWithinBudget(spec: SdfSpec, budgetMs: number, opts: { cap?: number } = {}): BudgetedMesh {
  const cap = Math.max(SDF_LIMITS.res[0], Math.min(opts.cap ?? spec.res, spec.res, SDF_LIMITS.res[1]))
  const probeRes = Math.min(cap, 40)
  const probe = meshSdf(spec, probeRes)
  if (probeRes >= cap || budgetMs <= probe.ms) return { ...probe, res: probeRes }
  const headroom = Math.max(0, budgetMs - probe.ms) * 0.92
  const perUnit = probe.ms / Math.pow(probeRes, COST_EXPONENT)
  const affordable = Math.floor(Math.pow(headroom / Math.max(1e-9, perUnit), 1 / COST_EXPONENT))
  const target = Math.max(probeRes, Math.min(cap, affordable))
  if (target <= probeRes) return { ...probe, res: probeRes }
  const fine = meshSdf(spec, target)
  return { ...fine, res: target }
}

/** Highest resolution a scene of `leaves` volumes may ask for (see `SDF_BUDGET`). */
export function maxResFor(leaves: number): number {
  const affordable = Math.floor(Math.sqrt(SDF_BUDGET / Math.max(1, leaves)))
  return Math.max(SDF_LIMITS.res[0], Math.min(SDF_LIMITS.res[1], affordable))
}

const LEAF_KINDS = ['sphere', 'ellipsoid', 'capsule', 'box', 'torus', 'cylinder'] as const
const OPS = ['union', 'smooth_union', 'subtract', 'smooth_subtract', 'intersect'] as const
type LeafKind = (typeof LEAF_KINDS)[number]
type OpKind = (typeof OPS)[number]

/** A checked tree, ready to evaluate. */
type Node =
  | { leaf: LeafKind; p: Record<string, unknown>; inv: Mat3 | null; at: Vec3; color: string | undefined; ext: number }
  | { op: OpKind; k: number; of: Node[]; mirror: boolean; color: string | undefined }

type Mat3 = [Vec3, Vec3, Vec3]

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const deg = (v: number) => (v * Math.PI) / 180

function rotMat(r: Vec3): Mat3 {
  // Applied x, then y, then z (the three-iso convention): R = Rz · Ry · Rx.
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(deg(r[0])), Math.sin(deg(r[0])), Math.cos(deg(r[1])), Math.sin(deg(r[1])), Math.cos(deg(r[2])), Math.sin(deg(r[2]))]
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ]
}
const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
]
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])

/* ---------- Validation ---------- */

export interface SdfSpec {
  root: Node
  res: number
  yaw: number
  /** Bounding box of the subject in tree coordinates (before yaw). */
  min: Vec3
  max: Vec3
}

/** Check a sculpted scene's `sdf` field. Never throws: problems list what to correct. */
export function checkSdf(raw: unknown): { ok: true; spec: SdfSpec } | { ok: false; problems: string[] } {
  const out: string[] = []
  if (!isObj(raw)) return { ok: false, problems: ['« sdf » must be an object: { "root": NODE, "res"?, "yaw"? }'] }
  for (const k of Object.keys(raw)) if (!['root', 'res', 'yaw'].includes(k)) out.push(`sdf: unknown field « ${k} » (root, res, yaw)`)
  const res = raw.res === undefined ? SDF_LIMITS.defaultRes : raw.res
  if (typeof res !== 'number' || !Number.isInteger(res) || res < SDF_LIMITS.res[0] || res > SDF_LIMITS.res[1]) out.push(`sdf.res = ${String(res)} (an integer from ${SDF_LIMITS.res[0]} to ${SDF_LIMITS.res[1]})`)
  const resWanted = typeof res === 'number' && Number.isInteger(res) ? res : 0
  const yaw = raw.yaw === undefined ? 180 : raw.yaw
  if (typeof yaw !== 'number' || !Number.isFinite(yaw) || Math.abs(yaw) > 360) out.push(`sdf.yaw = ${String(yaw)} (degrees, −360 to 360)`)

  let leaves = 0
  const lo: Vec3 = [Infinity, Infinity, Infinity]
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  const num = (where: string, k: string, v: unknown, a: number = SDF_LIMITS.size[0], b: number = SDF_LIMITS.size[1]): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < a || v > b) {
      out.push(`${where}: ${k} = ${JSON.stringify(v)} (expected ${a} to ${b})`)
      return a
    }
    return v
  }
  const vec = (where: string, k: string, v: unknown, a = -SDF_LIMITS.coord, b = SDF_LIMITS.coord): Vec3 => {
    if (!Array.isArray(v) || v.length !== 3 || v.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < a || x > b)) {
      out.push(`${where}: ${k} must be [x, y, z] within [${a}, ${b}]`)
      return [0, 0, 0]
    }
    return [v[0], v[1], v[2]] as Vec3
  }
  const colorOf = (where: string, v: unknown): string | undefined => {
    if (v === undefined) return undefined
    if (typeof v !== 'string' || !(v in PALETTE)) {
      out.push(`${where}: color « ${String(v)} » is not in the palette (${Object.keys(PALETTE).join(', ')})`)
      return undefined
    }
    return PALETTE[v]
  }
  const grow = (c: Vec3, e: number, mirrored: boolean) => {
    for (const sx of mirrored ? [1, -1] : [1]) {
      const p: Vec3 = [c[0] * sx, c[1], c[2]]
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i]!, p[i]! - e)
        hi[i] = Math.max(hi[i]!, p[i]! + e)
      }
    }
  }

  const walk = (n: unknown, where: string, depth: number, mirrored: boolean): Node | null => {
    if (!isObj(n)) {
      out.push(`${where}: a node must be an object`)
      return null
    }
    if (depth > SDF_LIMITS.depth) {
      out.push(`${where}: tree too deep (at most ${SDF_LIMITS.depth} levels)`)
      return null
    }
    const color = colorOf(where, n.color)
    if (n.op !== undefined) {
      for (const k of Object.keys(n)) if (!['op', 'k', 'of', 'mirror', 'color', 'name'].includes(k)) out.push(`${where}: unknown field « ${k} » (op, k, of, mirror, color, name)`)
      if (!OPS.includes(n.op as OpKind)) {
        out.push(`${where}: op « ${String(n.op)} » unknown (${OPS.join(', ')})`)
        return null
      }
      const op = n.op as OpKind
      const k = op.startsWith('smooth') ? num(where, 'k', n.k ?? 0.1, 0.001, 2) : 0
      if (n.mirror !== undefined && n.mirror !== 'x') out.push(`${where}: mirror « ${String(n.mirror)} » (only "x": symmetric about the plane x = 0)`)
      if (!Array.isArray(n.of) || n.of.length === 0 || n.of.length > 32) {
        out.push(`${where}: « of » must list 1 to 32 nodes`)
        return null
      }
      const m = n.mirror === 'x'
      const of = n.of.map((c, i) => walk(c, `${where}/${typeof (c as { name?: unknown })?.name === 'string' ? (c as { name: string }).name : i}`, depth + 1, mirrored || m)).filter((c): c is Node => !!c)
      if (of.length === 0) return null
      return { op, k, of, mirror: m, color }
    }
    for (const k of Object.keys(n)) if (!['kind', 'at', 'rot', 'color', 'name', 'r', 'radii', 'a', 'b', 'size', 'round', 'R', 'h'].includes(k)) out.push(`${where}: unknown field « ${k} »`)
    if (!LEAF_KINDS.includes(n.kind as LeafKind)) {
      out.push(`${where}: kind « ${String(n.kind)} » unknown (${LEAF_KINDS.join(', ')}) — or give « op » for a combination`)
      return null
    }
    leaves++
    const kind = n.kind as LeafKind
    const at = n.at === undefined ? ([0, 0, 0] as Vec3) : vec(where, 'at', n.at)
    const inv = n.rot === undefined ? null : transpose(rotMat(vec(where, 'rot', n.rot, -360, 360)))
    const p: Record<string, unknown> = {}
    let ext = 0
    switch (kind) {
      case 'sphere':
        p.r = num(where, 'r', n.r)
        ext = p.r as number
        break
      case 'ellipsoid': {
        const r = vec(where, 'radii', n.radii, SDF_LIMITS.size[0], SDF_LIMITS.size[1])
        p.radii = r
        ext = Math.max(...r)
        break
      }
      case 'capsule': {
        const a = vec(where, 'a', n.a)
        const b = vec(where, 'b', n.b)
        p.a = a
        p.b = b
        p.r = num(where, 'r', n.r)
        ext = Math.max(len(a), len(b)) + (p.r as number)
        break
      }
      case 'box': {
        const s = vec(where, 'size', n.size, SDF_LIMITS.size[0], SDF_LIMITS.size[1])
        p.half = [s[0] / 2, s[1] / 2, s[2] / 2]
        p.round = n.round === undefined ? 0 : num(where, 'round', n.round, 0, 3)
        ext = len(p.half as Vec3)
        break
      }
      case 'torus':
        p.R = num(where, 'R', n.R)
        p.r = num(where, 'r', n.r)
        ext = (p.R as number) + (p.r as number)
        break
      case 'cylinder':
        p.h = num(where, 'h', n.h)
        p.r = num(where, 'r', n.r)
        ext = Math.hypot(p.h as number, p.r as number)
        break
    }
    grow(at, ext, mirrored)
    return { leaf: kind, p, inv, at, color, ext }
  }

  const root = walk(raw.root, 'root', 0, false)
  if (leaves > SDF_LIMITS.leaves) out.push(`${leaves} volumes (at most ${SDF_LIMITS.leaves})`)
  if (resWanted > 0 && resWanted > maxResFor(leaves)) {
    out.push(`sdf.res = ${resWanted} is too much for ${leaves} volumes: the mesh budget allows ${maxResFor(leaves)} (cost grows with volumes × res²)`)
  }
  if (!root && !out.length) out.push('sdf.root: nothing to build')
  if (out.length || !root) return { ok: false, problems: out }
  const pad = 0.08
  return { ok: true, spec: { root, res: res as number, yaw: yaw as number, min: [lo[0] - pad, lo[1] - pad, lo[2] - pad], max: [hi[0] + pad, hi[1] + pad, hi[2] + pad] } }
}

/* ---------- Evaluation ---------- */

/** Distance from a leaf to a point, in the leaf's own frame. Scalars only: no array per call. */
function leafDist(n: Extract<Node, { leaf: LeafKind }>, qx: number, qy: number, qz: number): number {
  const p = n.p
  switch (n.leaf) {
    case 'sphere':
      return Math.hypot(qx, qy, qz) - (p.r as number)
    case 'ellipsoid': {
      // Inigo Quilez's bound: exact on the surface, a good meshing field near it.
      const r = p.radii as Vec3
      const k0 = Math.hypot(qx / r[0], qy / r[1], qz / r[2])
      const k1 = Math.hypot(qx / (r[0] * r[0]), qy / (r[1] * r[1]), qz / (r[2] * r[2]))
      return k1 === 0 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1
    }
    case 'capsule': {
      const a = p.a as Vec3
      const b = p.b as Vec3
      const pax = qx - a[0], pay = qy - a[1], paz = qz - a[2]
      const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2]
      const bb = bax * bax + bay * bay + baz * baz
      const h = bb === 0 ? 0 : Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / bb))
      return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (p.r as number)
    }
    case 'box': {
      const h = p.half as Vec3
      const rr = Math.min(p.round as number, h[0], h[1], h[2])
      const dx = Math.abs(qx) - h[0] + rr
      const dy = Math.abs(qy) - h[1] + rr
      const dz = Math.abs(qz) - h[2] + rr
      return Math.hypot(Math.max(dx, 0), Math.max(dy, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, Math.max(dy, dz)), 0) - rr
    }
    case 'torus': {
      // In the xy plane (axis z), like the three-iso torus.
      const qq = Math.hypot(qx, qy) - (p.R as number)
      return Math.hypot(qq, qz) - (p.r as number)
    }
    case 'cylinder': {
      // Axis z, from z = 0 to z = h (set on its base, like three-iso shapes).
      const dx = Math.hypot(qx, qy) - (p.r as number)
      const hh = (p.h as number) / 2
      const dz = Math.abs(qz - hh) - hh
      return Math.min(Math.max(dx, dz), 0) + Math.hypot(Math.max(dx, 0), Math.max(dz, 0))
    }
  }
}

/** Distance only, without allocation: the meshing hot path (hundreds of thousands of calls). */
function distNode(n: Node, x: number, y: number, z: number): number {
  if ('leaf' in n) {
    let qx = x - n.at[0]
    let qy = y - n.at[1]
    let qz = z - n.at[2]
    if (n.inv) {
      const m = n.inv
      const rx = m[0][0] * qx + m[0][1] * qy + m[0][2] * qz
      const ry = m[1][0] * qx + m[1][1] * qy + m[1][2] * qz
      qz = m[2][0] * qx + m[2][1] * qy + m[2][2] * qz
      qx = rx
      qy = ry
    }
    return leafDist(n, qx, qy, qz)
  }
  const px = n.mirror ? Math.abs(x) : x
  let a = distNode(n.of[0]!, px, y, z)
  for (let i = 1; i < n.of.length; i++) {
    const b = distNode(n.of[i]!, px, y, z)
    switch (n.op) {
      case 'union':
        if (b < a) a = b
        break
      case 'smooth_union':
        a = smin(a, b, n.k)
        break
      case 'subtract':
        if (-b > a) a = -b
        break
      case 'smooth_subtract':
        a = -smin(-a, b, n.k)
        break
      case 'intersect':
        if (b > a) a = b
        break
    }
  }
  return a
}
interface Hit {
  d: number
  color: string | undefined
}

function evalNode(n: Node, pt: Vec3, inherited: string | undefined): Hit {
  if ('leaf' in n) {
    let qx = pt[0] - n.at[0]
    let qy = pt[1] - n.at[1]
    let qz = pt[2] - n.at[2]
    if (n.inv) {
      const m = n.inv
      const rx = m[0][0] * qx + m[0][1] * qy + m[0][2] * qz
      const ry = m[1][0] * qx + m[1][1] * qy + m[1][2] * qz
      qz = m[2][0] * qx + m[2][1] * qy + m[2][2] * qz
      qx = rx
      qy = ry
    }
    return { d: leafDist(n, qx, qy, qz), color: n.color ?? inherited }
  }
  const p: Vec3 = n.mirror ? [Math.abs(pt[0]), pt[1], pt[2]] : pt
  const own = n.color ?? inherited
  let acc = evalNode(n.of[0]!, p, own)
  for (let i = 1; i < n.of.length; i++) {
    const b = evalNode(n.of[i]!, p, own)
    switch (n.op) {
      case 'union':
        if (b.d < acc.d) acc = b
        break
      case 'smooth_union': {
        const d = smin(acc.d, b.d, n.k)
        acc = { d, color: b.d < acc.d ? b.color : acc.color }
        break
      }
      case 'subtract':
        acc = -b.d > acc.d ? { d: -b.d, color: b.color } : acc
        break
      case 'smooth_subtract': {
        // smax(a, −b, k), the carved surface takes the cutter's colour.
        const d = -smin(-acc.d, b.d, n.k)
        acc = { d, color: -b.d > acc.d ? b.color : acc.color }
        break
      }
      case 'intersect':
        acc = b.d > acc.d ? b : acc
        break
    }
  }
  return acc
}

/* ---------- Mesh → faces ---------- */

export interface SdfMesh {
  /** Faces in world coordinates (yaw applied, set on the ground), sorted back to front. */
  faces: Face[]
  triangles: number
  ms: number
}

const DEFAULT_COLOR = MAT.porcelain

/** Mesh the tree at `res` cells along its longest side and turn it into smooth, sorted faces. */
export function meshSdf(spec: SdfSpec, res = spec.res, part = 0): SdfMesh {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const f = (p: Vec3) => distNode(spec.root, p[0], p[1], p[2])
  // A cube around the subject: sdfToMesh grids every axis at the same `res`.
  const c: Vec3 = [(spec.min[0] + spec.max[0]) / 2, (spec.min[1] + spec.max[1]) / 2, (spec.min[2] + spec.max[2]) / 2]
  const half = Math.max(spec.max[0] - spec.min[0], spec.max[1] - spec.min[1], spec.max[2] - spec.min[2]) / 2
  const min: Vec3 = [c[0] - half, c[1] - half, c[2] - half]
  const max: Vec3 = [c[0] + half, c[1] + half, c[2] + half]
  const mesh = sdfToMesh(f, min, max, res)
  const eps = half / res / 2
  const P = mesh.positions
  const nv = P.length / 3
  const normals = new Float32Array(P.length)
  for (let i = 0; i < nv; i++) {
    const x = P[3 * i]!
    const y = P[3 * i + 1]!
    const z = P[3 * i + 2]!
    let gx = f([x + eps, y, z]) - f([x - eps, y, z])
    let gy = f([x, y + eps, z]) - f([x, y - eps, z])
    let gz = f([x, y, z + eps]) - f([x, y, z - eps])
    const l = Math.hypot(gx, gy, gz) || 1
    gx /= l
    gy /= l
    gz /= l
    normals[3 * i] = gx
    normals[3 * i + 1] = gy
    normals[3 * i + 2] = gz
  }
  // World frame: yaw about z, then the lowest point on the ground.
  const cy = Math.cos(deg(spec.yaw))
  const sy = Math.sin(deg(spec.yaw))
  const turn = (x: number, y: number): [number, number] => [cy * x - sy * y, sy * x + cy * y]
  let zMin = Infinity
  for (let i = 0; i < nv; i++) zMin = Math.min(zMin, P[3 * i + 2]!)
  if (!Number.isFinite(zMin)) zMin = 0
  const world = (i: number): Vec3 => {
    const [x, y] = turn(P[3 * i]! - c[0], P[3 * i + 1]! - c[1])
    return [x, y, P[3 * i + 2]! - zMin]
  }
  const nrm = (i: number): Vec3 => {
    const [x, y] = turn(normals[3 * i]!, normals[3 * i + 1]!)
    return [x, y, normals[3 * i + 2]!]
  }
  const I = mesh.indices
  const faces: Face[] = []
  for (let t = 0; t < I.length; t += 3) {
    let a = I[t]!
    let b = I[t + 1]!
    const cc = I[t + 2]!
    const pa = world(a)
    let pb = world(b)
    let pc = world(cc)
    const na = nrm(a)
    let nb = nrm(b)
    let nc = nrm(cc)
    // Orient the triangle outward (marching tetrahedra does not): its normal must agree with the gradient.
    const u: Vec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]
    const v: Vec3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]
    const cr: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    if (cr[0] * (na[0] + nb[0] + nc[0]) + cr[1] * (na[1] + nb[1] + nc[1]) + cr[2] * (na[2] + nb[2] + nc[2]) < 0) {
      ;[pb, pc] = [pc, pb]
      ;[nb, nc] = [nc, nb]
      ;[a, b] = [b, a]
    }
    if (Math.hypot(cr[0], cr[1], cr[2]) < 1e-12) continue
    // Colour of the region at the centroid (tree coordinates).
    const g: Vec3 = [(P[3 * a]! + P[3 * b]! + P[3 * cc]!) / 3, (P[3 * a + 1]! + P[3 * b + 1]! + P[3 * cc + 1]!) / 3, (P[3 * a + 2]! + P[3 * b + 2]! + P[3 * cc + 2]!) / 3]
    const col = evalNode(spec.root, g, undefined).color ?? DEFAULT_COLOR
    faces.push({
      pts: [pa, pb, pc],
      nrm: [na, nb, nc],
      soft: 0b111,
      tone: 0,
      col,
      alpha: 1,
      emit: undefined,
      part,
      key: (pa[0] + pa[1] + pa[2] + pb[0] + pb[1] + pb[2] + pc[0] + pc[1] + pc[2]) / 3,
    })
  }
  faces.sort((x, y) => x.key - y.key)
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  return { faces, triangles: faces.length, ms: t1 - t0 }
}

/**
 * A machine of the three-iso renderer whose faces are the sculpted mesh. `base` is a checked machine
 * (its frame, cycle and registry); its build, hotspots and stations are replaced. The fine mesh feeds
 * the lit renderer (lod 2); a coarser one feeds the SVG fallback (lod 1).
 */
export function sdfMachine(
  base: MachineDef,
  spec: SdfSpec,
  id: string,
  /** Time the chat may spend meshing; the mesh may come out coarser than `spec.res`, never finer. */
  budgetMs?: number,
): { machine: MachineDef; triangles: number; ms: number; res: number } {
  const fine: SdfMesh & { res: number } =
    budgetMs === undefined ? { ...meshSdf(spec), res: spec.res } : meshSdfWithinBudget(spec, budgetMs)
  let coarse: Face[] | null = null
  const machine: MachineDef = {
    id,
    U: base.U,
    origin: base.origin,
    cycle: base.cycle,
    t0: base.t0,
    groups: base.groups,
    parts: base.parts,
    ...(base.focal !== undefined ? { focal: base.focal } : {}),
    build: (_u, lod) => {
      if (lod === 2) return fine.faces
      coarse ??= meshSdf(spec, Math.max(SDF_LIMITS.res[0], Math.round(spec.res / 2))).faces
      return coarse
    },
  }
  return { machine, triangles: fine.triangles, ms: fine.ms, res: fine.res }
}
