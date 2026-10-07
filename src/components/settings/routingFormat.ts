/** `$0.0123`; `unknown` for a missing figure — a null cost is never shown as 0. */
export function formatUsd(
  value: number | null | undefined,
  number: (v: number, o?: Intl.NumberFormatOptions) => string,
  unknown: string,
): string {
  return typeof value === 'number' && Number.isFinite(value) ? `$${number(value, { maximumFractionDigits: 4 })}` : unknown
}

/** A [0, 1] rate as a percent; `na` when there is nothing to compare. */
export function formatPercent(
  value: number | null | undefined,
  number: (v: number, o?: Intl.NumberFormatOptions) => string,
  na: string,
): string {
  return typeof value === 'number' && Number.isFinite(value) ? number(value, { style: 'percent', maximumFractionDigits: 1 }) : na
}
