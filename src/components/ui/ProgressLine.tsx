/**
 * Thin, static progress line for rows and compact progress blocks.
 *
 * No width tween (DESIGN.md « Mouvement »: data must not animate), single
 * indigo accent (emerald once complete), proper `progressbar` role.
 * `ProgressBar` (animated, gradient) stays for legacy dashboards only.
 */
export function ProgressLine({
  value,
  label = 'Progress',
  size = 'sm',
  className = '',
}: {
  /** 0–100 */
  value: number
  label?: string
  /** `sm` = 4px hairline (rows), `md` = 6px (detail-page progress block). */
  size?: 'sm' | 'md'
  className?: string
}) {
  const pct = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={`${size === 'md' ? 'h-1.5' : 'h-1'} w-full rounded-full bg-white/[0.06] overflow-hidden ${className}`}
    >
      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500/80' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
