/**
 * The trace before its first page: the same frame as `<TraceView>` (toolbar, minimap,
 * help line, ruler, rows of the tree beside their bars) with placeholder shapes, so
 * nothing moves when the real rows take its place.
 *
 * Geometry comes from the trace itself (row height, columns, rows area height): the
 * two cannot drift apart. Decorative: the caller carries the `role="status"` text.
 * The pulse is the temporal family (DESIGN.md § Mouvement) and stops under
 * `prefers-reduced-motion` (`Skeleton` uses `motion-safe:`).
 */
import type { CSSProperties } from 'react'
import { Skeleton, StatusDot } from '@/components/ui'

/** Depth of each placeholder row: a session, its turns, their calls — the shape of a real trace. */
const DEPTHS = [0, 1, 2, 2, 1, 2, 2, 2, 1, 2, 2, 1] as const
/** Each bar starts where the previous one ended, give or take: a cascade, like a real Gantt. */
const BARS: ReadonlyArray<readonly [number, number]> = [
  [2, 94], [4, 30], [6, 12], [19, 14], [36, 34], [38, 9], [49, 15], [62, 6], [72, 24], [74, 10], [86, 8], [90, 6],
]
const LABEL_WIDTHS = ['62%', '78%', '55%', '70%', '74%', '48%', '66%', '58%', '80%', '52%', '64%', '72%']
/** Ruler ticks, in % of the track. */
const TICKS = [0, 25, 50, 75]

interface TraceSkeletonProps {
  wide: boolean
  rowH: number
  /** Height of the rows area: the one the trace will have. */
  bodyH: number
  /** `grid-template-columns` of a wide row (tree · track · duration). */
  gridCols?: CSSProperties
  indentPx: number
  /** The status sentence, shown where the trace's counts will be. */
  caption: string
}

export function TraceSkeleton({ wide, rowH, bodyH, gridCols, indentPx, caption }: TraceSkeletonProps) {
  const rows = Math.max(1, Math.ceil(bodyH / rowH))
  const tool = wide ? 'size-8' : 'size-11'
  return (
    <div aria-hidden="true" data-testid="trace-skeleton" className="min-w-0">
      {/* Toolbar: what is happening, where the counts will be; the four controls. One line, like the trace's. */}
      <div className="flex items-center gap-x-3 px-1 pb-1" data-testid="trace-skeleton-toolbar">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-gray-400">
          <StatusDot tone="progress" pulse size="md" />
          <div className="truncate">{caption}</div>
        </div>
        <div className="flex items-center gap-0.5">
          {[0, 1, 2, 3].map((i) => <div key={i} className={`inline-flex ${tool} items-center justify-center`}><Skeleton className="size-4 rounded" /></div>)}
        </div>
      </div>
      {/* Reserved line of the progress bar. */}
      <div className="mx-1 mb-1 h-0.5" />
      {/* Minimap. */}
      <div className="px-1 pb-1">
        <div className={`relative w-full overflow-hidden rounded-md border border-white/10 bg-black/30 ${wide ? 'h-8' : 'h-11'}`}>
          <Skeleton className="absolute inset-y-1 start-1 w-1/3 rounded-sm" />
        </div>
      </div>
      {/* Help line: the same paragraph as the trace's (one truncated line), so the same height. */}
      <div className="relative truncate px-1 pb-1 text-[10px]">
        {'\u00a0'}
        <div className="absolute inset-x-1 top-1/2 -translate-y-1/2"><Skeleton className="h-2 w-2/3" /></div>
      </div>

      {/* Ruler. */}
      <div className={`border-b border-white/[0.08] ${wide ? 'grid items-end gap-x-2 pe-2' : 'px-1'}`} style={gridCols}>
        {wide && <div className="pb-1.5 ps-2"><Skeleton className="h-2 w-10" /></div>}
        <div className="relative h-7">
          {TICKS.map((pct) => (
            <div key={pct} className="absolute bottom-0 h-2 w-0 border-s border-white/15" style={{ left: `${pct}%` }}>
              <Skeleton className="absolute bottom-2.5 start-1 h-2 w-6" />
            </div>
          ))}
        </div>
        {wide && <div className="flex justify-end pb-1.5"><Skeleton className="h-2 w-8" /></div>}
      </div>

      {/* Rows. */}
      <div className="relative overflow-hidden" style={{ height: bodyH }}>
        {Array.from({ length: rows }, (_, i) => {
          const depth = DEPTHS[i % DEPTHS.length] as number
          const [left, width] = BARS[i % BARS.length] as readonly [number, number]
          const labelW = LABEL_WIDTHS[i % LABEL_WIDTHS.length]
          const label = (
            <div className="flex min-w-0 items-center gap-1.5" style={{ paddingInlineStart: depth * indentPx }}>
              <div className={`shrink-0 ${wide ? 'w-6' : 'w-9'}`} />
              <Skeleton className="size-3 shrink-0 rounded-full" />
              <Skeleton className="h-2.5" width={labelW} />
            </div>
          )
          const bar = (
            <div className="relative block h-full min-w-0 overflow-hidden">
              <div className="absolute top-1/2 h-3 -translate-y-1/2" style={{ insetInlineStart: `${left}%`, width: `${width}%` }}>
                <Skeleton className="size-full rounded-sm" />
              </div>
            </div>
          )
          return (
            <div key={i} className={`absolute inset-x-0 ${depth === 0 ? 'border-t border-white/[0.08]' : ''}`} style={{ top: i * rowH, height: rowH }}>
              {wide ? (
                <div className="grid h-full items-center gap-x-2 pe-2" style={gridCols}>
                  {label}
                  {bar}
                  <div className="flex justify-end"><Skeleton className="h-2 w-7" /></div>
                </div>
              ) : (
                <div className="flex h-full flex-col justify-center px-1">
                  <div className="flex min-h-0 items-center gap-2">
                    <div className="min-w-0 flex-1">{label}</div>
                    <Skeleton className="h-2.5 w-8 shrink-0" />
                  </div>
                  <div className="h-3.5">{bar}</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
