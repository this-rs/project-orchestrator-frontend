/**
 * LiveProgress — thin segmented progress bar for live runs (done · failed ·
 * remaining). Updates in place: no width tween (live data must not animate,
 * see DESIGN.md « Mouvement »), fixed height so polling never shifts layout.
 */

interface LiveProgressProps {
  done: number
  failed?: number
  total: number
  /** Accessible name, e.g. "Wave 2 progress". */
  label?: string
  className?: string
}

export function LiveProgress({ done, failed = 0, total, label = 'Progress', className = '' }: LiveProgressProps) {
  const safeTotal = Math.max(total, 0)
  const pct = (n: number) => (safeTotal > 0 ? Math.min(100, Math.max(0, (n / safeTotal) * 100)) : 0)
  const donePct = pct(done)
  const failedPct = Math.min(100 - donePct, pct(failed))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-valuenow={done + failed}
      aria-valuetext={`${done} of ${safeTotal} done${failed ? `, ${failed} failed` : ''}`}
      className={`flex h-1 w-full overflow-hidden rounded-full bg-white/[0.06] ${className}`}
    >
      {donePct > 0 && <div className="h-full bg-emerald-500/70" style={{ width: `${donePct}%` }} />}
      {failedPct > 0 && <div className="h-full bg-red-500/70" style={{ width: `${failedPct}%` }} />}
    </div>
  )
}
