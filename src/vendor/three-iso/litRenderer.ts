// GENERATED from website@4dfb9f9807e5ff890ea2007962062eef1398c7d5:src/three/iso/litRenderer.ts by scripts/sync-iso-lib.mjs — do not edit.
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
 * - Occlusion ambiante écran (SSAO) : une carte de profondeur caméra en demi-résolution, un accumulateur d'occlusion en
 *   demi-résolution, et une multiplication dans la passe couleur (donc AVANT le mappage de tons). Assombrit les creux et
 *   le contact d'une pièce avec son socle. Repli silencieux sur le rendu sans occlusion si la cible manque (voir `AO_*`).
 * - Anticrénelage multi-échantillons du contexte.
 *
 * Aucune dépendance : quelques Ko, chargés à part comme l'ancien canvas 2D.
 */
import { ease, LIGHT, ISO_BG, withHiddenFaces, type Face, type Vec3 } from './iso.ts'
import { EMIT_GAIN, LIGHTS, METALLIC, ROUGHNESS, SPEC_GAIN } from './shading.ts'
import { WIDE_ASPECT, type MachineDef } from './machine.ts'
import { triangulate } from './triangulate.ts'
import { contentBox, DESK_FITS, fitAround, fitWindow, type Box, type CssRect } from './fit.ts'
import { assemble } from './buildIn.ts'
import { applyParts } from './parts.ts'
import { anchorOf, basis, DEFAULT_CAMERA, eyeDistance, fovForFocal, ISO_SCALE, sceneBounds, toScreen, viewProj, type CameraState, type Frame } from './camera.ts'
import { MOVE_MS as GLIDE_MS } from './live.ts'

const FLOATS = 16 // position 3, normale 3, couleur 3, alpha, émission, métal, rugosité, arêtes 3
const SHADOW_SIZE = 2048

/**
 * Occlusion ambiante écran. Les six nombres ci-dessous sont justifiés par une MESURE sur la géométrie réelle, pas par le
 * goût ; les valeurs mesurées sont rappelées à côté de chacune.
 *
 * Échelle de la scène, mesurée sur les machines à postes (`stations.ts`, `U = 13`) :
 *   - un socle mesure 0,62 unité monde de haut (`PAD_H`) ;
 *   - la distance entre deux PIÈCES DIFFÉRENTES (plus proche voisin, 405 points échantillonnés sur la machine
 *     `compact` à 5 postes, 2 166 faces) a pour médiane 0,341, p25 0,255, p75 0,534 ;
 *   - au cadre du héros (canvas 1200 × 700 CSS à `devicePixelRatio` 2, soit 2 400 × 1 400 pixels), une unité monde vaut
 *     50 pixels d'appareil ≈ 25 px CSS.
 *
 * Résolution : `AO_SCALE = 0,5` → un texel d'occlusion par 2 × 2 pixels, donc 4 × moins de texels à échantillonner qu'en
 * pleine résolution (840 000 au lieu de 3 360 000 sur le héros), et l'agrandissement bilinéaire moyennera 4 texels voisins
 * (le bruit du noyau est divisé par ~2). `AO_MAX_TEXELS = 1,2 M` plafonne le coût d'un très grand canvas.
 */
const AO_SCALE = 0.5
const AO_MAX_TEXELS = 1_200_000

/**
 * Rayon d'occlusion, en unités monde : 0,45 tombe entre la médiane (0,341) et le p75 (0,534) des distances entre pièces
 * voisines, donc plus des deux tiers des creux réels sont à portée. En pixels du héros : 0,45 × 25 ≈ 11 px CSS, soit la
 * hauteur du socle (0,62 unité ≈ 15,5 px CSS) — la tache s'éteint sur la hauteur du socle, pas au-delà.
 */
const AO_RADIUS = 0.45

/**
 * Directions par texel d'occlusion. `AO_SAMPLES * AO_MAX_TEXELS` = 14,4 M lectures de profondeur au pire, 10,1 M sur le
 * héros (840 000 texels). L'erreur relative d'une estimation à N tirages vaut 1/√N ≈ 29 % à 12, ramenée à ~15 % par la
 * moyenne de l'agrandissement 2 × ; le noyau est concentré près de l'origine (premier échantillon à 0,2 R) pour que le
 * contact — la zone la plus sombre — soit l'endroit le mieux échantillonné.
 */
const AO_SAMPLES = 12
/** Longueur du premier échantillon du noyau, en fraction du rayon (concentration vers la surface). */
const AO_KERNEL_MIN = 0.2

