// ============================================================================
// COST — a figure always travels with where it comes from
// ============================================================================
//
// A cost used to be one number, billed by Anthropic. With other providers it
// may be an estimate from a price table, nothing at all (a local endpoint), a
// flat-rate plan, or simply unknown. The one rule that matters: an unknown
// cost is NEVER shown as "$0" — a zero is a claim, and nobody made it.

import { toCostBasis, type CostBasis } from '@/types/provider'
import { activeTranslator } from '@/i18n/active'
import type { ChatMessage, TurnUsage } from '@/types'

/** Tokens of a turn, as far as the provider reported them. */
export interface CostTokens {
  input?: number
  output?: number
  cache_read?: number
  cache_creation?: number
  reasoning?: number
}

export interface CostReport {
  /** `null` / absent = no dollar figure. Never read as zero. */
  usd?: number | null
  basis: CostBasis
  tokens?: CostTokens
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Wire usage (`input_tokens`…) → tokens. `undefined` when it carries no count at all. */
export function tokensFromUsage(usage: unknown): CostTokens | undefined {
  if (typeof usage !== 'object' || usage === null) return undefined
  const u = usage as Record<string, unknown>
  const tokens: CostTokens = {}
  const input = num(u.input_tokens)
  const output = num(u.output_tokens)
  const cacheRead = num(u.cache_read_tokens)
  const cacheCreation = num(u.cache_creation_tokens)
  const reasoning = num(u.reasoning_tokens)
  if (input !== undefined) tokens.input = input
  if (output !== undefined) tokens.output = output
  if (cacheRead !== undefined) tokens.cache_read = cacheRead
  if (cacheCreation !== undefined) tokens.cache_creation = cacheCreation
  if (reasoning !== undefined) tokens.reasoning = reasoning
  return Object.keys(tokens).length > 0 ? tokens : undefined
}

/**
 * A cost from a figure and (maybe) its basis, as REST records carry them
 * (`total_cost_usd` + `cost_basis`).
 *
 * - a basis is given → it is believed, whatever the figure;
 * - a figure alone → `reported`: that is what a pre-provider backend sends,
 *   and it has always been Anthropic's own bill;
 * - neither → `null`: nothing was said, nothing is shown.
 */
export function costReport(usd: number | null | undefined, basis?: unknown, usage?: unknown): CostReport | null {
  const known = toCostBasis(basis)
  const figure = num(usd)
  const tokens = tokensFromUsage(usage)
  if (known) return { usd: figure ?? null, basis: known, ...(tokens ? { tokens } : {}) }
  if (figure !== undefined) return { usd: figure, basis: 'reported', ...(tokens ? { tokens } : {}) }
  return tokens ? { usd: null, basis: 'unknown', tokens } : null
}

/**
 * Cost of a turn from its `result` event. `event.cost` (figure + basis) wins
 * over the bare `cost_usd`; `cost_usd` alone is a reported cost.
 */
export function costFromResult(event: unknown): CostReport | null {
  if (typeof event !== 'object' || event === null) return null
  const e = event as Record<string, unknown>
  const cost = e.cost
  if (typeof cost === 'object' && cost !== null) {
    const c = cost as Record<string, unknown>
    const tokens = tokensFromUsage(e.usage)
    // A `cost` object whose basis is unreadable says "I do not know": unknown.
    return { usd: num(c.usd) ?? null, basis: toCostBasis(c.basis) ?? 'unknown', ...(tokens ? { tokens } : {}) }
  }
  return costReport(e.cost_usd as number | null | undefined, undefined, e.usage)
}

/**
 * Store the cost of a `result` on its assistant message — used by BOTH chat
 * reducers so a turn costs the same live and from history. `cost_usd` is set
 * only when there IS a figure.
 */
export function applyResultCost(message: ChatMessage, event: unknown): void {
  const report = costFromResult(event)
  if (!report) return
  if (report.usd != null) message.cost_usd = report.usd
  message.cost_basis = report.basis
  const usage = (event as { usage?: unknown }).usage
  if (tokensFromUsage(usage)) message.usage = usage as TurnUsage
}

/** Cost of a rendered message. A message with a bare `cost_usd` (older state) is a reported cost. */
export function costOfMessage(message: Pick<ChatMessage, 'cost_usd' | 'cost_basis' | 'usage'>): CostReport | null {
  return costReport(message.cost_usd, message.cost_basis, message.usage)
}

// ----------------------------------------------------------------------------
// Formatting
// ----------------------------------------------------------------------------

/** `$0.0042` under a cent, `$0.42` from a cent up — the format a turn's cost has always had. */
export function formatUsd(usd: number): string {
  return `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`
}

/** `$0.42`, always two decimals — the format of lists and dashboards. */
export function formatUsd2(usd: number): string {
  return `$${usd.toFixed(2)}`
}

/** 950 → `950`, 1 240 → `1.2k`, 3 400 000 → `3.4M`. */
export function formatTokenCount(n: number): string {
  const abs = Math.abs(n)
  if (abs < 1000) return String(n)
  if (abs < 1_000_000) return `${+(n / 1000).toFixed(1)}k`
  return `${+(n / 1_000_000).toFixed(1)}M`
}

/** `1.2k in · 300 out`, or `null` when neither count is known. */
export function formatTokens(tokens: CostTokens | undefined): string | null {
  if (!tokens) return null
  const parts: string[] = []
  const { t } = activeTranslator()
  if (tokens.input !== undefined) parts.push(t('ui.cost.tokensIn', { n: formatTokenCount(tokens.input) }))
  if (tokens.output !== undefined) parts.push(t('ui.cost.tokensOut', { n: formatTokenCount(tokens.output) }))
  return parts.length > 0 ? parts.join(' · ') : null
}

export const costEstimatedBadge = (): string => activeTranslator().t('ui.cost.estimated')
export const costFreeText = (): string => activeTranslator().t('ui.cost.free')
export const costSubscriptionText = (): string => activeTranslator().t('ui.cost.subscription')
/** Explanation of a cost basis, for a tooltip. */
export function costHelp(basis: CostBasis): string {
  return activeTranslator().t(`ui.cost.help.${basis}`)
}

export interface CostText {
  /** What to show, or `null` for nothing at all. */
  text: string | null
  /** The figure is an estimate: show the "est." badge. */
  estimated: boolean
  /** Explanation for a tooltip and for assistive technology. `null` for a plain reported cost. */
  help: string | null
  basis: CostBasis | null
}

const NOTHING: CostText = { text: null, estimated: false, help: null, basis: null }

export interface DescribeCostOptions {
  format?: (usd: number) => string
  /** Hide a reported cost of exactly zero (lists that never showed `$0.00`). */
  hideZero?: boolean
}

/**
 * What to display for a cost, by basis:
 * - `reported` → the amount, as before;
 * - `priced` → the amount, flagged as an estimate;
 * - `free` → "local", never an ambiguous `$0.00`;
 * - `subscription` → "subscription" (a notional amount only in the explanation);
 * - `unknown`, or no figure → the tokens when there are some, else nothing. Never "$0".
 */
export function describeCost(report: CostReport | null | undefined, options: DescribeCostOptions = {}): CostText {
  if (!report) return NOTHING
  const format = options.format ?? formatUsd
  const { basis } = report
  if (basis === 'free') return { text: costFreeText(), estimated: false, help: costHelp('free'), basis }
  if (basis === 'subscription') {
    const notional = report.usd != null ? ` ${activeTranslator().t('ui.cost.notional', { amount: format(report.usd) })}` : ''
    return { text: costSubscriptionText(), estimated: false, help: `${costHelp('subscription')}${notional}`, basis }
  }
  if (basis === 'unknown' || report.usd == null) {
    const tokens = formatTokens(report.tokens)
    return tokens ? { text: tokens, estimated: false, help: costHelp('unknown'), basis } : { ...NOTHING, basis }
  }
  if (options.hideZero && report.usd === 0) return { ...NOTHING, basis }
  return basis === 'priced'
    ? { text: format(report.usd), estimated: true, help: costHelp('priced'), basis }
    : { text: format(report.usd), estimated: false, help: null, basis }
}

/** Plain-text form (exports, `aria-label`s): `$0.04 est.`, `local`, `1.2k in · 300 out`, or `null`. */
export function costToText(report: CostReport | null | undefined, options: DescribeCostOptions = {}): string | null {
  const d = describeCost(report, options)
  if (d.text === null) return null
  return d.estimated ? `${d.text} ${costEstimatedBadge()}` : d.text
}

/** Is there anything to show for this cost? (Lets a caller drop the separator or the row with it.) */
export function hasCost(report: CostReport | null | undefined, options: DescribeCostOptions = {}): boolean {
  return describeCost(report, options).text !== null
}

// ----------------------------------------------------------------------------
// Aggregates
// ----------------------------------------------------------------------------

export interface CostSum {
  /** Sum of the figures that ARE known. */
  usd: number
  /** How many costs carried a figure (or cost nothing: free, subscription). */
  known: number
  /** How many had no figure: the true total is at least `usd`. */
  unknown: number
  /** At least one figure is an estimate. */
  estimated: boolean
}

/**
 * Add costs up without pretending. A member with no figure — an unknown cost,
 * or a record that says nothing at all (`null`) — is counted as unknown, not
 * as zero; `free` and `subscription` add nothing and are known.
 */
export function sumCosts(reports: Iterable<CostReport | null | undefined>): CostSum {
  const sum: CostSum = { usd: 0, known: 0, unknown: 0, estimated: false }
  for (const report of reports) {
    if (!report) {
      sum.unknown++
    } else if (report.basis === 'free' || report.basis === 'subscription') {
      sum.known++
    } else if (report.basis === 'unknown' || report.usd == null) {
      sum.unknown++
    } else {
      sum.usd += report.usd
      sum.known++
      if (report.basis === 'priced') sum.estimated = true
    }
  }
  return sum
}

/**
 * `$1.20` when every part is known, `≥ $1.20` when some are not (the total is
 * a floor, not a figure), `null` when no part has a figure at all.
 */
export function formatCostSum(sum: CostSum, format: (usd: number) => string = formatUsd2): string | null {
  if (sum.known === 0) return null
  const amount = format(sum.usd)
  return sum.unknown > 0 ? `≥ ${amount}` : amount
}

export const costSumPartialHelp = (): string => activeTranslator().t('ui.cost.partialHelp')
