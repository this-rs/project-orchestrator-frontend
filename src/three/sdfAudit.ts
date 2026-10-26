/**
 * Sculpt audit for `sdf` scenes: the numbers that say whether a carved volume reads as what it
 * claims to be. Pure (no DOM, no canvas), so it runs in vitest and in CI.
 *
 *   auditAxes   anthropometric proportions, from the landmarks the scene DECLARES by name
 *   nodeAxes    per-node alignment (iris centred on its globe, mouth on the midline, …)
 *   relief      depth + curvature maps and the sagittal profile, as TEXT — the compressed view a
 *               reader without a picture can use (bumps clear, hollows dark, one line per height)
 *   visibility  how many of twelve azimuths really show each feature: a mouth seen from one angle
 *               does not exist
 *
 * Written while sculpting a bust; each instrument caught a defect the previous ones missed — a
 * scene with no lip faces at all, eyes buried behind the skin, a profile whose forehead jutted
 * past the nose. Nothing here judges beauty: it checks proportion and legibility.
 */
import { checkSdf, meshSdf, type SdfMesh, type SdfSpec } from './sdfScene'
import type { Face } from '@/vendor/three-iso/iso'

type V3 = [number, number, number]

/** Names a scene must give to be measurable. Missing ones are reported, never guessed. */
export const LANDMARKS = {
  crown: 'crane',
  chin: 'menton',
  cheek: 'pommette',
  eye: 'globe',
  iris: 'iris',
  lipUp: 'levre sup',
  lipLow: 'levre inf',
  nose: 'bout nez',
  alar: 'aile',
} as const

const EYE_COLOURS = ['#f1ede6', '#5c3b20', '#141112', '#4e7a4b', '#3f6f9f']
const MOUTH_COLOURS = ['#b65f5a', '#4a1f1f']
const HAIR_COLOUR = '#5b3a25'

export interface Axis {
  name: string
  value: number
  min: number
  max: number
  unit: string
  ok: boolean
}

export interface Audit {
  axes: Axis[]
  passed: number
  total: number
  problems: string[]
}

interface Leaf {
  at: V3
  r?: number
  radii?: V3
  rot: V3
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
const unit = (a: V3): V3 => {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** Degrees, applied x then y then z (the three-iso convention): R = Rz · Ry · Rx. */
function rotMat(r: V3): number[][] {
  const d = Math.PI / 180
  const cx = Math.cos(r[0] * d), sx = Math.sin(r[0] * d)
  const cy = Math.cos(r[1] * d), sy = Math.sin(r[1] * d)
  const cz = Math.cos(r[2] * d), sz = Math.sin(r[2] * d)
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ]
}

const apply = (m: number[][], v: V3): V3 => [
  m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2],
  m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2],
  m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2],
]

interface Node {
  name?: unknown
  at?: unknown
  r?: unknown
  radii?: unknown
  rot?: unknown
  of?: unknown
}

const asVec = (v: unknown): V3 | null =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number')
    ? [v[0] as number, v[1] as number, v[2] as number]
    : null

const rootOf = (raw: unknown): unknown =>
  raw && typeof raw === 'object' && 'root' in raw ? (raw as { root: unknown }).root : raw

/** Every named leaf of the tree, by the name the scene gave it. */
export function landmarks(raw: unknown): Map<string, Leaf> {
  const out = new Map<string, Leaf>()
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    const o = n as Node
    const at = asVec(o.at)
    if (typeof o.name === 'string' && at) {
      out.set(o.name, {
        at,
        r: typeof o.r === 'number' ? o.r : undefined,
        radii: asVec(o.radii) ?? undefined,
        rot: asVec(o.rot) ?? [0, 0, 0],
      })
    }
    if (Array.isArray(o.of)) o.of.forEach(walk)
  }
  walk(rootOf(raw))
  return out
}

interface Frame {
  origin: V3
  up: V3
  fwd: V3
  side: V3
}

/** The face frame comes from the skull's own declared rotation, never from a difference of points. */
function faceFrame(lm: Map<string, Leaf>): Frame | null {
  const crown = lm.get(LANDMARKS.crown)
  const eye = lm.get(LANDMARKS.eye)
  const nose = lm.get(LANDMARKS.nose)
  if (!crown || !eye || !nose) return null
  const m = rotMat(crown.rot)
  const up = unit(apply(m, [0, 0, 1]))
  let fwd = unit(apply(m, [0, -1, 0]))
  const origin: V3 = [0, eye.at[1], eye.at[2]]
  if (dot(sub(nose.at, origin), fwd) < 0) fwd = mul(fwd, -1)
  return { origin, up, fwd, side: unit(cross(fwd, up)) }
}

