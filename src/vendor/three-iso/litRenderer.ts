// GENERATED from website@255d188e3498305845e72a27d2569810c72c2e1b:src/three/iso/litRenderer.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Rendu WebGL 2 des machines isométriques : la MÊME géométrie que le SVG prérendu (`machine.build`), mais éclairée
 * comme un objet réel au lieu d'être peinte en quatre tons.
 *
 * - Tampon de profondeur : plus d'ordre du peintre, donc plus de pièces qui passent devant ou derrière au mauvais
 *   endroit ; les faces cachées sont gardées (`withHiddenFaces`) pour que les solides soient entiers.
 * - Éclairage continu en espace linéaire : lumière principale chaude (la direction `LIGHT` du SVG), ciel froid et
 *   rebond du sol en hémisphère, reflet spéculaire discret, liseré de contre-jour ; mappage de tons ACES puis gamma.
 * - Ombres portées douces : carte d'ombre orthographique depuis la lumière, filtrage 3 × 3 matériel (PCF).
 * - Sol invisible de la couleur du fond, qui ne montre que les ombres (les pièces sont posées, pas flottantes).
 * - Lampes : faces émissives non éclairées, plus un halo additif à leur centre.
 * - Anticrénelage multi-échantillons du contexte.
 *
 * Aucune dépendance : quelques Ko, chargés à part comme l'ancien canvas 2D.
 */
import { ease, LIGHT, ISO_BG, withHiddenFaces, type Face, type Vec3 } from './iso'
import { EMIT_GAIN, LIGHTS, METALLIC, ROUGHNESS, SPEC_GAIN } from './shading'
import { WIDE_ASPECT, type MachineDef } from './machine'
import { triangulate } from './triangulate'
import { contentBox, DESK_FITS, fitAround, fitWindow, type Box, type CssRect } from './fit'
import { assemble } from './buildIn'
import { anchorOf, basis, DEFAULT_CAMERA, eyeDistance, fovForFocal, ISO_SCALE, sceneBounds, toScreen, viewProj, type CameraState, type Frame } from './camera'
import { MOVE_MS as GLIDE_MS } from './live'

const FLOATS = 16 // position 3, normale 3, couleur 3, alpha, émission, métal, rugosité, arêtes 3
const SHADOW_SIZE = 2048

const hexRgb = (hex: string): Vec3 => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const lin = (c: number) => Math.pow(c, 2.2)
const linCache = new Map<string, Vec3>()
function linear(hex: string): Vec3 {
  let v = linCache.get(hex)
  if (!v) {
    const [r, g, b] = hexRgb(hex)
    v = [lin(r), lin(g), lin(b)]
    linCache.set(hex, v)
  }
  return v
}