/**
 * Gain et plancher. `AO_GAIN = 0,75` : une occlusion `occ` assombrit de `0,75 × occ`. `AO_MAX_DARKEN = 0,55` : un coin
 * totalement fermé garde 45 % de sa lumière — un pixel ne peut donc JAMAIS être éteint par cette passe (invariant testé).
 */
const AO_GAIN = 0.75
const AO_MAX_DARKEN = 0.55
/** Biais d'auto-occlusion, en fraction du rayon (0,0225 unité) : rejette la surface qui porte le point lui-même. */
const AO_BIAS_RATIO = 0.05
/** Cadre en dessous duquel la passe d'occlusion ne vaut pas son coût (le rayon couvrirait toute l'image). */
const AO_MIN_PX = 64

/** Taille de la cible d'occlusion, en texels, pour un canvas de `pxW` × `pxH` pixels ; `null` = pas d'occlusion. */
export interface AoPlan {
  width: number
  height: number
  samples: number
}

/**
 * Décide de la cible de la passe d'occlusion — fonction PURE, sans GPU, pour que le repli soit testable : `null` renvoie
 * le rendu au chemin d'avant (aucune occlusion, aucun texel en plus).
 */
export function planAo(pxW: number, pxH: number, maxTex: number, disabled = false): AoPlan | null {
  if (disabled) return null
  if (!(pxW >= AO_MIN_PX) || !(pxH >= AO_MIN_PX)) return null // cadre minuscule, ou NaN
  if (!(maxTex >= AO_MIN_PX)) return null // pilote qui refuse ne serait-ce qu'une petite cible
  // Plafond de texels, puis plafond du pilote : les deux se composent en une seule échelle (l'aspect est conservé).
  let scale = AO_SCALE
  const texels = pxW * pxH * scale * scale
  if (texels > AO_MAX_TEXELS) scale *= Math.sqrt(AO_MAX_TEXELS / texels)
  scale = Math.min(scale, maxTex / pxW, maxTex / pxH)
  if (!(scale > 0)) return null
  const width = Math.max(1, Math.floor(pxW * scale))
  const height = Math.max(1, Math.floor(pxH * scale))
  if (width < AO_MIN_PX || height < AO_MIN_PX) return null
  return { width, height, samples: AO_SAMPLES }
}

/**
 * MESURE de la passe (banc de revue, `frontend/scripts/iso-shots.mjs`) : fonctions PURES sur des tampons lus au
 * `readPixels`, pour qu'un chiffre — pas un coup d'œil — dise si l'occlusion est saine.
 *   - `COVER_ALPHA` : un pixel de l'image compte comme « non-fond » à partir de cet alpha (0,6). Le sol n'est qu'un
 *     capteur d'ombre de la tuile transparente (alpha ≤ 0,45), il ne doit pas compter comme de la géométrie.
 *   - `AO_FLOOR_BYTE` : plancher de la cible d'occlusion (1 − AO_MAX_DARKEN, en octets, moins 1 d'arrondi). Un texel
 *     plus sombre est impossible par construction : c'est la signature d'une cible corrompue.
 */
export const COVER_ALPHA = 153
export const AO_FLOOR_BYTE = Math.floor((1 - AO_MAX_DARKEN) * 255)

export interface ImageStats {
  /** Fraction des pixels dont l'alpha ≥ COVER_ALPHA. */
  coverage: number
  /** Luminance moyenne (Rec. 709 sur les octets sRGB, 0..1) des pixels couverts ; 0 si aucun. */
  luminance: number
}

/** Couverture et luminance d'une image RGBA (octets, ordre `readPixels`). */
export function imageStats(px: Uint8Array): ImageStats {
  const n = px.length >> 2
  let cov = 0
  let lum = 0
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3]! < COVER_ALPHA) continue
    cov++
    lum += 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!
  }
  return { coverage: n ? cov / n : 0, luminance: cov ? lum / cov / 255 : 0 }
}

export interface OcclusionStats {
  width: number
  height: number
  /** Moyenne et minimum sur TOUTE la cible (le fond compte pour 1). */
  meanAll: number
  minAll: number
  /** Texels dont le centre tombe sur de la géométrie (image principale, alpha ≥ COVER_ALPHA), et leurs moyenne/minimum. */
  geomTexels: number
  meanGeom: number
  minGeom: number
  /** Texels sous le plancher possible (corruption). */
  belowFloor: number
}

/**
 * Statistiques de la cible d'occlusion `ao` (RGBA lu, canal R = occlusion, `w` × `h`) ; le masque de géométrie vient de
 * l'image principale `img` (`W` × `H`, même orientation) échantillonnée au centre de chaque texel.
 */