interface Prepared {
  spec: SdfSpec
  mesh: SdfMesh
  frame: Frame
  /** mesh vertex -> the scene's own frame (undo yaw, recentring and grounding) */
  toScene: (p: V3) => V3
  u: (p: V3) => number
  fwd: (p: V3) => number
  side: (p: V3) => number
}

function prepare(raw: unknown): Prepared | { problems: string[] } {
  const checked = checkSdf(raw)
  if (!checked.ok) return { problems: checked.problems }
  const spec = checked.spec
  const mesh = meshSdf(spec)
  const fr = faceFrame(landmarks(raw))
  if (!fr) {
    return { problems: [`missing landmarks: ${Object.values(LANDMARKS).join(', ')} — a scene must name them to be measurable`] }
  }
  const yaw = (spec.yaw * Math.PI) / 180
  const cx = (spec.min[0] + spec.max[0]) / 2
  const cy = (spec.min[1] + spec.max[1]) / 2
  let zMin = Infinity
  for (const f of mesh.faces) for (const p of f.pts) zMin = Math.min(zMin, p[2])
  const toScene = (p: V3): V3 => [
    Math.cos(-yaw) * p[0] - Math.sin(-yaw) * p[1] + cx,
    Math.sin(-yaw) * p[0] + Math.cos(-yaw) * p[1] + cy,
    p[2] + zMin,
  ]
  return {
    spec,
    mesh,
    frame: fr,
    toScene,
    u: (p: V3) => dot(sub(p, fr.origin), fr.up),
    fwd: (p: V3) => dot(sub(p, fr.origin), fr.fwd),
    side: (p: V3) => dot(sub(p, fr.side), [0, 0, 0]) + dot(sub(p, fr.origin), fr.side),
  }
}

const round = (n: number): number => Math.round(n * 1000) / 1000

function axis(name: string, value: number, min: number, max: number, unitSuffix = ''): Axis {
  return { name, value: round(value), min, max, unit: unitSuffix, ok: value >= min && value <= max }
}

