/**
 * Strates et flux d'un conduit de liens : géométrie pure, en nombres.
 *
 * Aucun import de `three`, aucun état, aucun `Math.random` : tout est testable
 * sans WebGL et déterministe. Le nombre de strates est fourni par la
 * morphologie (`morphologyShape(...).graphical.strata`) ; ce module ne
 * l'augmente jamais.
 */

/** Une couche concentrique d'un conduit. */
export interface Stratum {
  /** Rayon en fraction du rayon du conduit, dans (0, 1]. */
  radius: number
  /** Opacité relative de cette couche, dans (0, 1]. */
  alpha: number
  /** Couche porteuse du flux (une seule par conduit, la plus interne). */
  carriesFlow: boolean
}

/** Plancher du rayon de la couche de flux (fraction du conduit). */
const CORE_FLOOR = 0.08
/** Rayon du cœur à l'ordre 0 ; il s'affine de CORE_SLOPE par ordre. */
const CORE_AT_ORDER_0 = 0.3
const CORE_SLOPE = 0.02
/** Opacité de la couche de flux : la plus forte du conduit. */
const FLOW_ALPHA = 0.85
/** Opacité de la gaine externe (la plus faible des gaines est ~moitié). */
const SHEATH_ALPHA_MAX = 0.3
/**
 * Borne de la somme des alphas des gaines. Avec le flux (0,85), la somme
 * totale reste ≤ 1,2 + 0,85 = 2,05 : le conduit ne sature pas l'écran.
 */
const SHEATH_ALPHA_SUM_MAX = 1.2

const finite = (x: number, fallback: number): number => (Number.isFinite(x) ? x : fallback)

/**
 * Les strates d'un conduit, de l'extérieur vers l'intérieur.
 *
 * Loi des rayons : espacement LINÉAIRE de 1 (gaine externe) jusqu'au rayon du
 * cœur `rc = max(0,08 ; 0,30 − 0,02·order)`. L'écart entre deux strates vaut
 * donc `(1 − rc)/(n − 1)` : constant, et il CROÎT avec l'ordre puisque le cœur
 * s'affine — les 12 couches ne se collent jamais (écart ≥ 0,063 à 12 strates).
 *
 * Alphas : les gaines décroissent vers l'intérieur (de 0,30 à ~0,15), leur
 * somme est bornée à 1,2 ; la couche de flux (0,85) est la plus forte.
 *
 * @param strataCount nombre de strates autorisé (0 → aucune : un filament).
 * @param order ordre de grandeur de la magnitude (borné à [0, 30]).
 */
export function strataFor(strataCount: number, order: number): Stratum[] {
  const n = Math.max(0, Math.floor(finite(strataCount, 0)))
  if (n === 0) return []
  const o = Math.min(30, Math.max(0, finite(order, 0)))
  const core = Math.max(CORE_FLOOR, CORE_AT_ORDER_0 - CORE_SLOPE * o)

  const sheathCount = n - 1
  const raw: number[] = []
  for (let i = 0; i < sheathCount; i++) {
    const u = sheathCount > 1 ? i / (sheathCount - 1) : 0
    raw.push(SHEATH_ALPHA_MAX * (1 - 0.5 * u))
  }
  const sum = raw.reduce((a, b) => a + b, 0)
  const scale = sum > SHEATH_ALPHA_SUM_MAX ? SHEATH_ALPHA_SUM_MAX / sum : 1

  const out: Stratum[] = []
  for (let i = 0; i < n; i++) {
    const last = i === n - 1
    const radius = n === 1 ? core : 1 - ((1 - core) * i) / (n - 1)
    out.push({ radius, alpha: last ? FLOW_ALPHA : raw[i] * scale, carriesFlow: last })
  }
  return out
}

/**
 * Positions (0..1 le long du conduit) des grains de flux à l'instant `t`.
 * Grain k : `frac(k/count + t + phase)`, modulo POSITIF (t négatif ou énorme
 * accepté). Espacement régulier 1/count, défilement continu d'un tour par
 * unité de `t`. `phase` décale le motif d'un conduit à l'autre.
 */
export function flowPositions(count: number, t: number, phase: number): number[] {
  const n = Math.max(0, Math.floor(finite(count, 0)))
  const shift = finite(t, 0) + finite(phase, 0)
  const base = shift - Math.floor(shift) // dans [0,1) : évite la perte de précision
  const out: number[] = []
  for (let k = 0; k < n; k++) {
    let p = (k / n + base) % 1
    if (p < 0) p += 1
    out.push(p >= 1 ? 0 : p)
  }
  return out
}

/**
 * Rayon effectif d'une strate pour un conduit d'épaisseur `conduitRadius`.
 *
 * Loi NON LINÉAIRE : `R · r^γ` avec `γ = 1 − 0,4·R/(R+1)` ∈ [0,6 ; 1). Plus le
 * conduit est épais, plus l'exposant baisse : les strates internes sont
 * repoussées vers l'extérieur (le cœur d'un gros tronc ne devient pas un
 * fil), et l'ordre reste strict. Monotone en R, jamais > R (r ≤ 1), jamais
 * ≤ 0 (entrée invalide → 1e-9).
 */
export function stratumRadius(stratum: Stratum, conduitRadius: number): number {
  const R = finite(conduitRadius, 0)
  if (R <= 0) return 1e-9
  const r = Math.min(1, Math.max(1e-3, finite(stratum.radius, 1)))
  const gamma = 1 - (0.4 * R) / (R + 1)
  return Math.max(1e-9, Math.min(R, R * Math.pow(r, gamma)))
}
