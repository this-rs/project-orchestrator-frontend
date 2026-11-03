// ============================================================================
// linkMagnitude — the open magnitude model of the Organic Link Engine
// ============================================================================
//
// Client brief (03/11/2026), verbatim: "Ne considère jamais 10 000 relations
// comme une limite supérieure, ni comme le dernier niveau de représentation.
// […] Le moteur doit permettre de représenter de manière générique et cohérente
// des faisceaux contenant 10⁵, 10⁶, 10⁹, 10¹² relations ou davantage, sans
// introduire de nouveau seuil codé en dur pour chaque ordre de grandeur."
//
// TWO RULES, and the second is the one that was broken everywhere:
//
//  1. THE COUNT IS EXACT, AT ANY SIZE. JavaScript numbers stop being exact at
//     2^53 ≈ 9.007·10¹⁵. A bundle that summarises 10¹⁸ relations would silently
//     lose its last digits — and this model exists to say how much a bundle
//     holds, so an approximate count is a wrong count. Counts therefore travel
//     as `bigint` (or as a decimal string on the wire), and only the
//     characteristics a shader needs are narrowed to `number`.
//
//  2. NO SATURATION WITH MAGNITUDE. The shape used before,
//     `clamp(log10(count) / 4, 0, 1)`, makes 10 000, 10⁶ and 10⁹ EXACTLY equal:
//     past four orders of magnitude a bundle stops being able to say what it
//     carries. Nothing here ever clamps to a fixed ceiling. `magnitudeOrder`
//     grows without bound, and what the renderer does with it is a separate
//     question (T3: the projected width is bounded, the STRUCTURE is what
//     encodes the rest).
//
// The five named morphologies are the ones the client's boards name. They are
// NOT a closed set of orders: beyond the last named level the model keeps
// counting (10¹², 10¹⁵, 10³⁰…) and the hierarchy carries the difference —
// "les niveaux suivants suivent exactement le même principe, sans nouvelle
// catégorie obligatoire".
// ============================================================================

/** The morphology a bundle of this size wears. Named levels only; the ORDERS keep counting past them. */
export type MorphologyLevel = 'filament' | 'bundle' | 'conduit' | 'artery' | 'macrostructure'

/** Ordered from the thinnest to the thickest, for tests and for the renderer's LOD. */
export const MORPHOLOGY_ORDER: readonly MorphologyLevel[] = [
  'filament',
  'bundle',
  'conduit',
  'artery',
  'macrostructure',
]

/**
 * One REAL sub-bundle of a magnitude: a partition of the relations by something
 * the data actually says (relation family, group pair, layer…).
 *
 * A component is never invented here. If the caller has no partition, it passes
 * none, and the renderer must not draw branches: "Ne pas inventer des
 * embranchements qui suggèrent des relations inexistantes."
 */
export interface MagnitudeComponent {
  /** What the partition is on: a relation type, a `g|h` group pair, a layer… */
  key: string
  count: bigint
}

/** Everything the engine needs to know about how much a bundle carries. */
export interface Magnitude {
  /** The exact number of relations represented. Never rounded. */
  exactCount: bigint
  /** Same value as a decimal string — the transport form for anything that cannot hold a bigint. */
  exactCountText: string
  /** floor(log10(count)); 0 below 10. Grows without bound. */
  magnitudeOrder: number
  /** count / 10^magnitudeOrder, in [1, 10). Distinguishes 3·10⁶ from 9·10⁶. */
  magnitudeMantissa: number
  /** The named morphology this size wears. */
  morphology: MorphologyLevel
  /**
   * The REAL sub-bundles, when the caller has a partition. Empty means
   * "unknown", never "none" — the renderer must not draw a branch it was not
   * given.
   */
  hierarchicalComponents: MagnitudeComponent[]
  /**
   * Portion of the graph this count is valid on, in [0, 1].
   *
   * `1` when the count covers every relation drawn; less when the caller
   * summarises a sampled or partially loaded graph — in which case the exact
   * count is exact for the COVERED part, and saying so is the difference
   * between a precise number and a lie.
   */
  coverage: number
}

/** How many decimal digits a count has (count 0 → 1 digit). */
function digitsOf(n: bigint): number {
  const abs = n < 0n ? -n : n
  return abs === 0n ? 1 : abs.toString().length
}

/**
 * Exact base-10 order of magnitude of a positive count: 0 for 1..9, 1 for
 * 10..99, 3 for 1 000..9 999.
 *
 * Computed from the DECIMAL LENGTH, not from `Math.log10(Number(n))`: past 2^53
 * the conversion to double already lost the digits, and `Math.log10` of a value
 * one ulp off the power of ten can return the previous order.
 */
export function magnitudeOrderOf(count: bigint): number {
  if (count < 0n) throw new RangeError('a count of relations cannot be negative')
  if (count < 10n) return 0
  return digitsOf(count) - 1
}

/**
 * Mantissa of a positive count: `count / 10^order`, in [1, 10).
 *
 * Split in two exact bigint divisions (integer part, then twelve decimals of the
 * remainder) so a count of 10³⁰ keeps a meaningful mantissa without ever
 * converting the whole number to a double.
 */