/** The ten anthropometric axes, from the declared landmarks and the mesh. */
export function auditAxes(raw: unknown): Audit {
  const p = prepare(raw)
  if ('problems' in p) return { axes: [], passed: 0, total: 0, problems: p.problems }
  const lm = landmarks(raw)
  const { frame: fr, mesh, u, fwd, side } = p
  const crown = lm.get(LANDMARKS.crown)!
  const chinLeaf = lm.get(LANDMARKS.chin)!
  const cheek = lm.get(LANDMARKS.cheek)!
  const eye = lm.get(LANDMARKS.eye)!
  const lipUp = lm.get(LANDMARKS.lipUp)!
  const lipLow = lm.get(LANDMARKS.lipLow)!
  const nose = lm.get(LANDMARKS.nose)!
  const alar = lm.get(LANDMARKS.alar)

  const chin = add(chinLeaf.at, mul(fr.up, -(chinLeaf.r ?? 0)))
  const crownTop = add(crown.at, mul(fr.up, Math.max(...(crown.radii ?? [0, 0, 0]))))
  const height = u(crownTop) - u(chin)
  const bizyg = 2 * (Math.abs(side(cheek.at)) + (cheek.radii?.[0] ?? 0))
  const mouthMid = mul(add(lipUp.at, lipLow.at), 0.5)
  const noseTip = add(nose.at, mul(fr.fwd, nose.r ?? 0))
  const eyeMid: V3 = [0, eye.at[1], eye.at[2]]

  const eyeFaces = mesh.faces.filter((f) => EYE_COLOURS.includes(f.col))
  const rightEye = eyeFaces.filter((f) => side((f.pts[0] ?? [0, 0, 0]) as V3) > 0)
  let lo = Infinity
  let hi = -Infinity
  for (const f of rightEye) for (const q of f.pts) {
    const v = side(q as V3)
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
  }
  const eyeWidth = rightEye.length ? hi - lo : 0
  const gap = 2 * Math.abs(side(eye.at)) - eyeWidth

  // the nose is as wide as its alae, not as its tip (which sits on the midline)
  const noseWidth = alar ? 2 * (Math.abs(side(alar.at)) + (alar.r ?? 0)) : 2 * (Math.abs(nose.at[0]) + (nose.r ?? 0))

  let incoherent = 0
  for (const f of mesh.faces) {
    const [a, b, c] = f.pts as [V3, V3, V3]
    const n = cross(sub(b, a), sub(c, a))
    const nn = f.nrm ?? []
    const avg = unit([
      (nn[0]![0]! + nn[1]![0]! + nn[2]![0]!) / 3,
      (nn[0]![1]! + nn[1]![1]! + nn[2]![1]!) / 3,
      (nn[0]![2]! + nn[1]![2]! + nn[2]![2]!) / 3,
    ])
    if (dot(unit(n), avg) < 0.5) incoherent++
  }

  const axes: Axis[] = [
    axis('eye line / head height', (u(eyeMid) - u(chin)) / height, 0.44, 0.56),
    axis('mouth line (stomion)', (u(mouthMid) - u(chin)) / height, 0.2, 0.32),
    axis('eyes to mouth / height', (u(eyeMid) - u(mouthMid)) / height, 0.2, 0.3),
    axis('nose projection / half bizygomatic', (fwd(noseTip) - fwd(eyeMid)) / Math.max(1e-6, bizyg / 2), 0.3, 0.8),
    axis('symmetry |x| of the nose', Math.abs(side(noseTip)) / bizyg, -1, 0.02),
    axis('bizygomatic width / height', bizyg / height, 0.6, 0.8),
    axis('interocular gap / eye width', eyeWidth > 0 ? gap / eyeWidth : -1, 0.7, 1.3),
    axis('eye width / bizygomatic width', bizyg > 0 ? eyeWidth / bizyg : -1, 0.16, 0.26),
    axis('incoherent normals', (100 * incoherent) / Math.max(1, mesh.faces.length), -1, 1.5, '%'),
    axis('mouth width / nose width', (2 * (lipUp.radii?.[0] ?? 0)) / Math.max(1e-6, noseWidth), 1.1, 1.9),
  ]
  return { axes, passed: axes.filter((a) => a.ok).length, total: axes.length, problems: [] }
}

/** Per-node alignment: the defects a global proportion check cannot see. */
export function nodeAxes(raw: unknown): Audit {
  const p = prepare(raw)
  if ('problems' in p) return { axes: [], passed: 0, total: 0, problems: p.problems }
  const lm = landmarks(raw)
  const { frame: fr, u, fwd } = p
  const need = [LANDMARKS.eye, LANDMARKS.iris, LANDMARKS.lipUp, LANDMARKS.lipLow, LANDMARKS.nose, LANDMARKS.chin]
  const missing = need.filter((n) => !lm.has(n))
  if (missing.length) return { axes: [], passed: 0, total: 0, problems: [`missing landmarks: ${missing.join(', ')}`] }
  const eye = lm.get(LANDMARKS.eye)!
  const iris = lm.get(LANDMARKS.iris)
  const lipUp = lm.get(LANDMARKS.lipUp)!
  const lipLow = lm.get(LANDMARKS.lipLow)!
  const nose = lm.get(LANDMARKS.nose)!

  const axes: Axis[] = []
  if (iris) {
    const d = sub(iris.at, eye.at)
    const drift = Math.hypot(dot(d, fr.side), dot(d, fr.up))
    axes.push(axis('iris centred on its globe (drift)', drift, -1, 0.02))
    axes.push(axis('iris in front of the globe', dot(d, fr.fwd), 0.03, 0.5))
  }
  axes.push(axis('lips on the midline |x|', Math.abs(lipUp.at[0]) + Math.abs(lipLow.at[0]), -1, 1e-6))
  axes.push(axis('upper lip thinner than lower', (lipLow.radii?.[2] ?? 0) - (lipUp.radii?.[2] ?? 0), 0.005, 0.2))
  axes.push(axis('nose tip ahead of the lips', fwd(nose.at) - fwd(lipUp.at), 0.03, 0.4))
  axes.push(axis('nose on the midline |x|', Math.abs(nose.at[0]), -1, 1e-6))
  const eyes = lm.get(LANDMARKS.eye)!
  axes.push(axis('eye above the chin (height)', u(eyes.at) - u(lm.get(LANDMARKS.chin)!.at), 0.5, 1.4))
  return { axes, passed: axes.filter((a) => a.ok).length, total: axes.length, problems: [] }
}

