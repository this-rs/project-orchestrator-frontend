// GENERATED from website@426fd63fe793882ef8490df5cff1b9a4f75b2520:src/three/iso/iso.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Moteur isométrique des machines de héros : des solides pleins (lofts, boîtes, cylindres, poutres, tubes) rendus en
 * faces polygonales à QUATRE TONS (lo / mid / hi / lit) et triées du fond vers l'avant (ordre du peintre).
 *
 * Projection isométrique vraie (30°) : x vers le bas-droite, y vers le bas-gauche, z vers le haut. Une face est
 * dessinée si sa normale regarde l'œil (1, 1, 1) ; son ton est quantifié d'après la lumière haut-gauche-avant.
 * Tri : clé = somme x+y+z MINIMALE des sommets pour une face horizontale (son coin le plus lointain), sinon
 * min + 0,3 × (moyenne − min). Une grande face horizontale triée par sa moyenne cacherait ce qui est posé dessus ;
 * les grandes pièces sont de toute façon découpées (tubes et poutres en segments ≤ 3 unités).
 *
 * Module PUR, sans import : lu directement par Node 24 dans les tests (scripts/tests), sans alias `@/`.
 */

export type Vec3 = readonly [number, number, number]
export type Vec2 = readonly [number, number]
export type Mat3 = readonly [Vec3, Vec3, Vec3]

/** Ton quantifié d'une face : 0 lo, 1 mid, 2 hi, 3 lit. */
export type Tone = 0 | 1 | 2 | 3

export interface Face {
  /** Sommets en coordonnées monde (après rotation et position). */
  pts: Vec3[]
  tone: Tone
  /** Couleur de base (hex) ; la teinte dessinée est `shade(col, tone)`. */
  col: string
  alpha: number
  /** Couleur émissive : dessinée telle quelle, sans ombrage (lampes, verre allumé). */
  emit: string | undefined
  /** Index de la pièce dans le registre de la machine. */
  part: number
  /** Clé de tri (croissante = du fond vers l'avant). */
  key: number
  /** Normales par sommet (surfaces lisses : flancs de cylindres et de tubes) ; absentes = face plane. */
  nrm?: Vec3[]
  /** Arêtes « douces » (bit k : arête pts[k] → pts[k+1]) : jonctions d'une surface lisse, sans liseré au rendu éclairé. */
  soft?: number
  /** Dessinée en FIL DE FER (le plan, avant la matière), avec cette opacité ; `col` est la couleur du trait. */
  wire?: number
}

export interface FaceOpts {
  part: number
  col: string
  alpha?: number
  emit?: string | undefined
  rot?: Mat3
  pos?: Vec3
  off?: Vec3
  /** Décalage de la clé de tri (rare : forcer une pièce devant/derrière). */
  bias?: number
  /** Interne : un segment d'une pièce longue déjà découpée. */
  whole?: boolean
}

export const C30 = Math.cos(Math.PI / 6)
export const S30 = 0.5

/** Projection isométrique : monde → plan (unités, sans échelle ni origine). */
export const proj = (p: Vec3): Vec2 => [(p[0] - p[1]) * C30, (p[0] + p[1]) * S30 - p[2]]

/** Facteur de perspective (0 = isométrique) : raccourcit selon la profondeur isométrique s = x + y + z. */
export const persp = (p: Vec3, focal: number): number => 1 / (1 + (p[0] + p[1] + p[2]) * focal)

/** Inverse : un point du plan (unités) et une hauteur z → le point du sol correspondant. */
export const unproj = (x: number, y: number, z = 0): Vec3 => {
  const d = x / C30
  const s = (y + z) / S30
  return [(s + d) / 2, (s - d) / 2, z]
}

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
const VIEW = norm([1, 1, 1])
/** Direction VERS la lumière principale (haut, gauche, avant de l'écran) : partagée par le SVG et le rendu WebGL. */
export const LIGHT = norm([0.3, 0.75, 1.0])