export function magnitudeMantissaOf(count: bigint, order = magnitudeOrderOf(count)): number {
  if (count <= 0n) return 0
  const pow = 10n ** BigInt(order)
  const whole = count / pow
  const rest = count % pow
  const fraction = Number((rest * 10n ** 12n) / pow) / 1e12
  return Number(whole) + fraction
}

/**
 * The morphology a count wears, by its order of magnitude.
 *
 *   1        filament          the single thread
 *   10       bundle            the braided thread
 *   100      conduit           the fibre bundle
 *   1 000    artery            the branching conduit
 *   10 000+  macrostructure    the arterial trunk, and every order above it
 *
 * Past `macrostructure` the level does NOT change again — that is the client's
 * instruction. 10⁶ and 10⁹ wear the same level and must still be told apart:
 * by `magnitudeOrder`, by their structure in the renderer, and by the exact
 * count shown. A test asserts they differ on those three channels.
 */
export function morphologyOf(count: bigint): MorphologyLevel {
  const order = magnitudeOrderOf(count)
  if (order <= 0) return 'filament'
  if (order === 1) return 'bundle'
  if (order === 2) return 'conduit'
  if (order === 3) return 'artery'
  return 'macrostructure'
}

/** Accept the three transports a count can arrive in, and refuse anything that would lose digits. */
export function toCount(value: bigint | string | number): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) throw new RangeError('a count of relations cannot be negative')
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
      throw new TypeError(`a count must be a decimal string of digits, got "${value}"`)
    }
    return BigInt(trimmed)
  }
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`a count must be a non-negative integer, got ${value}`)
  }
  // A number above 2^53 has already lost digits BEFORE this call: multiplying
  // by nothing can bring them back, so say it instead of returning a fake.
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `count ${value} exceeds Number.MAX_SAFE_INTEGER: pass it as a bigint or a decimal string`,
    )
  }
  return BigInt(value)
}

/**
 * Describe how much a bundle carries.
 *
 * `components` is a partition the CALLER observed in the data. When it is
 * given, the model checks nothing about it here (a partial partition is
 * legitimate: "this bundle is made of these three families, and there is more
 * we did not break down" is not the same as a wrong sum) — but
 * `componentsSumToTotal` is exported so a caller that claims a COMPLETE
 * partition can prove it, and a test does exactly that.
 */
export function describeMagnitude(
  count: bigint | string | number,
  components: readonly { key: string; count: bigint | string | number }[] = [],
  coverage = 1,
): Magnitude {
  if (!Number.isFinite(coverage) || coverage < 0 || coverage > 1) {
    throw new RangeError(`coverage must be a fraction in [0, 1], got ${coverage}`)
  }
  const exactCount = toCount(count)
  const magnitudeOrder = magnitudeOrderOf(exactCount)
  const magnitudeMantissa = magnitudeMantissaOf(exactCount, magnitudeOrder)
  const parsed = components.map((c) => ({ key: c.key, count: toCount(c.count) }))
  // Two different keys cannot describe the same sub-bundle: that would double
  // count in the renderer's channels without any relation being added twice.
  const seen = new Set<string>()
  for (const c of parsed) {
    if (seen.has(c.key)) throw new Error(`duplicate component key "${c.key}"`)
    seen.add(c.key)
  }
  return {
    exactCount,
    exactCountText: exactCount.toString(),
    magnitudeOrder,
    magnitudeMantissa,
    morphology: morphologyOf(exactCount),
    hierarchicalComponents: parsed,
    coverage,
  }
}

/**
 * True when the given components form a COMPLETE partition of the bundle: their
 * exact sum equals the bundle's own count.
 *
 * This is the "aucune perte de compte par agrégation" check. It is a function
 * rather than an invariant of `describeMagnitude` because a partial breakdown is
 * legitimate — what is not legitimate is CALLING it complete.
 */
export function componentsSumToTotal(magnitude: Magnitude): boolean {
  let sum = 0n
  for (const c of magnitude.hierarchicalComponents) sum += c.count
  return sum === magnitude.exactCount
}

/**
 * How many decimal orders separate two magnitudes (always ≥ 0).
 *
 * Used to prove the thing the brief insists on: 10⁶ and 10⁹ are three orders
 * apart, so no rendering may treat them as equal.
 */
export function magnitudeGap(a: Magnitude, b: Magnitude): number {
  return Math.abs(a.magnitudeOrder - b.magnitudeOrder)
}

/**
 * Group a count's decimal digits in threes with a narrow no-break space, the
 * way the interface shows numbers: 1 234 567.
 *
 * Written on the STRING, so a count of 10³⁰ is formatted exactly — formatting
 * through `Number` would round it first and display a lie.
 */
export function formatExactCount(count: bigint | string | number): string {
  const text = typeof count === 'string' ? count.trim() : toCount(count).toString()
  if (!/^\d+$/.test(text)) throw new TypeError(`not a decimal count: "${text}"`)
  return text.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
}