const RAMP = ' .:-=+*#%@'

function toAscii(grid: Float32Array, w: number, h: number, lo: number, hi: number): string {
  let out = ''
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) {
      const v = grid[y * w + x]!
      if (v === -Infinity) {
        row += ' '
        continue
      }
      const t = hi === lo ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
      row += RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.floor(t * RAMP.length)))]
    }
    out += row + '\n'
  }
  return out
}

interface Screen {
  sx: (p: V3) => number
  sy: (p: V3) => number
  sz: (p: V3) => number
}

function screen(center: V3, radius: number, d: V3, w: number, h: number): Screen {
  const fwdDir = mul(d, -1)
  const upRef: V3 = Math.abs(fwdDir[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1]
  const right = unit(cross(upRef, fwdDir))
  const up = unit(cross(fwdDir, right))
  return {
    sx: (p) => (dot(sub(p, center), right) / (2 * radius) + 0.5) * w,
    sy: (p) => (0.5 - dot(sub(p, center), up) / (2 * radius)) * h,
    sz: (p) => dot(sub(p, center), d),
  }
}

/** Front-most depth per pixel (a z-buffer, so the far side never wins over the near side). */
function depthBuffer(faces: Face[], sc: Screen, w: number, h: number): { depth: Float32Array; id: Int32Array } {
  const depth = new Float32Array(w * h).fill(-Infinity)
  const id = new Int32Array(w * h).fill(-1)
  faces.forEach((f, fi) => {
    const p = f.pts as V3[]
    const X = p.map(sc.sx)
    const Y = p.map(sc.sy)
    const Z = p.map(sc.sz)
    const x0 = Math.max(0, Math.floor(Math.min(...X)))
    const x1 = Math.min(w - 1, Math.ceil(Math.max(...X)))
    const y0 = Math.max(0, Math.floor(Math.min(...Y)))
    const y1 = Math.min(h - 1, Math.ceil(Math.max(...Y)))
    if (x1 < x0 || y1 < y0) return
    const area = (X[1]! - X[0]!) * (Y[2]! - Y[0]!) - (X[2]! - X[0]!) * (Y[1]! - Y[0]!)
    if (Math.abs(area) < 1e-9) return
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const w0 = ((X[1]! - px) * (Y[2]! - py) - (X[2]! - px) * (Y[1]! - py)) / area
        const w1 = ((X[2]! - px) * (Y[0]! - py) - (X[0]! - px) * (Y[2]! - py)) / area
        const w2 = 1 - w0 - w1
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
        const z = w0 * Z[0]! + w1 * Z[1]! + w2 * Z[2]!
        const i = y * w + x
        if (z > depth[i]!) {
          depth[i] = z
          id[i] = fi
        }
      }
    }
  })
  return { depth, id }
}

export interface Relief {
  depth: string
  curvature: string
  profile: { z: number; y: number }[]
  profileAscii: string
}

