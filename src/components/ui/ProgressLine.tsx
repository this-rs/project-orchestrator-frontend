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
  segments,
  className = '',
}: {
  /** 0–100 */
  value: number
  label?: string
  /** `sm` = 4px hairline (rows), `md` = 6px (detail-page progress block). */
  size?: 'sm' | 'md'
  /**
   * Optional breakdown of the track (list cards): each segment is a share of
   * the whole (0–100) with its own fill class, drawn left to right — e.g.
   * done / active / blocked. `value` stays the accessible reading.
   */
  segments?: { pct: number; className: string }[]
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
      {segments ? (
        <div className="flex h-full w-full gap-px">
          {segments
            .filter((seg) => seg.pct > 0)
            .map((seg, i) => (
              <div key={i} className={`h-full first:rounded-l-full last:rounded-r-full ${seg.className}`} style={{ width: `${Math.min(100, seg.pct)}%` }} />
            ))}
        </div>
      ) : (
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500/80' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
      )}
    </div>
  )
}