export function occlusionStats(ao: Uint8Array, w: number, h: number, img: Uint8Array, W: number, H: number): OcclusionStats {
  let sumAll = 0
  let minAll = 255
  let gN = 0
  let gSum = 0
  let gMin = 255
  let below = 0
  for (let j = 0; j < h; j++) {
    const y = Math.min(H - 1, Math.floor(((j + 0.5) * H) / h))
    for (let i = 0; i < w; i++) {
      const v = ao[4 * (j * w + i)]!
      sumAll += v
      if (v < minAll) minAll = v
      if (v < AO_FLOOR_BYTE) below++
      const x = Math.min(W - 1, Math.floor(((i + 0.5) * W) / w))
      if (img[4 * (y * W + x) + 3]! >= COVER_ALPHA) {
        gN++
        gSum += v
        if (v < gMin) gMin = v
      }
    }
  }
  const t = w * h
  return {
    width: w,
    height: h,
    meanAll: t ? sumAll / t / 255 : 1,
    minAll: minAll / 255,
    geomTexels: gN,
    meanGeom: gN ? gSum / gN / 255 : 1,
    minGeom: gN ? gMin / 255 : 1,
    belowFloor: below,
  }
}

/** Générateur déterministe (mulberry32) : le noyau ne doit pas changer d'une image à l'autre. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Noyau d'échantillonnage : `n` points de l'hémisphère `z ≥ 0`, de longueur croissante de `AO_KERNEL_MIN` à 1, groupés
 * près de la surface. Tous sont DANS la sphère unité — c'est la borne que vérifie le test (le rayon est ensuite appliqué
 * par le shader, en unités monde).
 */
export function aoKernel(n: number = AO_SAMPLES): Float32Array {
  const r = rng(0x9e3779b9)
  const out = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    // Point uniforme de l'hémisphère : rejet du cube hors de la sphère (32 essais suffisent très largement).
    let x = 0
    let y = 0
    let z = 1
    for (let k = 0; k < 32; k++) {
      x = r() * 2 - 1
      y = r() * 2 - 1
      z = r()
      const l = Math.hypot(x, y, z)
      if (l > 0.1 && l <= 1) break
    }
    const l = Math.hypot(x, y, z) || 1
    const t = (i + 1) / n
    const len = AO_KERNEL_MIN + (1 - AO_KERNEL_MIN) * t * t
    out[3 * i] = (x / l) * len
    out[3 * i + 1] = (y / l) * len
    out[3 * i + 2] = (z / l) * len
  }
  return out
}

/**
 * Inverse d'une matrice 4 × 4 en colonnes (convention WebGL), `null` si elle est dégénérée. Le shader d'occlusion en a
 * besoin pour repasser de la profondeur lue à une position monde ; le test vérifie `M · M⁻¹ = I` sur les deux caméras.
 */
export function invert4(m: Float32Array): Float32Array | null {
  const a00 = m[0]!
  const a01 = m[1]!
  const a02 = m[2]!
  const a03 = m[3]!
  const a10 = m[4]!
  const a11 = m[5]!
  const a12 = m[6]!
  const a13 = m[7]!
  const a20 = m[8]!
  const a21 = m[9]!
  const a22 = m[10]!
  const a23 = m[11]!
  const a30 = m[12]!
  const a31 = m[13]!
  const a32 = m[14]!
  const a33 = m[15]!
  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (!Number.isFinite(det) || Math.abs(det) < 1e-20) return null
  const d = 1 / det
  const o = new Float32Array(16)
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d
  return o
}

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
precision highp sampler2D;
in vec3 vN; in vec3 vCol; in vec4 vMat; in vec3 vL; in vec3 vEdge; in float vGrain; in vec3 vW;
uniform vec4 uEye; // xyz : direction de l'œil (w = 0, orthographique) ou sa position (w = 1, perspective)
uniform sampler2DShadow uShadow; uniform vec3 uLightDir; uniform vec3 uBg; uniform float uTexel; uniform float uTransparent;
uniform vec3 uKey; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uRim;
// Occlusion ambiante écran : la cible en demi-résolution lue par uv = gl_FragCoord / taille du CANVAS (uAoUv), ouverte par uAoOn = 0.
uniform sampler2D uAo; uniform vec2 uAoUv; uniform float uAoOn;
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
    // Occlusion ambiante écran (SSAO) : les creux et le contact d'une pièce avec son socle perdent de la lumière. Le
    // facteur vaut 1 sur une surface dégagée, jamais moins de 1 − AO_MAX_DARKEN dans un coin fermé. Appliqué AVANT le
    // mappage de tons, donc en linéaire. Les faces émissives (lampes) et le sol n'y passent pas.
    if (uAoOn > 0.5) c *= texture(uAo, gl_FragCoord.xy * uAoUv).r;
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