// Projection : une matrice vue-projection (camera.ts) ; la caméra par défaut redonne la projection isométrique classique.
const MAIN_VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec3 aCol; in vec4 aMat; in vec3 aEdge;
uniform mat4 uViewProj; uniform mat4 uLight;
out vec3 vN; out vec3 vCol; out vec4 vMat; out vec3 vL; out vec3 vEdge; out float vGrain; out vec3 vW;
void main() {
  gl_Position = uViewProj * vec4(aPos, 1.0);
  vN = aNor; vCol = aCol; vMat = aMat; vEdge = aEdge; vW = aPos;
  vGrain = 0.9 + 0.2 * fract(sin(dot(aPos * 2.5, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  // Décalage le long de la normale : pas d'acné d'ombre sur les grandes faces rasantes.
  vL = (uLight * vec4(aPos + aNor * 0.06, 1.0)).xyz * 0.5 + 0.5;
}`

const MAIN_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vN; in vec3 vCol; in vec4 vMat; in vec3 vL; in vec3 vEdge; in float vGrain; in vec3 vW;
uniform vec4 uEye; // xyz : direction de l'œil (w = 0, orthographique) ou sa position (w = 1, perspective)
uniform sampler2DShadow uShadow; uniform vec3 uLightDir; uniform vec3 uBg; uniform float uTexel; uniform float uTransparent;
uniform vec3 uKey; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uRim;
out vec4 o;
float shadow() {
  if (vL.x < 0.0 || vL.x > 1.0 || vL.y < 0.0 || vL.y > 1.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
    s += texture(uShadow, vec3(vL.xy + vec2(float(i), float(j)) * uTexel * 1.5, vL.z - 0.002));
  return s / 9.0;
}
vec3 aces(vec3 x) { return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  float sh = shadow();
  if (vMat.y > 1.5) { // sol : le fond, assombri sous les ombres
    // Fond transparent (illustration posée sur sa section) : le sol n'est qu'un capteur d'ombre, noir prémultiplié.
    if (uTransparent > 0.5) o = vec4(0.0, 0.0, 0.0, (1.0 - sh) * 0.45);
    else o = vec4(uBg * mix(0.72, 1.0, sh), 1.0);
    return;
  }
  vec3 V = normalize(uEye.w > 0.5 ? uEye.xyz - vW : uEye.xyz);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) N = -N;
  vec3 c;
  if (vMat.y > 0.5) {
    c = vCol * ${EMIT_GAIN.toFixed(2)};
  } else {
    float metallic = vMat.z;
    float rough = vMat.w;
    vec3 baseCol = vCol * vGrain;
    float ndl = max(dot(N, uLightDir), 0.0);
    float ndv = max(dot(N, V), 0.0);
    vec3 hemi = mix(uGround, uSky, N.z * 0.5 + 0.5);
    vec3 H = normalize(uLightDir + V);
    float nh = max(dot(N, H), 0.0);
    // Cook-Torrance GGX : distribution, Fresnel de Schlick, géométrie de Smith.
    float a = rough * rough;
    float a2 = a * a;
    float d2 = nh * nh * (a2 - 1.0) + 1.0;
    float D = a2 / (3.14159265 * d2 * d2);
    float G = (2.0 * ndl / (ndl + sqrt(a2 + (1.0 - a2) * ndl * ndl))) * (2.0 * ndv / (ndv + sqrt(a2 + (1.0 - a2) * ndv * ndv)));
    vec3 F0 = vec3(0.04) + (baseCol - vec3(0.04)) * metallic;
    vec3 F = F0 + (vec3(1.0) - F0) * pow(1.0 - ndv, 5.0);
    vec3 spec = vec3(${SPEC_GAIN.toFixed(2)}) * D * F * G / (4.0 * ndl * ndv + 1e-4);
    float rim = pow(1.0 - ndv, 4.0);
    c = baseCol * (uKey * ndl * sh * (1.0 - 0.35 * metallic) + hemi) + uKey * spec * sh + uRim * rim;
    // Réflexion d'environnement : ciel procédural + tache du soleil, pour les métaux.
    vec3 R = reflect(-V, N);
    float et = R.z * 0.5 + 0.5;
    float es = pow(max(dot(R, uLightDir), 0.0), 96.0);
    vec3 env = mix(vec3(0.02, 0.03, 0.05), vec3(0.35, 0.45, 0.65), et) + vec3(2.5, 2.3, 2.0) * es;
    c += env * metallic * (1.0 - rough) * 0.5;
    // Arête chanfreinée : un liseré de 1 px qui attrape la lumière (côté éclairé) ou s'assombrit (côté ombre).
    vec3 w = fwidth(vEdge);
    vec3 e = vEdge / max(w, vec3(1e-5));
    float edge = 1.0 - smoothstep(0.4, 1.4, min(min(e.x, e.y), e.z));
    float lit = clamp(ndl * sh * 1.6, 0.0, 1.0);
    c = mix(c, c * mix(0.55, 1.9, lit) + uKey * 0.035 * lit, edge * 0.85);
  }
  o = vec4(pow(aces(c), vec3(1.0 / 2.2)), vMat.x);
}`

const SHADOW_VS = `#version 300 es
in vec3 aPos; uniform mat4 uLight;
void main() { gl_Position = uLight * vec4(aPos, 1.0); }`
const SHADOW_FS = `#version 300 es
precision mediump float; out vec4 o; void main() { o = vec4(1.0); }`

const GLOW_VS = `#version 300 es
in vec3 aPos; in vec3 aCol; in float aSize;
uniform mat4 uViewProj; uniform float uPx;
out vec3 vCol;
void main() {
  vec4 c = uViewProj * vec4(aPos, 1.0);
  // Un peu devant (z du clip) ; en perspective, la taille suit la distance (1/w).
  gl_Position = vec4(c.xy, c.z - 0.002 * c.w, c.w);
  gl_PointSize = aSize * uPx / max(c.w, 0.05);
  vCol = aCol;
}`
const GLOW_FS = `#version 300 es
precision mediump float; in vec3 vCol; out vec4 o;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-d * d * 5.0) * (1.0 - d);
  if (a <= 0.0) discard;
  vec3 c = pow(vCol, vec3(1.0 / 2.2)) * a * 0.55;
  // Alpha = intensité : sur un canvas transparent (prémultiplié), le halo éclaire sans poser d'aplat noir.
  o = vec4(c, max(c.r, max(c.g, c.b)));
}`

const LINE_VS = `#version 300 es
in vec3 aPos; in vec4 aCol;
uniform mat4 uViewProj;
out vec4 vCol;
void main() {
  vec4 c = uViewProj * vec4(aPos, 1.0);
  gl_Position = vec4(c.xy, c.z - 0.001 * c.w, c.w);
  vCol = aCol;
}`
const LINE_FS = `#version 300 es
precision mediump float; in vec4 vCol; out vec4 o;
void main() { o = vec4(pow(vCol.rgb, vec3(1.0 / 2.2)) * vCol.a, vCol.a); }`

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    gl.attachShader(p, s)
  }
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
  return p
}


export class IsoRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly main: WebGLProgram
  private readonly shadowProg: WebGLProgram
  private readonly glowProg: WebGLProgram
  private readonly lineProg: WebGLProgram
  private readonly lbo: WebGLBuffer
  private lines = new Float32Array(0)
  private readonly vbo: WebGLBuffer
  private readonly gbo: WebGLBuffer
  private readonly shadowTex: WebGLTexture
  private readonly shadowFbo: WebGLFramebuffer
  private data = new Float32Array(0)
  private glow = new Float32Array(0)
  private count = 0

  private readonly canvas: HTMLCanvasElement
  private machine: MachineDef
  /** Fond transparent (illustration posée sur le fond de sa section) : ni fond ni sol, la scène flotte. */
  private readonly transparent: boolean

  constructor(canvas: HTMLCanvasElement, machine: MachineDef, transparent = false) {
    this.canvas = canvas
    this.machine = machine
    this.transparent = transparent
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: transparent, premultipliedAlpha: transparent, powerPreference: 'low-power' })
    if (!gl) throw new Error('webgl2')
    this.gl = gl
    this.main = compile(gl, MAIN_VS, MAIN_FS)
    this.shadowProg = compile(gl, SHADOW_VS, SHADOW_FS)
    this.glowProg = compile(gl, GLOW_VS, GLOW_FS)
    this.lineProg = compile(gl, LINE_VS, LINE_FS)
    this.lbo = gl.createBuffer()!
    this.vbo = gl.createBuffer()!
    this.gbo = gl.createBuffer()!
    this.shadowTex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SHADOW_SIZE, SHADOW_SIZE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL)
    this.shadowFbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** Géométrie de l'instant u : triangles (opaques puis translucides), halos, bornes de profondeur et de lumière. */
  private fill(u: number, built = 1, focus: number | null = null) {
    const all: Face[] = withHiddenFaces(() => this.machine.build(u, 2, focus))
    // Apparition : la machine se construit couche par couche (buildIn.ts) ; 1 = complète.
    // Scène vivante : chaque poste suit son statut réel (live.ts) ; sinon, l'apparition jouée une fois.
    const live = this.machine.live
    const faces = live ? live.assemble(all, performance.now()) : built < 1 ? assemble(this.machine, all, built) : all
    let tris = 2 // sol
    for (const f of faces) tris += f.pts.length - 2
    if (this.data.length < tris * 3 * FLOATS) this.data = new Float32Array(tris * 3 * FLOATS * 1.25)
    const d = this.data
    let n = 0
    let xMin = Infinity
    let xMax = -Infinity
    let yMin = Infinity
    let yMax = -Infinity
    const glow: number[] = []
    const lamps = new Map<number, { x: number; y: number; z: number; n: number; lo: number[]; hi: number[]; c: Vec3; a: number }>()
    const push = (p: Vec3, nx: number, ny: number, nz: number, c: Vec3, a: number, e: number, mt: number, rough: number, b0: number, b1: number, b2: number) => {
      d[n++] = p[0]
      d[n++] = p[1]
      d[n++] = p[2]
      d[n++] = nx
      d[n++] = ny
      d[n++] = nz
      d[n++] = c[0]
      d[n++] = c[1]
      d[n++] = c[2]
      d[n++] = a
      d[n++] = e
      d[n++] = mt
      d[n++] = rough
      d[n++] = b0
      d[n++] = b1
      d[n++] = b2
    }
    // Fil de fer : les arêtes (non douces) des faces en plan, en segments colorés ; ces faces n'ont pas de matière.
    const lines: number[] = []
    for (const f of faces) {
      if (f.wire === undefined) continue
      const c = linear(f.col)
      const p = f.pts
      for (let k = 0; k < p.length; k++) {
        if ((f.soft ?? 0) & (1 << k)) continue
        const a = p[k]!
        const b = p[(k + 1) % p.length]!
        lines.push(a[0], a[1], a[2], c[0], c[1], c[2], f.wire, b[0], b[1], b[2], c[0], c[1], c[2], f.wire)
      }
    }
    this.lines = new Float32Array(lines)
    const order = [...faces].filter((f) => f.wire === undefined).sort((a, b) => (a.alpha < 1 ? 1 : 0) - (b.alpha < 1 ? 1 : 0))
    let opaque = 0
    for (const f of order) {
      const pts = f.pts
      let nx = 0
      let ny = 0
      let nz = 0
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!
        const b = pts[(i + 1) % pts.length]!
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
        if (a[0] < xMin) xMin = a[0]
        if (a[0] > xMax) xMax = a[0]
        if (a[1] < yMin) yMin = a[1]
        if (a[1] > yMax) yMax = a[1]
      }
      const l = Math.hypot(nx, ny, nz) || 1
      nx /= l
      ny /= l
      nz /= l
      const c = linear(f.emit ?? f.col)
      const e = f.emit ? 1 : 0
      const mt = !f.emit ? (METALLIC[f.col] ?? 0) : 0
      const rough = ROUGHNESS[f.col] ?? 0.6
      const N = f.nrm
      const soft = f.soft ?? 0
      // Triangles de la face ; coordonnées barycentriques : la composante k s'annule sur l'arête opposée au sommet k.
      // Une arête qui n'est pas un bord du polygone (diagonale) ou un bord doux reçoit +1 : jamais de liseré.
      const tri = triangulate(pts, nx, ny, nz)
      const np = pts.length
      const isEdge = (a: number, b: number) => {
        const k = (a + 1) % np === b ? a : (b + 1) % np === a ? b : -1
        return k >= 0 && !(soft & (1 << k))
      }
      for (let t = 0; t < tri.length; t += 3) {
        const A = tri[t]!
        const Bv = tri[t + 1]!
        const Cv = tri[t + 2]!
        const opp0 = isEdge(Bv, Cv) ? 0 : 1
        const opp1 = isEdge(Cv, A) ? 0 : 1
        const opp2 = isEdge(A, Bv) ? 0 : 1
        const vs = [A, Bv, Cv]
        for (let k = 0; k < 3; k++) {
          const v = vs[k]!
          const nn = N ? N[v]! : null
          push(pts[v]!, nn ? nn[0] : nx, nn ? nn[1] : ny, nn ? nn[2] : nz, c, f.alpha, e, mt, rough, (k === 0 ? 1 : 0) + opp0, (k === 1 ? 1 : 0) + opp1, (k === 2 ? 1 : 0) + opp2)
        }
      }
      if (f.alpha >= 1) opaque += tri.length
      if (f.emit) {
        // Halos regroupés par pièce (une lampe = un halo, pas un par facette).
        let L = lamps.get(f.part)
        if (!L) {
          L = { x: 0, y: 0, z: 0, n: 0, lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity], c, a: f.alpha }
          lamps.set(f.part, L)
        }
        for (const p of pts) {
          L.x += p[0]
          L.y += p[1]
          L.z += p[2]
          L.n++
          for (let j = 0; j < 3; j++) {
            if (p[j]! < L.lo[j]!) L.lo[j] = p[j]!
            if (p[j]! > L.hi[j]!) L.hi[j] = p[j]!
          }
        }
      }
    }
    for (const L of lamps.values()) {
      const ext = Math.max(L.hi[0]! - L.lo[0]!, L.hi[1]! - L.lo[1]!, L.hi[2]! - L.lo[2]!)
      // Un liseré qui fait le tour de la scène n'est pas une lampe : pas de halo au milieu du texte.
      if (ext > 9) continue
      const k = L.a * 0.9 + 0.1
      glow.push(L.x / L.n, L.y / L.n, L.z / L.n, L.c[0] * k, L.c[1] * k, L.c[2] * k, Math.min(150, 26 + ext * this.machine.U * 1.6))
    }
    // Sol : un grand carré à z = 0 sous la machine, de la couleur du fond.
    const m = 60
    const g: Vec3[] = [
      [xMin - m, yMin - m, -0.01],
      [xMax + m, yMin - m, -0.01],
      [xMax + m, yMax + m, -0.01],
      [xMin - m, yMax + m, -0.01],
    ]
    const bg: Vec3 = [0, 0, 0]
    for (const i of [0, 1, 2, 0, 2, 3]) push(g[i]!, 0, 0, 1, bg, 1, 2, 0, 0.5, 1, 1, 1)
    const ground = 6
    this.glow = new Float32Array(glow)
    this.count = n / FLOATS
    return { count: n / FLOATS, opaque, ground, bounds: [xMin, xMax, yMin, yMax] as const }
  }

  /** Matrice monde → espace de la lumière (orthographique, ajustée aux bornes de la scène). */
  private lightMatrix(): Float32Array {
    const d = this.data
    const L = LIGHT
    // Repère de la lumière : f regarde dans le sens de la lumière, r et up complètent.
    const f: Vec3 = [-L[0], -L[1], -L[2]]
    let r: Vec3 = [f[1] * 1 - f[2] * 0, f[2] * 0 - f[0] * 1, 0]
    const rl = Math.hypot(r[0], r[1], r[2]) || 1
    r = [r[0] / rl, r[1] / rl, r[2] / rl]
    const up: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]]
    let a0 = Infinity
    let a1 = -Infinity
    let b0 = Infinity
    let b1 = -Infinity
    let c0 = Infinity
    let c1 = -Infinity
    for (let i = 0; i < this.count * FLOATS; i += FLOATS) {
      if (d[i + 10]! > 1.5) continue // le sol ne compte pas dans le cadrage de l'ombre
      const x = d[i]!
      const y = d[i + 1]!
      const z = d[i + 2]!
      const a = x * r[0] + y * r[1] + z * r[2]
      const b = x * up[0] + y * up[1] + z * up[2]
      const c = x * f[0] + y * f[1] + z * f[2]
      if (a < a0) a0 = a
      if (a > a1) a1 = a
      if (b < b0) b0 = b
      if (b > b1) b1 = b
      if (c < c0) c0 = c
      if (c > c1) c1 = c
    }
    const pad = 2
    a0 -= pad
    a1 += pad
    b0 -= pad
    b1 += pad
    c0 -= pad
    c1 += 30 // le sol, loin derrière, reçoit l'ombre
    const sa = 2 / (a1 - a0)
    const sb = 2 / (b1 - b0)
    const sc = 2 / (c1 - c0)
    // Colonnes (convention WebGL) : clip = M · (x, y, z, 1).
    return new Float32Array([
      r[0] * sa, up[0] * sb, f[0] * sc, 0,
      r[1] * sa, up[1] * sb, f[1] * sc, 0,
      r[2] * sa, up[2] * sb, f[2] * sc, 0,
      -(a0 + a1) / 2 * sa, -(b0 + b1) / 2 * sb, -(c0 + c1) / 2 * sc, 1,
    ])
  }

  /** Trace l'instant u (fraction du cycle) sur tout le canvas (viewBox 1200 × 700). */
  draw(u: number, built = 1, focus: number | null = null): void {
    const { gl, canvas, machine } = this
    this.adapt()
    const geo = this.fill(u, built, focus)
    // Fenêtre du viewBox montrée : la machine entière, centrée (même cadrage que le SVG prérendu) ; après un changement
    // de machine d'une scène vivante, le cadrage glisse de l'ancien vers le nouveau.
    const win = this.window(fitWindow(contentBox(machine), canvas.width, canvas.height))
    const cam = this.view(win, geo.count)
    const light = this.lightMatrix()
    const stride = FLOATS * 4
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, geo.count * FLOATS), gl.STREAM_DRAW)

    const attrib = (prog: WebGLProgram, name: string, size: number, off: number) => {
      const loc = gl.getAttribLocation(prog, name)
      if (loc < 0) return
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, off * 4)
    }

    // 1. Carte d'ombre (pièces opaques seulement, sol exclu : il est dessiné en dernier dans le tampon).
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo)
    gl.viewport(0, 0, SHADOW_SIZE, SHADOW_SIZE)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.depthMask(true)
    gl.clear(gl.DEPTH_BUFFER_BIT)
    gl.enable(gl.POLYGON_OFFSET_FILL)
    gl.polygonOffset(3, 8)
    gl.useProgram(this.shadowProg)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, 'uLight'), false, light)
    attrib(this.shadowProg, 'aPos', 3, 0)
    gl.drawArrays(gl.TRIANGLES, 0, geo.opaque)
    gl.disable(gl.POLYGON_OFFSET_FILL)

    // 2. Image.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    const bg = hexRgb(ISO_BG)
    if (this.transparent) gl.clearColor(0, 0, 0, 0)
    else gl.clearColor(bg[0], bg[1], bg[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    const p = this.main
    gl.useProgram(p)
    const U = (n: string) => gl.getUniformLocation(p, n)
    gl.uniformMatrix4fv(U('uViewProj'), false, cam.M)
    gl.uniform4fv(U('uEye'), cam.eye)
    gl.uniformMatrix4fv(U('uLight'), false, light)
    gl.uniform3f(U('uLightDir'), LIGHT[0], LIGHT[1], LIGHT[2])
    gl.uniform3f(U('uBg'), bg[0], bg[1], bg[2])
    gl.uniform1f(U('uTransparent'), this.transparent ? 1 : 0)
    gl.uniform1f(U('uTexel'), 1 / SHADOW_SIZE)
    gl.uniform3fv(U('uKey'), LIGHTS.key)
    gl.uniform3fv(U('uSky'), LIGHTS.sky)
    gl.uniform3fv(U('uGround'), LIGHTS.ground)
    gl.uniform3fv(U('uRim'), LIGHTS.rim)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex)
    gl.uniform1i(U('uShadow'), 0)
    attrib(p, 'aPos', 3, 0)
    attrib(p, 'aNor', 3, 3)
    attrib(p, 'aCol', 3, 6)
    attrib(p, 'aMat', 4, 9)
    attrib(p, 'aEdge', 3, 12)
    gl.disable(gl.BLEND)
    gl.drawArrays(gl.TRIANGLES, 0, geo.opaque)
    if (this.transparent) {
      // Capteur d'ombre : seulement l'ombre, posée sur le fond de la section (composition prémultipliée).
      gl.enable(gl.BLEND)
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.depthMask(false)
      gl.drawArrays(gl.TRIANGLES, geo.count - geo.ground, geo.ground)
      gl.depthMask(true)
      gl.disable(gl.BLEND)
    } else gl.drawArrays(gl.TRIANGLES, geo.count - geo.ground, geo.ground)
    // Translucides : après, mélangés, sans écrire la profondeur (alpha composé pour un canvas transparent aussi).
    const translucent = geo.count - geo.ground - geo.opaque
    if (translucent > 0) {
      gl.enable(gl.BLEND)
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.depthMask(false)
      gl.drawArrays(gl.TRIANGLES, geo.opaque, translucent)
      gl.depthMask(true)
    }

    // 3. Fil de fer (le plan avant la matière).
    if (this.lines.length) {
      const q = this.lineProg
      gl.useProgram(q)
      const L = (n: string) => gl.getUniformLocation(q, n)
      gl.uniformMatrix4fv(L('uViewProj'), false, cam.M)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lbo)
      gl.bufferData(gl.ARRAY_BUFFER, this.lines, gl.STREAM_DRAW)
      for (const [name, size, off] of [
        ['aPos', 3, 0],
        ['aCol', 4, 3],
      ] as const) {
        const loc = gl.getAttribLocation(q, name)
        if (loc < 0) continue
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 7 * 4, off * 4)
      }
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.depthMask(false)
      gl.drawArrays(gl.LINES, 0, this.lines.length / 7)
      gl.depthMask(true)
      gl.disable(gl.BLEND)
    }

    // 4. Halos des lampes : additifs.
    if (this.glow.length) {
      const q = this.glowProg
      gl.useProgram(q)
      const G = (n: string) => gl.getUniformLocation(q, n)
      gl.uniformMatrix4fv(G('uViewProj'), false, cam.M)
      gl.uniform1f(G('uPx'), (canvas.width / win.w) * cam.zoom)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.gbo)
      gl.bufferData(gl.ARRAY_BUFFER, this.glow, gl.STREAM_DRAW)
      const gs = 7 * 4
      for (const [name, size, off] of [
        ['aPos', 3, 0],
        ['aCol', 3, 3],
        ['aSize', 1, 6],
      ] as const) {
        const loc = gl.getAttribLocation(q, name)
        if (loc < 0) continue
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, gs, off * 4)
      }
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.depthMask(false)
      // Le centre d'une lampe est souvent dans son propre socle : le halo, doux, passe par-dessus.
      gl.disable(gl.DEPTH_TEST)
      gl.drawArrays(gl.POINTS, 0, this.glow.length / 7)
      gl.enable(gl.DEPTH_TEST)
      gl.depthMask(true)
      gl.disable(gl.BLEND)
    }
  }

  /**
   * Les points d'interaction de la machine dessinée, en pixels CSS du canvas (`cssW` × `cssH`) : centre et rayon de
   * chaque poste, pour poser des boutons dessus (survol, toucher). Vide si la machine n'en déclare pas. Projetés par la
   * caméra de la dernière image (rayon 0 : poste derrière l'œil).
   */
  hotspots(cssW: number, cssH: number): { x: number; y: number; r: number }[] {
    const hs = this.machine.hotspots
    if (!hs) return []
    const m = this.machine
    const f = this.last ?? this.frameOf(fitWindow(contentBox(m), this.canvas.width, this.canvas.height), [-50, 50])
    const cam = this.last?.camera ?? this.defaultCamera()
    const M = this.last?.M ?? viewProj(cam, cam.target ?? sceneBounds(m).center, f)
    const k = (cssW / f.win.w) * cam.zoom * m.U * Math.cos(Math.PI / 6)
    return hs.at.map((p) => {
      const s = toScreen(M, p, cssW, cssH)
      return s.w > 0 ? { x: s.x, y: s.y, r: (hs.radius * k) / s.w } : { x: -1e4, y: -1e4, r: 0 }
    })
  }

  /* ---------- Caméra (camera.ts) ---------- */

  /** Caméra choisie par le lecteur ; `null` : la caméra par défaut de la machine (iso, cadrée comme le SVG). */
  private camera: CameraState | null = null
  /** Dernière image : la caméra et son cadre (les gestes de IsoGL en ont besoin). */
  private last: (Frame & { camera: CameraState; M: Float32Array; T: Vec3 }) | null = null

  setCamera(c: CameraState | null): void {
    this.camera = c
  }

  /** Réglages de la caméra par défaut imposés par le parent (le chat : perspective ; le héros du site : rien). */
  private defaults: Partial<CameraState> = {}

  setDefaults(d: Partial<CameraState>): void {
    this.defaults = d
  }

  /** Caméra par défaut : la vue isométrique ; perspective vraie si la machine déclare `focal` (le champ en dépend). */
  defaultCamera(): CameraState {
    const focal = this.machine.focal ?? 0
    const base: CameraState = focal > 0 ? { ...DEFAULT_CAMERA, mode: 'persp', fov: fovForFocal(focal) } : DEFAULT_CAMERA
    return { ...base, ...this.defaults }
  }

  /** Le cadre et la caméra de la dernière image (null avant la première). */
  get frame(): (Frame & { camera: CameraState; T: Vec3; M: Float32Array }) | null {
    return this.last
  }

  /** La machine dessinée (variante étirée ou large comprise) : ses postes, sa boîte. */
  get drawn(): MachineDef {
    return this.machine
  }

  /** Centre de la scène dessinée (cible par défaut). */
  get center(): Vec3 {
    return sceneBounds(this.machine).center
  }

  private frameOf(win: Box, depth: readonly [number, number]): Frame {
    return { win, anchor: anchorOf(this.machine), s0: this.machine.U * ISO_SCALE, depth }
  }

  /** Matrice vue-projection de l'image : profondeurs de la scène (sol compris) le long de l'œil, cadre, œil. */
  private view(win: Box, count: number): { M: Float32Array; eye: Float32Array; zoom: number } {
    const cam = this.camera ?? this.defaultCamera()
    const T = cam.target ?? sceneBounds(this.machine).center
    const { eye } = basis(cam.yaw, cam.pitch)
    const d = this.data
    let c0 = Infinity
    let c1 = -Infinity
    const at = (x: number, y: number, z: number) => {
      const c = (x - T[0]) * eye[0] + (y - T[1]) * eye[1] + (z - T[2]) * eye[2]
      if (c < c0) c0 = c
      if (c > c1) c1 = c
    }
    for (let i = 0; i < count * FLOATS; i += FLOATS) at(d[i]!, d[i + 1]!, d[i + 2]!)
    for (let i = 0; i < this.lines.length; i += 7) at(this.lines[i]!, this.lines[i + 1]!, this.lines[i + 2]!)
    if (!(c1 >= c0)) {
      c0 = -1
      c1 = 1
    }
    const f = this.frameOf(win, [c0 - 1, c1 + 1])
    const M = viewProj(cam, T, f)
    this.last = { ...f, camera: cam, M, T }
    const e = new Float32Array(4)
    if (cam.mode === 'persp') {
      const dist = eyeDistance(cam, f)
      e.set([T[0] + eye[0] * dist, T[1] + eye[1] * dist, T[2] + eye[2] * dist, 1])
    } else e.set([eye[0], eye[1], eye[2], 0])
    return { M, eye: e, zoom: cam.zoom }
  }

  private glide: { from: Box; at: number } | null = null
  private shown: Box | null = null

  /** Remplacer la machine sans recréer le contexte (scène vivante qui change de forme) : le cadrage glisse. */
  setMachine(m: MachineDef): void {
    if (m === this.machine) return
    if (this.shown) this.glide = { from: this.shown, at: performance.now() }
    this.machine = m
    this.root = m
    this.wideRoot = undefined
  }

  private window(target: Box): Box {
    let w = target
    if (this.glide) {
      const t = (performance.now() - this.glide.at) / GLIDE_MS
      if (t >= 1) this.glide = null
      else {
        const e = ease(t)
        const f = this.glide.from
        w = { x: f.x + (target.x - f.x) * e, y: f.y + (target.y - f.y) * e, w: f.w + (target.w - f.w) * e, h: f.h + (target.h - f.h) * e }
      }
    }
    this.shown = w
    return w
  }

  /** Une scène vivante en cours de glissement redemande des images même si rien d'autre ne bouge. */
  get moving(): boolean {
    return this.glide !== null
  }

  private readonly variants = new Map<string, MachineDef>()
  private readonly fitted = new Map<string, MachineDef>()
  private root: MachineDef | null = null
  private wideRoot: MachineDef | undefined

  /**
   * Cadre plus large que la machine : on prend sa variante étirée en largeur (par pas de 5 %, au plus × 1,7), pour
   * remplir la largeur au lieu de laisser deux bandes vides. Les objets ne sont pas déformés.
   */
  private text: { rect: CssRect; w: number; h: number } | null = null

  /** Identifiant de la variante dessinée (contrôle qualité : `canvas.dataset.machine`). */
  get current(): string {
    return this.machine.id
  }

  /** Texte à dégager (pixels CSS du canvas `w` × `h`) : la disposition s'étire verticalement jusqu'à ne plus le couvrir. */
  avoid(rect: CssRect, w: number, h: number): void {
    this.text = { rect, w, h }
  }

  private adapt(): void {
    if (!this.root) this.root = this.machine
    const aspect = this.canvas.width / Math.max(1, this.canvas.height)
    // Cadre très large et bas : la disposition de repli (ailes), qui laisse au texte toute la hauteur.
    const base = aspect >= WIDE_ASPECT && this.root.wide ? (this.wideRoot ??= this.root.wide()) : this.root
    if (!base.stretch) {
      this.machine = base
      return
    }
    const b = contentBox(base)
    // Étirer dès que le cadre est plus large de 15 % (le SVG prérendu n'est jamais montré en même temps : pas de saut).
    const want = aspect / (b.w / b.h)
    const sx = want > 1.15 ? Math.min(1.7, Math.round(want * 20) / 20) : 1
    const pick = (kx: number, sy: number) => {
      const x = Math.round(sx * kx * 100) / 100
      const key = `${base.id}@${x}x${sy}`
      let m = this.variants.get(key)
      if (!m) {
        m = base.stretch!(x, sy)
        this.variants.set(key, m)
      }
      return m
    }
    // Dégager le texte réel : écarter en largeur et/ou étirer en hauteur, le moins possible (calculé une fois par
    // taille de cadre et de texte).
    const t = this.text
    if (!t) {
      this.machine = pick(1, 1)
      return
    }
    const key = `${base.id}|${Math.round(t.w)}x${Math.round(t.h)}|${t.rect.x0.toFixed(0)},${t.rect.y0.toFixed(0)},${t.rect.x1.toFixed(0)},${t.rect.y1.toFixed(0)}`
    let m = this.fitted.get(key)
    if (!m) {
      m = fitAround((i) => pick(DESK_FITS[i]![0], DESK_FITS[i]![1]), DESK_FITS.map((_, i) => i), t.w, t.h, t.rect)
      this.fitted.set(key, m)
    }
    this.machine = m
  }

  dispose(): void {
    const gl = this.gl
    // Rendre le contexte tout de suite : une page peut monter et démonter plusieurs scènes au fil du défilement.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    gl.deleteBuffer(this.vbo)
    gl.deleteBuffer(this.gbo)
    gl.deleteTexture(this.shadowTex)
    gl.deleteFramebuffer(this.shadowFbo)
    gl.deleteProgram(this.main)
    gl.deleteProgram(this.shadowProg)
    gl.deleteProgram(this.glowProg)
    gl.deleteProgram(this.lineProg)
    gl.deleteBuffer(this.lbo)
  }
}
