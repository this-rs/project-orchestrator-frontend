/**
 * Small metric pieces shared by the code / intelligence / detail pages:
 * a grid of numbers (`StatTiles`) and a labelled 0–1 bar (`Meter`).
 */
import type { ReactNode } from 'react'
import { surface } from './classes'
import { TONE_CLASSES, type StatusTone } from './statusMeta'

export interface StatTile {
  label: string
  value: ReactNode
  /** Muted line under the value (threshold, max, "3 stale"…). */
  sub?: ReactNode
  tone?: StatusTone
  hidden?: boolean
}

/**
 * Grid of number tiles: 2 columns on phones, 4 (or 2) from `sm`. Values are
 * tabular; a tone colours the value only (never a filled background).
 */
export function StatTiles({ items, cols = 4, className = '' }: { items: StatTile[]; cols?: 2 | 4; className?: string }) {
  const visible = items.filter((i) => !i.hidden)
  if (visible.length === 0) return null
  return (
    <dl className={`grid grid-cols-2 ${cols === 4 ? 'sm:grid-cols-4' : ''} gap-2 ${className}`}>
      {visible.map((item) => (
        <div key={item.label} className={`${surface} px-3 py-2 min-w-0`}>
          <dt className="text-[11px] leading-4 text-gray-500 truncate" title={item.label}>
            {item.label}
          </dt>
          <dd className={`text-lg font-semibold tabular-nums ${item.tone ? TONE_CLASSES[item.tone].text : 'text-gray-100'}`}>
            {item.value}
          </dd>
          {item.sub && <p className="text-[11px] leading-4 text-gray-500 break-words">{item.sub}</p>}
        </div>
      ))}
    </dl>
  )
}

/** Default tone for a "higher is better" ratio. */
export const ratioTone = (v: number): StatusTone => (v >= 0.7 ? 'success' : v >= 0.4 ? 'warning' : 'danger')

interface MeterProps {
  /** 0–1. */
  value: number
  /** Label left of the bar; omit for an inline bar (in a row meta line). */
  label?: string
  /** Text right of the bar. Default: percentage. */
  display?: string
  /** Default: `ratioTone(value)`. */
  tone?: StatusTone
  /** Plain-language reading under the bar. */
  hint?: ReactNode
  /**
   * `block` (default) = full-width `label ▬▬▬ 62%` row ·
   * `inline` = short bar + value for meta lines ·
   * `bar` = the track only (decorative, when the value is already printed nearby).
   */
  size?: 'inline' | 'block' | 'bar'
  className?: string
}

/**
 * Labelled horizontal bar: `label ▬▬▬▬▬░░░ 62%`. No tween — the value is
 * data and updates in place.
 */
export function Meter({ value, label, display, tone, hint, size = 'block', className = '' }: MeterProps) {
  const safe = Number.isFinite(value) ? value : 0
  const pct = Math.min(100, Math.max(0, safe * 100))
  const t = tone ?? ratioTone(safe)
  const text = display ?? `${pct.toFixed(0)}%`
  const fill = <span className={`block h-full rounded-full ${TONE_CLASSES[t].dot}`} style={{ width: `${pct}%` }} />

  if (size === 'bar') {
    return (
      <span className={`block h-1 w-full rounded-full bg-white/[0.06] overflow-hidden ${className}`} aria-hidden="true">
        {fill}
      </span>
    )
  }

  const bar = (
    <span
      className={`${size === 'inline' ? 'w-16' : 'flex-1'} h-1 rounded-full bg-white/[0.06] overflow-hidden`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label ?? text}
    >
      {fill}
    </span>
  )
  if (size === 'inline') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        {bar}
        <span className="tabular-nums">{text}</span>
      </span>
    )
  }
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-center gap-2">
        {label && (
          <span className="text-xs text-gray-400 w-28 sm:w-36 shrink-0 truncate" title={label}>
            {label}
          </span>
        )}
        {bar}
        <span className="text-[11px] tabular-nums text-gray-400 w-10 text-right">{text}</span>
      </div>
      {hint && <p className="text-[11px] leading-4 text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}