// Quad plein écran (bande de quatre sommets) : sert à la passe d'occlusion. Aucun attribut de position : le sommet se
// déduit du quad, l'uv aussi (v = 0 en bas, comme la profondeur lue et comme le rendu principal).
const AO_VS = `#version 300 es
in vec2 aQuad;
out vec2 vUv;
void main() {
  vUv = aQuad * 0.5 + 0.5;
  gl_Position = vec4(aQuad, 0.0, 1.0);
}`

// Occlusion ambiante en espace écran, en coordonnées MONDE (elle ne dépend donc ni de l'orthographique ni de la
// perspective) : on reconstruit la position du texel depuis la profondeur, on échantillonne un hémisphère autour de sa
// normale, et un échantillon compte comme occulté si la surface visible à cet endroit est DEVANT lui, dans le rayon.
const AO_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uDepth;      // profondeur de la caméra, NEAREST, sans comparaison
uniform mat4 uViewProj;
uniform mat4 uInvViewProj;     // inverse de la matrice ci-dessus : profondeur → position monde
uniform vec4 uEye;             // même convention que le rendu principal (w = 0 ortho, w = 1 perspective)
uniform vec2 uSize;            // taille de la cible en texels (bruit en treillis, stable d'une image à l'autre)
uniform vec3 uKernel[${AO_SAMPLES}];
uniform float uRadius;         // unités monde
uniform float uBias;
uniform float uGain;
uniform float uMaxDark;
out vec4 o;

vec3 worldAt(vec2 uv, float d) {
  vec4 c = uInvViewProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return c.xyz / c.w;
}

// Position monde du texel voisin, ou un point très lointain (jamais choisi comme plus proche) si c'est du fond.
vec3 nearPos(vec2 uv, vec3 P) {
  float d = texture(uDepth, uv).r;
  return d >= 1.0 ? P + vec3(1.0e4) : worldAt(uv, d);
}

