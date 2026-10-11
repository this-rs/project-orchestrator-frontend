/**
 * Numbers from the analytics endpoints, shown without lying.
 *
 * The backend computes these as `f64`; a NaN or an infinity (a ratio over zero
 * files, a graph metric not computed yet) reaches the browser as `null`, and an
 * older backend may leave a field out. `?? 0` would show a plausible "0" for
 * "unknown"; these helpers show "—" instead.
 */

/** The placeholder for a number we do not have. */
export const MISSING = '—'

/** `n` when it is a finite number, else `null` (null, undefined, NaN, ±Infinity). */
export function finite(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** `n × scale` with `digits` decimals, or "—" when `n` is not a finite number. */
export function fmt(n: number | null | undefined, digits: number, scale = 1): string {
  const v = finite(n)
  return v == null ? MISSING : (v * scale).toFixed(digits)
}

/** A ratio (0–1) as a percentage: "42%", or "—" when it is not a finite number. */
export function fmtPct(ratio: number | null | undefined, digits = 0): string {
  const v = finite(ratio)
  return v == null ? MISSING : `${(v * 100).toFixed(digits)}%`
}