/** A compressed view of the relief: depth and curvature as text, plus the sagittal profile. */
export function relief(raw: unknown, opts: { size?: number; heights?: number } = {}): Relief | { problems: string[] } {
  const p = prepare(raw)
  if ('problems' in p) return { problems: p.problems }
  const { mesh, frame: fr } = p
  const w = opts.size ?? 56
  const h = Math.round(w * 1.2)
  const scene = (q: V3): V3 => p.toScene(q)
  const pts: V3[] = []
  for (const f of mesh.faces) for (const q of f.pts) pts.push(scene(q as V3))
  const uAll = pts.map((q) => dot(q, fr.up))
  const sAll = pts.map((q) => dot(q, fr.side))
  const fAll = pts.map((q) => dot(q, fr.fwd))
  const uLo = Math.min(...uAll)
  const uHi = Math.max(...uAll)
  const sMid = (Math.min(...sAll) + Math.max(...sAll)) / 2
  const fMid = (Math.min(...fAll) + Math.max(...fAll)) / 2
  const radius = (uHi - uLo) / 2
  const center = add(mul(fr.up, uLo + radius), add(mul(fr.side, sMid), mul(fr.fwd, fMid)))
  const sc = screen(center, radius, mul(fr.fwd, -1), w, h)
  const { depth } = depthBuffer(mesh.faces, sc, w, h)
  const flat = depth.filter((v) => v !== -Infinity)
  const lo = Math.min(...flat)
  const hi = Math.max(...flat)
  const curvature = new Float32Array(depth.length)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const c = depth[i]!
      if (c === -Infinity) continue
      const a = depth[i - 1]!
      const b = depth[i + 1]!
      const e = depth[i - w]!
      const g = depth[i + w]!
      if (a === -Infinity || b === -Infinity || e === -Infinity || g === -Infinity) continue
      curvature[i] = Math.abs(4 * c - a - b - e - g)
    }
  }
  const cMax = Math.max(...curvature) || 1

  // sagittal profile by ray casting: one line per height, the most forward y at x = 0
  const heights = opts.heights ?? 18
  const zLo = Math.min(...pts.map((q) => q[2]))
  const zHi = Math.max(...pts.map((q) => q[2]))
  const profile: { z: number; y: number }[] = []
  for (let i = 0; i <= heights; i++) {
    const z = zLo + ((zHi - zLo) * i) / heights
    let best = Infinity
    for (const f of mesh.faces) {
      const tri = f.pts.map((q) => scene(q as V3)) as [V3, V3, V3]
      const t = rayTriangle([0, -5, z], [0, 1, 0], tri)
      if (t !== null && t < best) best = t
    }
    profile.push({ z: round(z), y: best === Infinity ? NaN : round(-5 + best) })
  }
  const yLo = -0.95
  const yHi = 0.55
  let profileAscii = ''
  for (const { z, y } of profile) {
    const col = Number.isNaN(y) ? -1 : Math.max(0, Math.min(w - 1, Math.round(((y - yLo) / (yHi - yLo)) * (w - 1))))
    profileAscii += `${z.toFixed(2)}|${Array.from({ length: w }, (_, x) => (x === col ? '@' : ' ')).join('')}\n`
  }
  return { depth: toAscii(depth, w, h, lo, hi), curvature: toAscii(curvature, w, h, 0, cMax), profile, profileAscii }
}

function rayTriangle(o: V3, d: V3, tri: [V3, V3, V3]): number | null {
  const [a, b, c] = tri
  const e1 = sub(b, a)
  const e2 = sub(c, a)
  const h = cross(d, e2)
  const det = dot(e1, h)
  if (Math.abs(det) < 1e-12) return null
  const s = sub(o, a)
  const u = dot(s, h) / det
  if (u < 0 || u > 1) return null
  const q = cross(s, e1)
  const v = dot(d, q) / det
  if (v < 0 || u + v > 1) return null
  const t = dot(e2, q) / det
  return t > 1e-6 ? t : null
}

export interface Visibility {
  eye: number
  mouth: number
  hair: number
  total: number
  minPixels: number
}

/** How many of twelve azimuths actually show each feature (a feature seen once does not exist). */
export function visibility(raw: unknown, opts: { minPixels?: number } = {}): Visibility | { problems: string[] } {
  const p = prepare(raw)
  if ('problems' in p) return { problems: p.problems }
  const { mesh, spec } = p
  const minPixels = opts.minPixels ?? 12
  const w = 140
  const h = 180
  const center: V3 = [(spec.min[0] + spec.max[0]) / 2, (spec.min[1] + spec.max[1]) / 2, (spec.min[2] + spec.max[2]) / 2]
  const radius = Math.max(spec.max[0] - spec.min[0], spec.max[1] - spec.min[1], spec.max[2] - spec.min[2]) / 2
  let eye = 0
  let mouth = 0
  let hair = 0
  const total = 12
  for (let k = 0; k < total; k++) {
    const az = (k * 30 * Math.PI) / 180
    const el = (12 * Math.PI) / 180
    const d: V3 = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)]
    const { id } = depthBuffer(mesh.faces, screen(center, radius, d, w, h), w, h)
    let e = 0
    let m = 0
    let hh = 0
    for (let i = 0; i < id.length; i++) {
      const fi = id[i]!
      if (fi < 0) continue
      const c = mesh.faces[fi]!.col
      if (EYE_COLOURS.includes(c)) e++
      else if (MOUTH_COLOURS.includes(c)) m++
      else if (c === HAIR_COLOUR) hh++
    }
    if (e > minPixels) eye++
    if (m > minPixels) mouth++
    if (hh > minPixels) hair++
  }
  return { eye, mouth, hair, total, minPixels }
}