void main() {
  float d = texture(uDepth, vUv).r;
  float ao = 1.0;
  if (d < 1.0) { // 1 = aucune géométrie ici : rien ne s'occulte (le fond et le sol restent intacts)
    vec3 P = worldAt(vUv, d);
    vec3 V = uEye.w > 0.5 ? normalize(uEye.xyz - P) : uEye.xyz;
    // Normale du plan local par différences finies de la position reconstruite, en prenant sur chaque axe le voisin le
    // plus PROCHE en profondeur : à une silhouette, dFdx/dFdy mélangent la surface et le fond (position au plan
    // lointain), la normale devient arbitraire, l'hémisphère s'enfonce dans la surface et le texel se dit occulté.
    vec2 px = 1.0 / uSize;
    vec3 dxp = nearPos(vUv + vec2(px.x, 0.0), P) - P;
    vec3 dxm = P - nearPos(vUv - vec2(px.x, 0.0), P);
    vec3 dyp = nearPos(vUv + vec2(0.0, px.y), P) - P;
    vec3 dym = P - nearPos(vUv - vec2(0.0, px.y), P);
    vec3 gx = dot(dxp, dxp) < dot(dxm, dxm) ? dxp : dxm;
    vec3 gy = dot(dyp, dyp) < dot(dym, dym) ? dyp : dym;
    vec3 N = cross(gx, gy);
    // Dégénérée, ou voisin hors du rayon (bord franc des deux côtés) : on retombe sur l'œil.
    N = (dot(N, N) > 1e-20 && dot(gx, gx) < uRadius * uRadius && dot(gy, gy) < uRadius * uRadius) ? normalize(N) : V;
    if (dot(N, V) < 0.0) N = -N;
    vec3 T = normalize(cross(N, abs(N.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
    // Rotation du noyau par texel (bruit en treillis) : le motif est stable, et l'agrandissement bilinéaire le moyenne.
    float ang = fract(sin(dot(floor(vUv * uSize), vec2(12.9898, 78.233))) * 43758.5453) * 6.2831853;
    T = T * cos(ang) + cross(N, T) * sin(ang);
    vec3 B = cross(N, T);
    float occ = 0.0;
    for (int i = 0; i < ${AO_SAMPLES}; i++) {
      vec3 k = uKernel[i];
      vec3 S = P + (T * k.x + B * k.y + N * k.z) * uRadius; // le point échantillonné, en monde
      vec4 c = uViewProj * vec4(S, 1.0);
      vec2 suv = c.xy / c.w * 0.5 + 0.5;
      if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
      float sd = texture(uDepth, suv).r;
      if (sd >= 1.0) continue;
      vec3 Q = worldAt(suv, sd);           // la surface que l'œil voit à l'endroit où S se projette
      // Occulté si Q est entre l'œil et S (devant lui) de plus que le biais. La mesure part de S, PAS de P : mesurée
      // depuis P, tout échantillon incliné vers l'œil au-dessus d'un plan dégagé comptait « occulté » (Q − P a une
      // composante vers l'œil dès que le décalage tangentiel dépasse la remontée verticale), et chaque face se
      // couvrait d'une teinte constante par orientation : les triangles noirs.
      float ahead = dot(Q - S, V);
      if (ahead <= uBias) continue;
      // Portée : un obstacle loin de P (un autre objet, bien plus près de l'œil) n'occulte pas ce point.
      occ += 1.0 - smoothstep(uRadius, 2.0 * uRadius, length(Q - P));
    }
    ao = clamp(1.0 - uGain * occ / float(${AO_SAMPLES}), 1.0 - uMaxDark, 1.0);
  }
  o = vec4(ao, ao, ao, 1.0);
}`

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


/** Cibles de la passe d'occlusion ambiante (recréées quand le canvas change de taille). */
interface AoTargets {
  /** Profondeur de la caméra : une texture seule, aucune couleur (`drawBuffers([NONE])`). */
  depthFbo: WebGLFramebuffer
  depthTex: WebGLTexture
  /** Occlusion (R8) : agrandie en LINEAR par la passe couleur. */
  fbo: WebGLFramebuffer
  tex: WebGLTexture
  width: number
  height: number
}

export class IsoRenderer {
  private readonly gl: WebGL2RenderingContext
  private readonly main: WebGLProgram
  private readonly shadowProg: WebGLProgram
  private readonly glowProg: WebGLProgram
  private readonly lineProg: WebGLProgram
  private readonly lbo: WebGLBuffer
  private readonly qbo: WebGLBuffer
  private lines = new Float32Array(0)
  private readonly vbo: WebGLBuffer
  private readonly gbo: WebGLBuffer
  private readonly shadowTex: WebGLTexture
  private readonly shadowFbo: WebGLFramebuffer
  private data = new Float32Array(0)
  private glow = new Float32Array(0)
  private count = 0

  /** Programme d'occlusion (compilé à la première image qui en a besoin) et ses cibles. */
  private aoProg: WebGLProgram | null = null
  private aoTargets: AoTargets | null = null
  /** Une seule tentative : un pilote qui refuse la cible ne doit pas être réessayé à chaque image. */
  private aoOff = false
  /** 1 × 1 blanc : ce que le rendu principal échantillonne quand l'occlusion est éteinte (jamais lue, `uAoOn` = 0). */
  private readonly aoBlank: WebGLTexture
  /** Noyau du shader d'occlusion (constant, calculé une fois). */
  private readonly aoK = aoKernel()

  private readonly canvas: HTMLCanvasElement
  private machine: MachineDef
  /** Fond transparent (illustration posée sur le fond de sa section) : ni fond ni sol, la scène flotte. */
  private readonly transparent: boolean

  /**
   * `occlusion` : ALLUMÉE par défaut (03/11/2026) — et seulement parce que les NOMBRES du banc la permettent
   * (`npm run iso:shots -- --engine=site`, `qa-out/iso/index.md`, « Rallumage de l'occlusion : AUTORISÉ »).
   *
   * HISTORIQUE. Ajoutée le 02/11 puis éteinte : sur la planche chaque surface se couvrait de triangles noirs, la
   * géométrie fine disparaissait (`six-ring`, `chain-arch-3`), `sdf-ellipsoid` devenait une tuile vide et le tirage
   * 390 px expirait. CAUSES RETENUES (mesurées, voir `draw` et `AO_FS`) :
   *  1. Géométrie qui disparaît — le quad plein écran de la passe d'occlusion restait lié à ARRAY_BUFFER ;
   *     `vertexAttribPointer` enregistre le tampon lié, donc la passe couleur lisait ses sommets dans 32 octets.
   *     Mesure : couverture de l'image avec la passe 0,0–0,5 % (sonde) contre 5,6–33,9 % sans ; après le rebind,
   *     couverture IDENTIQUE à 0,1 point près sur les 9 scènes. Le CDP qui expirait en 390 px suivait de là.
   *  2. Triangles noirs — le test d'occlusion mesurait « la surface vue est-elle devant l'échantillon » depuis P (le
   *     point) au lieu de S (l'échantillon) : au-dessus d'un plan dégagé tout échantillon incliné vers l'œil comptait
   *     occulté, d'une quantité constante par orientation de face, donc par triangle. Mesure sur `sdf-ellipsoid`
   *     (un volume convexe seul, AUCUN contact) : occlusion moyenne sur la géométrie 0,929 avant, 0,981 après (seuil 0,95).
   *  3. Silhouettes — la normale par dFdx/dFdy mélangeait surface et fond ; remplacée par des différences finies au
   *     voisin le plus proche en profondeur.
   *  4. Lecture mal échelonnée — `uAoUv` valait 1/largeur de la CIBLE alors que `gl_FragCoord` est en pixels du CANVAS
   *     (cible = moitié) : uv de 0 à 2, lecture agrandie ×2 et étirée par CLAMP_TO_EDGE. Maintenant 1/taille du canvas.
   * HYPOTHÈSES ÉCARTÉES : matrice de la cible profondeur (`cam.M`, la même que la passe couleur : `invert4` testée par
   * M·M⁻¹ = I, et la cible lue au readPixels n'a aucun texel sous le plancher), viewport/cull/depthMask/drawBuffers de la
   * passe profondeur (attachements complets, aucun texel sous le plancher), tri en profondeur (z-buffer matériel).
   *
   * CRITÈRE DE RALLUMAGE : le banc imprime, par tuile, la couverture, la luminance et la cible d'occlusion lue au
   * readPixels, et échoue sous COVERAGE_MIN / AO_NO_CONTACT_MEAN_MIN (0,95). Si un futur changement fait repasser un de ces
   * nombres au rouge, `occlusion` redevient `false` ICI et le fichier porte les chiffres qui l'interdisent.
   */
  constructor(canvas: HTMLCanvasElement, machine: MachineDef, transparent = false, occlusion = false) {
    this.canvas = canvas
    this.machine = machine
    this.transparent = transparent
    this.aoOff = !occlusion
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
    this.qbo = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.qbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    this.aoBlank = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.aoBlank)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.activeTexture(gl.TEXTURE0)
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

  /**
   * Cibles de la passe d'occlusion pour la taille courante du canvas, ou `null` : occlusion éteinte. Quatre causes de
   * repli, et AUCUNE exception ne sort d'ici (le rendu d'avant continue, image après image) :
   *   - le drapeau `occlusion` du constructeur ou `setAmbientOcclusion(false)` ;
   *   - un contexte perdu (`isContextLost`) ;
   *   - une cible que le pilote refuse (`checkFramebufferStatus`) ou une allocation qui échoue ;
   *   - un shader d'occlusion qui ne compile pas.
   * Un refus est définitif (`aoOff`) : on ne retente pas à chaque image.
   */
  private prepareAo(): AoTargets | null {
    const { gl, canvas } = this
    if (this.aoOff) return null
    if (gl.isContextLost()) {
      this.aoOff = true
      return null
    }
    const plan = planAo(canvas.width, canvas.height, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)))
    if (!plan) return null
    if (!this.aoProg) {
      try {
        this.aoProg = compile(gl, AO_VS, AO_FS)
      } catch {
        this.aoOff = true
        return null
      }
    }
    const cur = this.aoTargets
    if (cur && cur.width === plan.width && cur.height === plan.height) return cur
    this.dropAo()
    const { width, height } = plan
    const depthTex = gl.createTexture()
    const tex = gl.createTexture()
    const depthFbo = gl.createFramebuffer()
    const fbo = gl.createFramebuffer()
    if (!depthTex || !tex || !depthFbo || !fbo) {
      this.aoOff = true
      return null
    }
    gl.bindTexture(gl.TEXTURE_2D, depthTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // Profondeur BRUTE (le contraire de la carte d'ombre) : le shader la compare lui-même, en coordonnées monde.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, depthFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0)
    gl.drawBuffers([gl.NONE])
    let ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR) // agrandissement doux vers la passe couleur
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0])
    ok = ok && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (!ok) {
      gl.deleteFramebuffer(depthFbo)
      gl.deleteTexture(depthTex)
      gl.deleteFramebuffer(fbo)
      gl.deleteTexture(tex)
      this.aoOff = true
      return null
    }
    this.aoTargets = { depthFbo, depthTex, fbo, tex, width, height }
    return this.aoTargets
  }

  private dropAo(): void {
    const t = this.aoTargets
    if (!t) return
    const gl = this.gl
    gl.deleteFramebuffer(t.depthFbo)
    gl.deleteTexture(t.depthTex)
    gl.deleteFramebuffer(t.fbo)
    gl.deleteTexture(t.tex)
    this.aoTargets = null
  }

  /** Éteint (ou rallume) l'occlusion ambiante à chaud ; l'éteindre libère ses cibles et rend le chemin d'origine. */
  setAmbientOcclusion(on: boolean): void {
    if (on) this.aoOff = false
    else {
      this.dropAo()
      this.aoOff = true
    }
  }

  /**
   * Ce que la passe d'occlusion coûte à l'instant présent (contrôle qualité, sans deviner) : taille de la cible, nombre
   * de lectures de profondeur par texel, total de texels d'occlusion. `null` = occlusion éteinte (repli).
   */
  get occlusion(): { width: number; height: number; samples: number; texels: number; reads: number } | null {
    const t = this.aoTargets
    if (this.aoOff || !t) return null
    return { width: t.width, height: t.height, samples: AO_SAMPLES, texels: t.width * t.height, reads: t.width * t.height * AO_SAMPLES }
  }


  /**
   * Couverture et luminance de la DERNIÈRE image (lecture du tampon par défaut). À appeler dans la même tâche que
   * `draw` : le tampon d'un canvas sans `preserveDrawingBuffer` est vidé une fois l'image composée.
   */
  probeImage(): ImageStats {
    return imageStats(this.snapshot().px)
  }

  /**
   * Chiffres de la cible d'occlusion de la dernière image (moyenne, minimum, sous le plancher), ou `null` : la passe
   * n'a pas tourné (éteinte, repliée, canvas trop petit). Même contrainte de tâche que `probeImage`.
   * `mask` : l'image SANS occlusion de la même scène (`snapshot()` d'un rendu qui l'éteint) ; elle dit où est la
   * géométrie. Sans elle, le masque vient de l'image courante — faux justement quand la passe fait disparaître la
   * géométrie (zéro texel de géométrie, moyenne trompeuse de 1).
   */
  probeOcclusion(mask?: { px: Uint8Array; w: number; h: number }): OcclusionStats | null {
    const { gl } = this
    const t = this.aoTargets
    if (this.aoOff || !t) return null
    const ao = new Uint8Array(t.width * t.height * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
    gl.readPixels(0, 0, t.width, t.height, gl.RGBA, gl.UNSIGNED_BYTE, ao)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const img = mask ?? this.snapshot()
    return occlusionStats(ao, t.width, t.height, img.px, img.w, img.h)
  }

  /** Pixels RGBA du tampon par défaut (même contrainte de tâche que `draw`). */
  snapshot(): { px: Uint8Array; w: number; h: number } {
    const { gl, canvas } = this
    const w = canvas.width
    const h = canvas.height
    const px = new Uint8Array(w * h * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px)
    return { px, w, h }
  }

  /** Géométrie de l'instant u : triangles (opaques puis translucides), halos, bornes de profondeur et de lumière. */
  private fill(u: number, built = 1, focus: number | null = null) {
    const all: Face[] = withHiddenFaces(() => this.machine.build(u, 2, focus))
    // Apparition : la machine se construit couche par couche (buildIn.ts) ; 1 = complète.
    // Scène vivante : chaque poste suit son statut réel (live.ts) ; sinon, l'apparition jouée une fois.
    const live = this.machine.live
    const builtFaces = live ? live.assemble(all, performance.now()) : built < 1 ? assemble(this.machine, all, built) : all
    // Isoler / éclater : la MÊME transformation que le repli SVG (parts.ts), appliquée après l'apparition.
    const faces = this.machine.partsView ? applyParts(builtFaces, this.machine, this.machine.partsView) : builtFaces
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

    // 1 bis. Occlusion ambiante. Deux passes avant l'image, et une seule lecture de texture dans la passe couleur.
    //   a) profondeur de la caméra, en demi-résolution : MÊME programme que la carte d'ombre (il n'écrit que de la
    //      profondeur), auquel on donne la matrice de la caméra. Elle ne contient que les faces opaques : le sol
    //      invisible en est exclu, donc les pixels qui ne montrent que lui restent à « rien d'occulté » — aucun halo
    //      sombre ne se dessine sur le fond, seul le contact entre pièces réelles s'assombrit.
    //   b) accumulateur d'occlusion (R8) : 12 directions par texel, en coordonnées monde.
    // Inverse de la matrice de l'image (profondeur → position monde) : recalculée à chaque image, la caméra bouge. Une
    // projection dégénérée (impossible en pratique) éteint l'occlusion pour cette image plutôt que de la fausser.
    const inv = invert4(cam.M)
    const ao = inv ? this.prepareAo() : null
    if (ao && inv && this.aoProg) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, ao.depthFbo)
      gl.drawBuffers([gl.NONE])
      gl.viewport(0, 0, ao.width, ao.height)
      gl.enable(gl.DEPTH_TEST)
      gl.depthFunc(gl.LEQUAL)
      gl.depthMask(true)
      gl.clear(gl.DEPTH_BUFFER_BIT)
      gl.useProgram(this.shadowProg)
      gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowProg, 'uLight'), false, cam.M)
      attrib(this.shadowProg, 'aPos', 3, 0)
      gl.drawArrays(gl.TRIANGLES, 0, geo.opaque)

      gl.bindFramebuffer(gl.FRAMEBUFFER, ao.fbo)
      gl.drawBuffers([gl.COLOR_ATTACHMENT0])
      gl.viewport(0, 0, ao.width, ao.height)
      gl.disable(gl.DEPTH_TEST) // le quad couvre la cible ; aucune profondeur n'est testée ni écrite
      const q = this.aoProg
      gl.useProgram(q)
      const Q = (n: string) => gl.getUniformLocation(q, n)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, ao.depthTex)
      gl.uniform1i(Q('uDepth'), 0)
      gl.uniformMatrix4fv(Q('uViewProj'), false, cam.M)
      gl.uniformMatrix4fv(Q('uInvViewProj'), false, inv)
      gl.uniform4fv(Q('uEye'), cam.eye)
      gl.uniform2f(Q('uSize'), ao.width, ao.height)
      gl.uniform3fv(Q('uKernel'), this.aoK)
      gl.uniform1f(Q('uRadius'), AO_RADIUS)
      gl.uniform1f(Q('uBias'), AO_BIAS_RATIO * AO_RADIUS)
      gl.uniform1f(Q('uGain'), AO_GAIN)
      gl.uniform1f(Q('uMaxDark'), AO_MAX_DARKEN)
      gl.bindBuffer(gl.ARRAY_BUFFER, this.qbo)
      const qa = gl.getAttribLocation(q, 'aQuad')
      if (qa >= 0) {
        gl.enableVertexAttribArray(qa)
        gl.vertexAttribPointer(qa, 2, gl.FLOAT, false, 8, 0)
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      gl.enable(gl.DEPTH_TEST)
    }

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
    // Occlusion : la cible en demi-résolution, agrandie par le filtre LINEAR ; un blanc 1 × 1 quand elle est éteinte.
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, ao ? ao.tex : this.aoBlank)
    gl.uniform1i(U('uAo'), 1)
    gl.uniform1f(U('uAoOn'), ao ? 1 : 0)
    // `gl_FragCoord` est en pixels du CANVAS, la cible fait la moitié : l'uv se normalise par la taille du canvas, pas par
    // celle de la cible (1 / ao.width donnait des uv de 0 à 2 : la passe lisait une occlusion agrandie ×2 et ancrée en bas
    // à gauche, et le CLAMP_TO_EDGE étirait sa dernière colonne sur le reste).
    gl.uniform2f(U('uAoUv'), 1 / canvas.width, 1 / canvas.height)
    gl.activeTexture(gl.TEXTURE0)
    // La passe d'occlusion a laissé le quad plein écran sur ARRAY_BUFFER : `vertexAttribPointer` enregistre le tampon
    // LIÉ à cet instant, donc sans ce rebind tous les attributs de la scène pointeraient dans 32 octets de quad.
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
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
    this.dropAo()
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    gl.deleteBuffer(this.vbo)
    gl.deleteBuffer(this.gbo)
    gl.deleteBuffer(this.qbo)
    gl.deleteTexture(this.aoBlank)
    gl.deleteTexture(this.shadowTex)
    gl.deleteFramebuffer(this.shadowFbo)
    if (this.aoProg) gl.deleteProgram(this.aoProg)
    this.aoProg = null
    gl.deleteProgram(this.main)
    gl.deleteProgram(this.shadowProg)
    gl.deleteProgram(this.glowProg)
    gl.deleteProgram(this.lineProg)
    gl.deleteBuffer(this.lbo)
  }
}