/** Faces cachées gardées (rendu WebGL : profondeur et ombres portées ont besoin des solides entiers). */
let keepHidden = false
/** Construit avec toutes les faces, y compris celles qui ne regardent pas l'œil (le tampon de profondeur trie). */
export function withHiddenFaces<T>(fn: () => T): T {
  keepHidden = true
  try {
    return fn()
  } finally {
    keepHidden = false
  }
}

export const I3: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

function mat(rx: number, ry: number, rz: number): Mat3 {
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ]
}
export const Rx = (a: number): Mat3 => mat(a, 0, 0)
export const Ry = (a: number): Mat3 => mat(0, a, 0)
export const Rz = (a: number): Mat3 => mat(0, 0, a)

export function mmul(a: Mat3, b: Mat3): Mat3 {
  const r = (i: number, j: number) => a[i]![0] * b[0][j]! + a[i]![1] * b[1][j]! + a[i]![2] * b[2][j]!
  return [
    [r(0, 0), r(0, 1), r(0, 2)],
    [r(1, 0), r(1, 1), r(1, 2)],
    [r(2, 0), r(2, 1), r(2, 2)],
  ]
}

/** Applique `m` à `p` puis translate de `o`. */
export function xf(m: Mat3, p: Vec3, o: Vec3): Vec3 {
  return [
    m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2] + o[0],
    m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2] + o[1],
    m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2] + o[2],
  ]
}

/** Rectangle centré w × d dans le plan local. */
export const rect = (w: number, d: number): Vec2[] => [
  [-w / 2, -d / 2],
  [w / 2, -d / 2],
  [w / 2, d / 2],
  [-w / 2, d / 2],
]
/** Polygone régulier à n côtés, rayon r, phase ph. */
export const ngon = (r: number, n: number, ph = 0): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ph + (i * 2 * Math.PI) / n
    return [r * Math.cos(a), r * Math.sin(a)] as const
  })
/** Secteur d'anneau entre les rayons r0 < r1 et les angles a0 → a1 (radians), `n` points par arc. */
export function annulus(r0: number, r1: number, a0: number, a1: number, n = 4): Vec2[] {
  const outer: Vec2[] = []
  const inner: Vec2[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    outer.push([r1 * Math.cos(a), r1 * Math.sin(a)])
    inner.push([r0 * Math.cos(a), r0 * Math.sin(a)])
  }
  return [...outer, ...inner.reverse()]
}

export const lerp = (a: number, b: number, u: number) => a + (b - a) * u
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** Ease in-out quadratique sur [0, 1]. */
export const ease = (u: number) => {
  const v = clamp01(u)
  return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2
}
/** Fraction de `t` dans [a, b], bornée. */
export const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))

/* ---------- Teintes : une couleur de base → quatre tons ---------- */

const toneCache = new Map<string, string>()

function hexHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  let h = 0
  let s = 0
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  return [h * 360, s, l]
}

/** Teinte CSS d'une face : lo = L×0,5 ; mid = L×0,74 ; hi = L ; lit = L + (1−L)×0,38 (saturation ×0,85). */
export function shade(hex: string, tone: Tone): string {
  const k = hex + tone
  const hit = toneCache.get(k)
  if (hit) return hit
  const [h, s, l] = hexHsl(hex)
  const L = tone === 0 ? l * 0.5 : tone === 1 ? l * 0.74 : tone === 2 ? l : l + (1 - l) * 0.38
  const S = tone === 3 ? s * 0.85 : s
  const v = `hsl(${h.toFixed(1)} ${(S * 100).toFixed(1)}% ${(L * 100).toFixed(1)}%)`
  toneCache.set(k, v)
  return v
}

/* ---------- Scène : accumulation de faces ---------- */

export class Scene {
  readonly faces: Face[] = []

