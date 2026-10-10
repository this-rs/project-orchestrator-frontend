/**
 * TraceMinimap — the whole conversation in one strip, with the window the
 * trace shows drawn on it.
 *
 * The strip is the concurrency of the calls over the whole (cut) axis, so the
 * busy stretches stand out. Dragging the window moves the view; pressing
 * outside it centres the view there. It is a slider for the keyboard: arrows
 * move the window, Home / End go to the ends.
 */
import { memo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { focusRing } from '@/components/ui/classes'
import type { Axis } from './axis'
import type { GanttLayout } from './gantt'
import { formatItemDuration } from './status'
import { centreView, clampView, PAN_STEP, panView, type View } from './viewport'

export interface TraceMinimapProps {
  axis: Axis
  view: View
  overview: Pick<GanttLayout, 'concurrency' | 'breaks' | 'peak'>
  onChange: (view: View) => void
  label: string
  windowLabel: string
  /** `{d} idle`. */
  idleLabel: string
  tall?: boolean
}

export const TraceMinimap = memo(function TraceMinimap({ axis, view, overview, onChange, label, windowLabel, idleLabel, tall = false }: TraceMinimapProps) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ startX: number; start: View } | null>(null)
  const total = axis.total
  const leftPct = (view.x0 / total) * 100
  const widthPct = ((view.x1 - view.x0) / total) * 100

  const xAt = (clientX: number): number => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return 0
    return ((clientX - rect.left) / rect.width) * total
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const x = xAt(e.clientX)
    let start = view
    if (x < view.x0 || x > view.x1) {
      start = centreView(view, x, total)
      onChange(start)
    }
    drag.current = { startX: e.clientX, start }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const rect = ref.current?.getBoundingClientRect()
    if (!d || !rect || rect.width <= 0) return
    const shift = ((e.clientX - d.startX) / rect.width) * total
    onChange(clampView({ x0: d.start.x0 + shift, x1: d.start.x1 + shift }, total))
  }
  const onPointerUp = () => {
    drag.current = null
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const width = view.x1 - view.x0
    const next =
      e.key === 'ArrowLeft' ? panView(view, -PAN_STEP, total)
      : e.key === 'ArrowRight' ? panView(view, PAN_STEP, total)
      : e.key === 'Home' ? clampView({ x0: 0, x1: width }, total)
      : e.key === 'End' ? clampView({ x0: total - width, x1: total }, total)
      : null
    if (next) {
      e.preventDefault()
      onChange(next)
    }
  }

  const centre = Math.round(leftPct + widthPct / 2)
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={centre}
      aria-valuetext={`${windowLabel}: ${Math.round(leftPct)}–${Math.round(leftPct + widthPct)} %`}
      data-testid="trace-minimap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={`relative w-full cursor-pointer touch-none select-none overflow-hidden rounded-md border border-white/10 bg-black/30 ${tall ? 'h-11' : 'h-8'} ${focusRing}`}
    >
      {overview.concurrency.map((c, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="absolute bottom-0 bg-sky-400/70"
          style={{
            left: `${c.leftPct}%`,
            width: `${c.widthPct}%`,
            minWidth: 1,
            height: `${overview.peak > 0 ? Math.max(15, (c.n / overview.peak) * 85) : 30}%`,
          }}
        />
      ))}
      {overview.breaks.map((b) => (
        <span
          key={b.pct}
          aria-hidden="true"
          title={idleLabel.replace('{d}', formatItemDuration(b.ms) ?? '')}
          className="absolute inset-y-0 w-0 border-l border-dashed border-white/40"
          style={{ left: `${b.pct}%` }}
        />
      ))}
      <span
        aria-hidden="true"
        data-testid="trace-minimap-window"
        className="absolute inset-y-0 rounded-sm border-2 border-indigo-300 bg-indigo-300/15"
        style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 6 }}
      />
    </div>
  )
})
