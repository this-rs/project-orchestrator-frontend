// GENERATED from website@e049ffb8034c92a5bf6e6f782286e8777a5893f6:src/three/iso/shading.ts by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
/**
 * Éclairage des machines, partagé : les constantes du rendu WebGL (`litRenderer.ts`) et sa formule, portée en JS pour
 * que le SVG prérendu ait les MÊMES couleurs que la première image WebGL (sans ombres portées ni liserés). Sans cela,
 * la scène change de teinte au moment où le WebGL prend le relais : deux images qui semblent posées l'une sur l'autre.
 *
 * Module PUR (imports relatifs seulement) : lu par Node au prérendu et dans les tests.
 */
import { LIGHT, MAT, type Face, type Vec3 } from './iso.ts'

/** Lumières (linéaires) : réglées pour le fond sombre des héros. */
export const LIGHTS = {
  key: [3.0, 2.86, 2.64] as Vec3,
  sky: [0.32, 0.36, 0.56] as Vec3,
  ground: [0.08, 0.075, 0.07] as Vec3,
  rim: [0.08, 0.09, 0.18] as Vec3,
}

/** Matières métalliques : reflet plus fort et teinté de leur couleur. */
export const METAL: ReadonlySet<string> = new Set<string>([MAT.brass, MAT.brassL, MAT.copper, MAT.steelL, MAT.rail])

/** Multiplicateur des faces émissives (lampes). */
export const EMIT_GAIN = 2.6

const lin = (c: number) => Math.pow(c, 2.2)
export function linearRgb(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16)
  return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]
}
const aces = (x: number) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)))
const toHex = (c: Vec3) =>
  '#' +
  c
    .map((v) =>
      Math.round(Math.pow(aces(v), 1 / 2.2) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

const V: Vec3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]

/** Couleur sRGB d'une face éclairée comme au rendu WebGL (normale moyenne de la face, sans ombre portée). */
export function litColor(f: Face): string {
  const c = linearRgb(f.emit ?? f.col)
  if (f.emit) return toHex([c[0] * EMIT_GAIN, c[1] * EMIT_GAIN, c[2] * EMIT_GAIN])
  let nx = 0
  let ny = 0
  let nz = 0
  if (f.nrm) {
    for (const n of f.nrm) {
      nx += n[0]
      ny += n[1]
      nz += n[2]
    }
  } else {
    const p = f.pts
    for (let i = 0; i < p.length; i++) {
      const a = p[i]!
      const b = p[(i + 1) % p.length]!
      nx += (a[1] - b[1]) * (a[2] + b[2])
      ny += (a[2] - b[2]) * (a[0] + b[0])
      nz += (a[0] - b[0]) * (a[1] + b[1])
    }
  }
  const l = Math.hypot(nx, ny, nz) || 1
  let N: Vec3 = [nx / l, ny / l, nz / l]
  if (N[0] * V[0] + N[1] * V[1] + N[2] * V[2] < 0) N = [-N[0], -N[1], -N[2]]
  const metal = METAL.has(f.col) ? 1 : 0
  const ndl = Math.max(0, N[0] * LIGHT[0] + N[1] * LIGHT[1] + N[2] * LIGHT[2])
  const t = N[2] * 0.5 + 0.5
  const H = [LIGHT[0] + V[0], LIGHT[1] + V[1], LIGHT[2] + V[2]]
  const hl = Math.hypot(H[0]!, H[1]!, H[2]!)
  const nh = Math.max(0, (N[0] * H[0]! + N[1] * H[1]! + N[2] * H[2]!) / hl)
  const rim = Math.pow(1 - Math.max(0, N[0] * V[0] + N[1] * V[1] + N[2] * V[2]), 4)
  const out: number[] = []
  for (let k = 0; k < 3; k++) {
    const hemi = LIGHTS.ground[k]! + (LIGHTS.sky[k]! - LIGHTS.ground[k]!) * t
    const spec = metal ? c[k]! * Math.pow(nh, 90) * 2.4 + c[k]! * Math.pow(nh, 12) * 0.35 : Math.pow(nh, 36) * 0.12
    out.push(c[k]! * (LIGHTS.key[k]! * ndl * (1 - 0.35 * metal) + hemi) + LIGHTS.key[k]! * spec + LIGHTS.rim[k]! * rim)
  }
  return toHex(out as unknown as Vec3)
}