  /** Ajoute une face (sommets dans l'ordre direct vu de l'extérieur) si elle regarde l'œil. */
  face(pts: Vec3[], o: FaceOpts, nrm?: Vec3[], soft?: number): void {
    let nx = 0
    let ny = 0
    let nz = 0
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!
      const b = pts[(i + 1) % pts.length]!
      nx += (a[1] - b[1]) * (a[2] + b[2])
      ny += (a[2] - b[2]) * (a[0] + b[0])
      nz += (a[0] - b[0]) * (a[1] + b[1])
    }
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    if (!keepHidden && nx * VIEW[0] + ny * VIEW[1] + nz * VIEW[2] <= 0.015) return
    const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
    const tone: Tone = d > 0.9 ? 3 : d > 0.62 ? 2 : d > 0.3 ? 1 : 0
    let mean = 0
    let mn = Infinity
    for (const p of pts) {
      const k = p[0] + p[1] + p[2]
      mean += k
      if (k < mn) mn = k
    }
    mean /= pts.length
    const key = (Math.abs(nz) > 0.9 ? mn : mn + (mean - mn) * 0.3) + (o.bias ?? 0)
    const f: Face = { pts, tone, col: o.col, alpha: o.alpha ?? 1, emit: o.emit, part: o.part, key }
    if (nrm) f.nrm = nrm
    if (soft) f.soft = soft
    this.faces.push(f)
  }

  /** Loft : polygone `bot` à z=0 vers polygone `top` à z=h (même nombre de points), repère local, puis `rot` + `pos`. */
  loft(bot: Vec2[], top: Vec2[], h: number, o: FaceOpts): void {
    const m = o.rot ?? I3
    const pos = o.pos ?? [0, 0, 0]
    const off = o.off ?? [0, 0, 0]
    const B = bot.map((p) => xf(m, [p[0] + off[0], p[1] + off[1], off[2]], pos))
    const T = top.map((p) => xf(m, [p[0] + off[0], p[1] + off[1], h + off[2]], pos))
    this.face(T, o)
    this.face([...B].reverse(), o)
    // Un profil rond (≥ 8 côtés) a des flancs lisses : normales radiales par sommet, jonctions sans liseré.
    let round = bot.length >= 8
    if (round) {
      // Rond = tous les sommets à la même distance du centre (une étoile ou une roue dentée ne l'est pas).
      let r0 = Infinity
      let r1 = 0
      for (const p of bot) {
        const r = Math.hypot(p[0], p[1])
        if (r < r0) r0 = r
        if (r > r1) r1 = r
      }
      round = r1 > 0 && (r1 - r0) / r1 < 0.03
    }
    // Normale d'un flanc rond : radiale, inclinée selon la pente du profil (cône, biseau).
    const rad = round
      ? bot.map((p, i) => {
          const rb = Math.hypot(p[0], p[1]) || 1
          const rt = Math.hypot(top[i]![0], top[i]![1])
          return norm(xf(m, [p[0] / rb, p[1] / rb, h !== 0 ? (rb - rt) / Math.abs(h) : 0], [0, 0, 0]))
        })
      : undefined
    for (let i = 0; i < B.length; i++) {
      const j = (i + 1) % B.length
      if (rad) this.face([B[i]!, B[j]!, T[j]!, T[i]!], o, [rad[i]!, rad[j]!, rad[j]!, rad[i]!], 0b1010)
      else this.face([B[i]!, B[j]!, T[j]!, T[i]!], o)
    }
  }

  /** Boîte dont le coin (x, y, z) est le plus petit, dimensions w × d × h. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, o: FaceOpts): void {
    this.loft(rect(w, d), rect(w, d), h, { ...o, pos: [x + w / 2, y + d / 2, z] })
  }

  /** Cylindre vertical de base (x, y, z), rayon r, hauteur h. */
  cyl(x: number, y: number, z: number, r: number, h: number, o: FaceOpts, n = 14): void {
    this.loft(ngon(r, n), ngon(r, n), h, { ...o, pos: [x, y, z] })
  }

  /** Cylindre d'axe x ou y partant de `p0`, longueur `len`. */
  cylAxis(p0: Vec3, axis: 'x' | 'y', r: number, len: number, o: FaceOpts, n = 14): void {
    const base = axis === 'x' ? Ry(Math.PI / 2) : Rx(-Math.PI / 2)
    const rot = o.rot ? mmul(o.rot, base) : base
    this.loft(ngon(r, n), ngon(r, n), len, { ...o, pos: p0, rot })
  }

  /** Poutre rectangulaire de P1 à P2 (largeur w, épaisseur h), découpée en segments ≤ 3 unités. */
  beam(P1: Vec3, P2: Vec3, w: number, h: number, o: FaceOpts): void {
    const dx = P2[0] - P1[0]
    const dy = P2[1] - P1[1]
    const dz = P2[2] - P1[2]
    const len = Math.hypot(dx, dy, dz)
    if (len > 3.2 && !o.whole) {
      const k = Math.ceil(len / 3)
      for (let i = 0; i < k; i++) this.beam(mix(P1, P2, i / k), mix(P1, P2, (i + 1) / k), w, h, { ...o, whole: true })
      return
    }
    const rot = mmul(Rz(Math.atan2(dy, dx)), Ry(-Math.asin(dz / len)))
    this.loft(rect(len, w), rect(len, w), h, { ...o, pos: mix(P1, P2, 0.5), rot, off: [0, 0, -h / 2] })
  }

  /** Tube cylindrique de P1 à P2, découpé en segments ≤ 3 unités. */
  tube(P1: Vec3, P2: Vec3, r: number, o: FaceOpts, n = 10): void {
    const dx = P2[0] - P1[0]
    const dy = P2[1] - P1[1]
    const dz = P2[2] - P1[2]
    const len = Math.hypot(dx, dy, dz)
    if (len > 3.2 && !o.whole) {
      const k = Math.ceil(len / 3)
      for (let i = 0; i < k; i++) this.tube(mix(P1, P2, i / k), mix(P1, P2, (i + 1) / k), r, { ...o, whole: true }, n)
      return
    }
    const rot = mmul(mmul(Rz(Math.atan2(dy, dx)), Ry(-Math.asin(dz / len))), Ry(Math.PI / 2))
    this.loft(ngon(r, n), ngon(r, n), len, { ...o, pos: P1, rot })
  }

  /** Sphère de centre c, rayon r (normales lisses par sommet ; `seg` méridiens, `rings` parallèles). */
  sphere(c: Vec3, r: number, o: FaceOpts, seg = 14, rings = 8): void {
    const P = (i: number, j: number): Vec3 => {
      const th = (Math.PI * j) / rings - Math.PI / 2
      const ph = (2 * Math.PI * i) / seg
      return [Math.cos(th) * Math.cos(ph), Math.cos(th) * Math.sin(ph), Math.sin(th)]
    }
    const at = (n: Vec3): Vec3 => [c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r]
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = P(i, j)
        const b = P(i + 1, j)
        const d = P(i + 1, j + 1)
        const e = P(i, j + 1)
        if (j === 0) this.face([at(a), at(d), at(e)], o, [a, d, e], 0b111)
        else if (j === rings - 1) this.face([at(a), at(b), at(e)], o, [a, b, e], 0b111)
        else this.face([at(a), at(b), at(d), at(e)], o, [a, b, d, e], 0b1111)
      }
    }
  }

  /** Surface de révolution : profil [r, z] (r ≥ 0) tourné autour de l'axe z, `n` méridiens, normales lissées. */
  lathe(profile: Vec2[], n: number, o: FaceOpts): void {
    const m = profile.length
    if (m < 2 || n < 3) return
    const P = (i: number, j: number): Vec3 => {
      const th = (2 * Math.PI * i) / n
      return [profile[j]![0]! * Math.cos(th), profile[j]![0]! * Math.sin(th), profile[j]![1]!]
    }
    const N = (i: number, j: number): Vec3 => {
      const th = (2 * Math.PI * i) / n
      const j0 = Math.max(0, j - 1)
      const j1 = Math.min(m - 1, j + 1)
      const dr = profile[j1]![0]! - profile[j0]![0]!
      const dz = profile[j1]![1]! - profile[j0]![1]!
      return norm([dz * Math.cos(th), dz * Math.sin(th), -dr])
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m - 1; j++) {
        this.face([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], o, [N(i, j), N(i + 1, j), N(i + 1, j + 1), N(i, j + 1)], 0b1111)
      }
    }
    // Calottes si le profil s'appuie sur l'axe (r = 0).
    if (profile[0]![0]! < 1e-4) {
      const pts: Vec3[] = []
      for (let i = n - 1; i >= 0; i--) pts.push(P(i, 0))
      this.face(pts, o)
    }
    if (profile[m - 1]![0]! < 1e-4) {
      const pts: Vec3[] = []
      for (let i = 0; i < n; i++) pts.push(P(i, m - 1))
      this.face(pts, o)
    }
  }

  /** Capsule : cylindre de rayon r et hauteur h, coiffé de deux sphères (normales lissées). */
  capsule(c: Vec3, r: number, h: number, o: FaceOpts, seg = 12, rings = 6): void {
    this.sphere([c[0], c[1], c[2] + h / 2], r, o, seg, rings)
    this.sphere([c[0], c[1], c[2] - h / 2], r, o, seg, rings)
    this.loft(ngon(r, seg), ngon(r, seg), h, { ...o, pos: [c[0], c[1], c[2] - h / 2] })
  }

  /** Faces triées du fond vers l'avant (tri stable sur la clé). */
  sorted(): Face[] {
    return [...this.faces].sort((a, b) => a.key - b.key)
  }
}

