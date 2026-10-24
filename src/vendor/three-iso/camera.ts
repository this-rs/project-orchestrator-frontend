// GENERATED from website@255d188e3498305845e72a27d2569810c72c2e1b:src/three/iso/camera.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Caméra orbitale du rendu WebGL (`litRenderer.ts`) : une matrice vue-projection au lieu de la projection isométrique
 * codée en dur dans les shaders.
 *
 * - État : cible (point monde regardé, `null` = centre de la scène), lacet `yaw` et tangage `pitch` de l'œil autour de
 *   la cible, `zoom` (échelle relative au cadrage ajusté, 1 = cadrage du SVG prérendu), mode `ortho` | `persp` et champ
 *   `fov` (perspective). La « distance » de l'œil n'est pas un réglage à part : en orthographique elle ne change rien,
 *   en perspective elle se déduit du zoom et du champ (le zoom rapproche l'œil, la taille au plan de la cible est gardée).
 * - Cadrage : l'image reste dans la fenêtre du viewBox de `fit.ts` (`fitWindow(contentBox(m))`) ; la cible tombe au
 *   point du viewBox où la projection isométrique classique la met (`anchor`). Avec la caméra par défaut (iso, ortho,
 *   zoom 1), la matrice redonne EXACTEMENT l'ancienne projection `toView` (tests : scripts/tests/iso-camera.test.mjs).
 * - Repère : z vers le haut ; l'œil iso est en (1, 1, 1). La projection isométrique du moteur est une image miroir
 *   (x vers le bas-droite, y vers le bas-gauche) : la droite de l'écran est `œil × z`, le haut `droite × œil`.
 * - `focal` (MachineDef, ancienne perspective « 1/(1 + s·focal) ») : la caméra par défaut d'une machine qui le déclare
 *   passe en perspective vraie ; `focal` (0 à 0,25) règle le champ (`fovForFocal`), jamais la distance de l'œil, qui
 *   se déduit du champ pour garder la taille de l'orthographique au plan de la cible.
 *
 * Module PUR (imports relatifs seulement) : lu par Node dans les tests.
 */
import { withHiddenFaces, type Vec3 } from './iso.ts'
import { toView } from './compose.ts'
import type { Box } from './fit.ts'
import type { MachineDef } from './machine.ts'

export type CameraMode = 'ortho' | 'persp'

export interface CameraState {
  /** Point regardé (monde) ; `null` : le centre de la scène. */
  target: Vec3 | null
  /** Azimut de l'œil autour de z (radians) : 0 = depuis +x, π/2 = depuis +y. */
  yaw: number
  /** Hauteur de l'œil (radians) : 0 = à l'horizontale, π/2 = à la verticale (vue de dessus). */
  pitch: number
  /** Échelle relative au cadrage ajusté (1 = la machine entière, comme le SVG). */
  zoom: number
  mode: CameraMode
  /** Champ vertical (radians) en perspective. */
  fov: number
}

/** La vue isométrique classique : œil sur la diagonale (1, 1, 1). */
export const ISO_YAW = Math.PI / 4
export const ISO_PITCH = Math.asin(1 / Math.sqrt(3))
/** Échelle de la projection isométrique du moteur (`proj`) par rapport à une projection orthographique unitaire. */
export const ISO_SCALE = Math.sqrt(1.5)
export const PITCH_MIN = 0.02
export const PITCH_MAX = Math.PI / 2
export const ZOOM_MIN = 0.3
export const ZOOM_MAX = 8
export const DEFAULT_FOV = (35 * Math.PI) / 180
/** Échelle d'une vue en perspective qui cadre la scène : le proche y est plus grand que l'orthographique au plan de la
 * cible, la vue d'ensemble prend donc un peu moins de place pour rester dans le cadre. */
export const PERSP_FIT = 0.78

export const DEFAULT_CAMERA: CameraState = { target: null, yaw: ISO_YAW, pitch: ISO_PITCH, zoom: 1, mode: 'ortho', fov: DEFAULT_FOV }

export type ViewPreset = 'iso' | 'top' | 'front' | 'side'
/** Vues prédéfinies (orientation seule : cible, zoom et mode sont choisis par l'appelant). Dessus : x vers la droite,
 * comme la vue de face qu'elle prolonge. */
export const PRESETS: Record<ViewPreset, { yaw: number; pitch: number }> = {
  iso: { yaw: ISO_YAW, pitch: ISO_PITCH },
  top: { yaw: Math.PI / 2, pitch: PITCH_MAX },
  front: { yaw: Math.PI / 2, pitch: 0 },
  side: { yaw: 0, pitch: 0 },
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const clampPitch = (p: number) => clamp(p, PITCH_MIN, PITCH_MAX)
export const clampZoom = (z: number) => clamp(z, ZOOM_MIN, ZOOM_MAX)

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Repère de la caméra : `right` et `up` (écran), `eye` (unitaire, de la cible VERS l'œil). */
export function basis(yaw: number, pitch: number): { right: Vec3; up: Vec3; eye: Vec3 } {
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const eye: Vec3 = [cp * cy, cp * sy, sp]
  // œil × z, normalisé : ne dépend que du lacet (pas de dégénérescence en vue de dessus).
  const right: Vec3 = [sy, -cy, 0]
  const up: Vec3 = [right[1] * eye[2] - right[2] * eye[1], right[2] * eye[0] - right[0] * eye[2], right[0] * eye[1] - right[1] * eye[0]]
  return { right, up, eye }
}

/** Ce dont la caméra a besoin du cadre : fenêtre du viewBox montrée, point de la cible dans le viewBox, échelle. */
export interface Frame {
  win: Box
  /** Point du viewBox où tombe la cible (la projection isométrique classique du centre de la scène). */
  anchor: readonly [number, number]
  /** Pixels du viewBox par unité monde dans le plan de l'écran, zoom 1 (= U·√1,5). */
  s0: number
  /** Profondeurs extrêmes de la scène (le long de `eye`, relatives à la cible ; sol compris). */
  depth: readonly [number, number]
}

/** Distance de l'œil à la cible en perspective : la taille au plan de la cible est celle de l'orthographique. */
export function eyeDistance(c: CameraState, f: Pick<Frame, 'win' | 's0'>): number {
  return f.win.h / (2 * f.s0 * c.zoom * Math.tan(c.fov / 2))
}

/**
 * Champ vertical d'une machine qui déclare `focal` (0 à 0,25, la force du raccourcissement en profondeur).
 * Le champ est la seule grandeur : l'œil se place ensuite à `eyeDistance` pour garder la taille de l'orthographique au
 * plan de la cible. (L'ancienne version posait l'œil à 1/(√3·focal) unités de la cible, soit 4,8 unités pour
 * focal = 0,12 : l'œil tombait DANS une scène de 30 unités de demi-largeur, champ de 157°, tout se tordait.)
 */
export function fovForFocal(focal: number): number {
  return (clamp(focal * 300, 14, 50) * Math.PI) / 180
}

/** Matrice vue-projection (colonnes, convention WebGL) : clip = M · (x, y, z, 1). */
export function viewProj(c: CameraState, T: Vec3, f: Frame): Float32Array {
  const { right, up, eye } = basis(c.yaw, c.pitch)
  const s = f.s0 * c.zoom
  const kx = (2 * s) / f.win.w
  const ky = (2 * s) / f.win.h
  const ax = ((f.anchor[0] - f.win.x) / f.win.w) * 2 - 1
  const ay = 1 - ((f.anchor[1] - f.win.y) / f.win.h) * 2
  const [c0, c1] = f.depth
  // Chaque ligne du clip est α·a + β·b + γ·c + δ, avec (a, b, c) = (droite, haut, œil)·(p − T).
  let wRow: [number, number, number, number] // [α, β, γ, δ]
  let zRow: [number, number, number, number]
  if (c.mode === 'persp') {
    const dist = eyeDistance(c, f)
    // w = e/dist, e = dist − c la distance à l'œil (le plan de la cible garde l'échelle orthographique).
    wRow = [0, 0, -1 / dist, 1]
    const near = Math.max((dist - c1) * 0.9, dist * 0.02, 1e-3)
    const far = Math.max((dist - c0) * 1.1 + 0.1, near * 2)
    const P = (far + near) / (far - near)
    const Q = (2 * far * near) / (far - near)
    zRow = [0, 0, -P / dist, (P * dist - Q) / dist]
  } else {
    wRow = [0, 0, 0, 1]
    const mid = (c0 + c1) / 2
    const half = Math.max((c1 - c0) / 2 + 0.5, 1e-3)
    // Plus près de l'œil (c plus grand) = plus petit z : LEQUAL garde le plus proche.
    zRow = [0, 0, -0.98 / half, (0.98 * mid) / half]
  }
  const xRow: [number, number, number, number] = [kx + ax * wRow[0], ax * wRow[1], ax * wRow[2], ax * wRow[3]]
  const yRow: [number, number, number, number] = [ay * wRow[0], ky + ay * wRow[1], ay * wRow[2], ay * wRow[3]]
  const out = new Float32Array(16)
  const rows = [xRow, yRow, zRow, wRow]
  for (let r = 0; r < 4; r++) {
    const [α, β, γ, δ] = rows[r]!
    const v: Vec3 = [α * right[0] + β * up[0] + γ * eye[0], α * right[1] + β * up[1] + γ * eye[1], α * right[2] + β * up[2] + γ * eye[2]]
    out[r] = v[0]
    out[4 + r] = v[1]
    out[8 + r] = v[2]
    out[12 + r] = δ - dot(v, T)
  }
  return out
}

/** Point monde → clip (x, y, z, w). */
export function toClip(M: Float32Array, p: Vec3): [number, number, number, number] {
  const o: [number, number, number, number] = [0, 0, 0, 0]
  for (let r = 0; r < 4; r++) o[r] = M[r]! * p[0] + M[4 + r]! * p[1] + M[8 + r]! * p[2] + M[12 + r]!
  return o
}

/** Point monde → pixels du cadre `w` × `h` (et `w` du clip : < 0 = derrière l'œil). */
export function toScreen(M: Float32Array, p: Vec3, w: number, h: number): { x: number; y: number; w: number } {
  const c = toClip(M, p)
  return { x: ((c[0] / c[3] + 1) / 2) * w, y: ((1 - c[1] / c[3]) / 2) * h, w: c[3] }
}

/** Boîte 3D de la machine à t0 (faces visibles), et son centre : la cible par défaut. */
const bounds = new WeakMap<MachineDef, { lo: Vec3; hi: Vec3; center: Vec3 }>()
export function sceneBounds(m: MachineDef): { lo: Vec3; hi: Vec3; center: Vec3 } {
  const hit = bounds.get(m)
  if (hit) return hit
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const f of withHiddenFaces(() => m.build(m.t0, 2))) {
    if (f.alpha < 0.05) continue
    for (const p of f.pts)
      for (let j = 0; j < 3; j++) {
        if (p[j]! < lo[j]!) lo[j] = p[j]!
        if (p[j]! > hi[j]!) hi[j] = p[j]!
      }
  }
  if (!Number.isFinite(lo[0]!)) for (let j = 0; j < 3; j++) lo[j] = hi[j] = 0
  const b = { lo: lo as unknown as Vec3, hi: hi as unknown as Vec3, center: [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2] as Vec3 }
  bounds.set(m, b)
  return b
}

/** Le point du viewBox où la projection isométrique classique met la cible par défaut (le centre de la scène). */
export function anchorOf(m: MachineDef): readonly [number, number] {
  return toView(m, sceneBounds(m).center)
}

/** Zoom qui garde la scène entière dans la vue (yaw, pitch), relatif au cadrage isométrique (la boîte 3D projetée). */
export function fitZoom(m: MachineDef, yaw: number, pitch: number): number {
  const { lo, hi, center } = sceneBounds(m)
  const ext = (y: number, p: number) => {
    const { right, up } = basis(y, p)
    let a = 0
    let b = 0
    for (let i = 0; i < 8; i++) {
      const q: Vec3 = [(i & 1 ? hi[0] : lo[0]) - center[0], (i & 2 ? hi[1] : lo[1]) - center[1], (i & 4 ? hi[2] : lo[2]) - center[2]]
      a = Math.max(a, Math.abs(dot(right, q)))
      b = Math.max(b, Math.abs(dot(up, q)))
    }
    return [Math.max(a, 1e-3), Math.max(b, 1e-3)] as const
  }
  const [ia, ib] = ext(ISO_YAW, ISO_PITCH)
  const [pa, pb] = ext(yaw, pitch)
  return clampZoom(Math.min(ia / pa, ib / pb))
}

/** Une vue prédéfinie, cadrée sur la scène (cible au centre, zoom ajusté), dans le mode donné. */
export function presetCamera(m: MachineDef, preset: ViewPreset, from: CameraState): CameraState {
  const { yaw, pitch } = PRESETS[preset]
  const fit = from.mode === 'persp' ? PERSP_FIT : 1
  return { ...from, target: null, yaw, pitch, zoom: clampZoom((preset === 'iso' ? 1 : fitZoom(m, yaw, pitch)) * fit) }
}

/* ---------- Gestes ---------- */

/** Tourner autour de la cible (radians), tangage borné : jamais sous le sol. */
export function orbit(c: CameraState, dYaw: number, dPitch: number): CameraState {
  return { ...c, yaw: c.yaw + dYaw, pitch: clampPitch(c.pitch + dPitch) }
}

/** Échelle (unités du clip par unité monde) de chaque axe de l'écran, et le point de la cible dans le clip. */
function screenScale(c: CameraState, f: Frame) {
  const s = f.s0 * c.zoom
  return {
    kx: (2 * s) / f.win.w,
    ky: (2 * s) / f.win.h,
    ax: ((f.anchor[0] - f.win.x) / f.win.w) * 2 - 1,
    ay: 1 - ((f.anchor[1] - f.win.y) / f.win.h) * 2,
  }
}

/** Glisser la scène de (`dx`, `dy`) en coordonnées normalisées du clip (−1…1) : la cible se déplace dans le plan de l'écran. */
export function pan(c: CameraState, T: Vec3, f: Frame, dx: number, dy: number): CameraState {
  const { right, up } = basis(c.yaw, c.pitch)
  const { kx, ky } = screenScale(c, f)
  const a = -dx / kx
  const b = -dy / ky
  return { ...c, target: [T[0] + right[0] * a + up[0] * b, T[1] + right[1] * a + up[1] * b, T[2] + right[2] * a + up[2] * b] }
}

/** Zoomer de `factor` vers le point (`nx`, `ny`) du clip : le point du plan de la cible sous le curseur ne bouge pas. */
export function zoomAt(c: CameraState, T: Vec3, f: Frame, factor: number, nx: number, ny: number): CameraState {
  const zoom = clampZoom(c.zoom * factor)
  const k = zoom / c.zoom
  if (k === 1) return c
  const { right, up } = basis(c.yaw, c.pitch)
  const { kx, ky, ax, ay } = screenScale(c, f)
  const a = (nx - ax) / kx
  const b = (ny - ay) / ky
  const g = 1 - 1 / k
  return { ...c, zoom, target: [T[0] + (right[0] * a + up[0] * b) * g, T[1] + (right[1] * a + up[1] * b) * g, T[2] + (right[2] * a + up[2] * b) * g] }
}

/** Interpolation entre deux caméras (u ∈ [0, 1], déjà adouci) : lacet par le plus court chemin, zoom géométrique. */
export function mixCamera(a: CameraState, b: CameraState, Ta: Vec3, Tb: Vec3, u: number): CameraState {
  let dy = (b.yaw - a.yaw) % (2 * Math.PI)
  if (dy > Math.PI) dy -= 2 * Math.PI
  if (dy < -Math.PI) dy += 2 * Math.PI
  const l = (x: number, y: number) => x + (y - x) * u
  // Orthographique ↔ perspective : une perspective dont le champ s'ouvre depuis presque rien (l'orthographique en est
  // la limite), sans saut ; la taille au plan de la cible ne change pas.
  const fa = a.mode === b.mode ? a.fov : a.mode === 'ortho' ? FOV_EPS : a.fov
  const fb = a.mode === b.mode ? b.fov : b.mode === 'ortho' ? FOV_EPS : b.fov
  return {
    target: [l(Ta[0], Tb[0]), l(Ta[1], Tb[1]), l(Ta[2], Tb[2])],
    yaw: a.yaw + dy * u,
    pitch: l(a.pitch, b.pitch),
    zoom: Math.exp(l(Math.log(a.zoom), Math.log(b.zoom))),
    mode: a.mode === b.mode ? a.mode : 'persp',
    fov: l(fa, fb),
  }
}
const FOV_EPS = (2 * Math.PI) / 180
