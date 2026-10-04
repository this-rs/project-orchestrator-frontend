import type { ReactNode } from 'react'

/**
 * The small charts of Today: a segmented ring, a row of bars, a stacked bar. Static SVG / HTML,
 * no tween (live data must not animate, DESIGN.md « Mouvement »), and always DECORATIVE: the drawing
 * is `aria-hidden` and sits next to the same information in words or numbers, so colour and shape
 * are never the only cue. What a ring holds in its centre is real content and stays exposed.
 */

export interface Segment {
  value: number
  /** A text-colour class (`text-emerald-400`): the stroke / fill uses `currentColor`. */
  className: string
}

/** A donut cut in segments, with free content in its centre (a percentage, a count). */
export function Ring({
  segments,
  total,
  size = 44,
  stroke = 5,
  children,
  className = '',
}: {
  segments: Segment[]
  /** Whole of the ring; defaults to the sum of the segments (then the ring is always full). */
  total?: number
  size?: number
  stroke?: number
  children?: ReactNode
  className?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const whole = total ?? segments.reduce((n, s) => n + s.value, 0)
  // A hairline gap between segments, only when there is room for one.
  const gap = segments.filter((s) => s.value > 0).length > 1 ? Math.min(2, c * 0.01) : 0
  let offset = 0
  return (
    <span data-chart="ring" className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/[0.08]" />
        {whole > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s, i) => {
              const len = (s.value / whole) * c
              const dash = Math.max(0.5, len - gap)
              const el = (
                <circle
                  key={i}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-offset}
                  className={s.className}
                />
              )
              offset += len
              return el
            })}
      </svg>
      {children && <span className="absolute inset-0 flex flex-col items-center justify-center">{children}</span>}
    </span>
  )
}

/** A few vertical bars side by side (ages, costs): the tallest is the largest value. */
export function MiniBars({ values, className = '', height = 24, max = 8 }: { values: number[]; className?: string; height?: number; max?: number }) {
  const shown = values.slice(0, max)
  const top = Math.max(1, ...shown)
  return (
    <span aria-hidden="true" data-chart="bars" className={`inline-flex shrink-0 items-end gap-[3px] ${className}`} style={{ height }}>
      {shown.map((v, i) => (
        <span key={i} className="w-1.5 rounded-sm bg-current" style={{ height: Math.max(3, Math.round((v / top) * height)) }} />
      ))}
    </span>
  )
}

/** One horizontal bar cut by share. */
export function StackedBar({ segments, className = '' }: { segments: Segment[]; className?: string }) {
  const whole = segments.reduce((n, s) => n + s.value, 0)
  return (
    <span aria-hidden="true" data-chart="stack" className={`flex h-1.5 min-w-0 gap-px overflow-hidden rounded-full bg-white/[0.08] ${className}`}>
      {whole > 0 &&
        segments
          .filter((s) => s.value > 0)
          .map((s, i) => <span key={i} className={`h-full bg-current ${s.className}`} style={{ width: `${(s.value / whole) * 100}%` }} />)}
    </span>
  )
}