export const mix = (a: Vec3, b: Vec3, u: number): Vec3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]

/** Transposée (= inverse) d'une rotation. */
export const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
]

export interface LocalOpts extends Omit<FaceOpts, 'rot' | 'pos' | 'off'> {
  /** Rotation propre de la pièce, autour de `at`. */
  rot?: Mat3
  /** Centre local de la pièce (point autour duquel `rot` s'applique). */
  at?: Vec3
}

/**
 * Repère local : des pièces décrites autour d'un point `pos` avec une orientation `rot` (un poste sur une table qui
 * tourne). Les primitives prennent des coordonnées locales ; `rot` d'une option est une rotation propre autour de `at`.
 */
export class Frame {
  readonly s: Scene
  readonly pos: Vec3
  readonly rot: Mat3
  /** Échelle des coordonnées locales (une miniature décrite en unités « confortables » puis réduite ou agrandie). */
  readonly k: number
  /** Rendu grossier (SVG prérendu) : dalles sans chanfrein, palets sans biseau. */
  coarse = false
  constructor(s: Scene, pos: Vec3, rot: Mat3 = I3, k = 1) {
    this.s = s
    this.pos = pos
    this.rot = rot
    this.k = k
  }

  private opts(o: LocalOpts): FaceOpts {
    const at = o.at ?? [0, 0, 0]
    const local = o.rot ?? I3
    // monde = pos + R_frame · (k·at + R_local · k·p)  ⇔  loft : R · (p + off) + pos avec R = R_frame · R_local, off = R_localᵀ · k·at
    const off = xf(transpose(local), [at[0] * this.k, at[1] * this.k, at[2] * this.k], [0, 0, 0])
    const { rot: _r, at: _a, ...rest } = o
    void _r
    void _a
    return { ...rest, rot: mmul(this.rot, local), pos: this.pos, off }
  }

  /** Loft local : `bot`/`top` centrés sur `at`, de z = at.z à at.z + h. */
  loft(bot: Vec2[], top: Vec2[], h: number, o: LocalOpts): void {
    const k = this.k
    const sc = (poly: Vec2[]): Vec2[] => (k === 1 ? poly : poly.map((p) => [p[0] * k, p[1] * k] as const))
    this.s.loft(sc(bot), sc(top), h * k, this.opts(o))
  }

  /** Boîte locale de coin minimal (x, y, z). */
  box(x: number, y: number, z: number, w: number, d: number, h: number, o: Omit<LocalOpts, 'at'>): void {
    this.loft(rect(w, d), rect(w, d), h, { ...o, at: [x + w / 2, y + d / 2, z] })
  }

  /** Cylindre vertical local de base (x, y, z). */
  cyl(x: number, y: number, z: number, r: number, h: number, o: Omit<LocalOpts, 'at'>, n = 12): void {
    this.loft(ngon(r, n), ngon(r, n), h, { ...o, at: [x, y, z] })
  }

  /** Cylindre local d'axe x ou y partant de (x, y, z). */
  cylAxis(p0: Vec3, axis: 'x' | 'y', r: number, len: number, o: Omit<LocalOpts, 'at'>, n = 12): void {
    const base = axis === 'x' ? Ry(Math.PI / 2) : Rx(-Math.PI / 2)
    this.loft(ngon(r, n), ngon(r, n), len, { ...o, at: p0, rot: o.rot ? mmul(o.rot, base) : base })
  }

  /** Le même repère, ses coordonnées locales mises à l'échelle `k` (un objet réutilisé plus grand ou plus petit). */
  scaled(k: number): Frame {
    const f = new Frame(this.s, this.pos, this.rot, this.k * k)
    f.coarse = this.coarse
    return f
  }

  /** Sous-repère articulé : origine `at` (locale), rotation `rot` autour de ce point (charnière, pivot, bras). */
  sub(at: Vec3, rot: Mat3): Frame {
    const f = new Frame(this.s, xf(this.rot, [at[0] * this.k, at[1] * this.k, at[2] * this.k], this.pos), mmul(this.rot, rot), this.k)
    f.coarse = this.coarse
    return f
  }

  /** Sphère locale de centre c. */
  sphere(c: Vec3, r: number, o: Omit<LocalOpts, 'at' | 'rot'>, seg = 14, rings = 8): void {
    const w = xf(this.rot, [c[0] * this.k, c[1] * this.k, c[2] * this.k], this.pos)
    this.s.sphere(w, r * this.k, { ...o }, seg, rings)
  }

  /** Surface de révolution locale : profil [r, z] tourné autour de l'axe z local (normales lissées). */
  lathe(profile: Vec2[], n: number, o: Omit<LocalOpts, 'at' | 'rot'>): void {
    const m = profile.length
    if (m < 2 || n < 3) return
    const k = this.k
    const P = (i: number, j: number): Vec3 => {
      const th = (2 * Math.PI * i) / n
      return xf(this.rot, [profile[j]![0]! * Math.cos(th) * k, profile[j]![0]! * Math.sin(th) * k, profile[j]![1]! * k], this.pos)
    }
    const N = (i: number, j: number): Vec3 => {
      const th = (2 * Math.PI * i) / n
      const j0 = Math.max(0, j - 1)
      const j1 = Math.min(m - 1, j + 1)
      const dr = profile[j1]![0]! - profile[j0]![0]!
      const dz = profile[j1]![1]! - profile[j0]![1]!
      return norm(xf(this.rot, [dz * Math.cos(th), dz * Math.sin(th), -dr], [0, 0, 0]))
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < m - 1; j++) {
        this.s.face([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], o, [N(i, j), N(i + 1, j), N(i + 1, j + 1), N(i, j + 1)], 0b1111)
      }
    }
    if (profile[0]![0]! < 1e-4) {
      const pts: Vec3[] = []
      for (let i = n - 1; i >= 0; i--) pts.push(P(i, 0))
      this.s.face(pts, o)
    }
    if (profile[m - 1]![0]! < 1e-4) {
      const pts: Vec3[] = []
      for (let i = 0; i < n; i++) pts.push(P(i, m - 1))
      this.s.face(pts, o)
    }
  }

  /** Capsule locale : cylindre + deux sphères. */
  capsule(c: Vec3, r: number, h: number, o: Omit<LocalOpts, 'at' | 'rot'>, seg = 12, rings = 6): void {
    this.sphere([c[0], c[1], c[2] + h / 2], r, o, seg, rings)
    this.sphere([c[0], c[1], c[2] - h / 2], r, o, seg, rings)
    this.loft(ngon(r, seg), ngon(r, seg), h, { ...o, at: [c[0], c[1], c[2] - h / 2] })
  }

  /** Dalle à arêtes chanfreinées : coin minimal (x, y, z), w × d × h, chanfrein b sur les arêtes verticales et du dessus. */
  slab(x: number, y: number, z: number, w: number, d: number, h: number, b: number, o: Omit<LocalOpts, 'at'>): void {
    const at: Vec3 = [x + w / 2, y + d / 2, z]
    const cut = (W: number, D: number, k: number): Vec2[] => [
      [-W / 2 + k, -D / 2],
      [W / 2 - k, -D / 2],
      [W / 2, -D / 2 + k],
      [W / 2, D / 2 - k],
      [W / 2 - k, D / 2],
      [-W / 2 + k, D / 2],
      [-W / 2, D / 2 - k],
      [-W / 2, -D / 2 + k],
    ]
    if (this.coarse || b <= 0) {
      this.loft(rect(w, d), rect(w, d), h, { ...o, at })
      return
    }
    const bb = Math.min(b, w / 3, d / 3, h / 2)
    this.loft(cut(w, d, bb), cut(w, d, bb), h - bb, { ...o, at })
    // Dessus : rentré du chanfrein ; son propre pan coupé reste plus petit que la moitié du côté (sinon le profil se croise).
    const W = w - 2 * bb
    const D = d - 2 * bb
    this.loft(cut(w, d, bb), cut(W, D, Math.min(bb * 0.6, 0.45 * Math.min(W, D))), bb, { ...o, at: [at[0], at[1], at[2] + h - bb] })
  }

  /** Disque à bord arrondi (cylindre lisse + biseau du dessus) : socles, boutons, palets. */
  puck(x: number, y: number, z: number, r: number, h: number, b: number, o: Omit<LocalOpts, 'at'>, n = 24): void {
    if (this.coarse) {
      this.loft(ngon(r, n), ngon(r, n), h, { ...o, at: [x, y, z] })
      return
    }
    const bb = Math.min(b, h / 2, r / 3)
    this.loft(ngon(r, n), ngon(r, n), h - bb, { ...o, at: [x, y, z] })
    this.loft(ngon(r, n), ngon(r - bb, n), bb, { ...o, at: [x, y, z + h - bb] })
  }

  /** Tube local de P1 à P2 (court : pas de découpe). */
  tube(P1: Vec3, P2: Vec3, r: number, o: Omit<LocalOpts, 'at' | 'rot'>, n = 8): void {
    const dx = P2[0] - P1[0]
    const dy = P2[1] - P1[1]
    const dz = P2[2] - P1[2]
    const len = Math.hypot(dx, dy, dz)
    const rot = mmul(mmul(Rz(Math.atan2(dy, dx)), Ry(-Math.asin(dz / len))), Ry(Math.PI / 2))
    this.loft(ngon(r, n), ngon(r, n), len, { ...o, at: P1, rot })
  }
}

/** Matériaux de l'atelier (section 3 de la spécification) : une couleur de base par matière. */
export const MAT = {
  plate: '#2b3042',
  bevel: '#363c52',
  iron: '#3f4458',
  steel: '#6b7290',
  steelL: '#8a90aa',
  brass: '#c89a4a',
  brassL: '#dcb15e',
  copper: '#b7643a',
  rail: '#8c93ad',
  wood: '#5a4636',
  ballast: '#3a3f55',
  glass: '#9ad7ff',
  ghost: '#7a7f95',
  dark: '#1b1e2b',
  /** v3 : porcelaine (papier, cartes, corps clairs), satin (socles), graphite (corps sombres). */
  porcelain: '#dfe3ee',
  satin: '#272c3c',
  graphite: '#3a4055',
} as const

/** Fond des scènes de héros (hero/art/tokens.ts : K.bg). */
export const ISO_BG = '#0f1117'

/** Lampes de statut : exactement les couleurs du produit (hero/art/tokens.ts). */
export const LAMP = { green: '#34d399', indigo: '#818cf8', amber: '#fbbf24', red: '#f87171', violet: '#a78bfa', sky: '#38bdf8' } as const
