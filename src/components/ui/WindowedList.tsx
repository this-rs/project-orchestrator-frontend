import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface WindowedItem {
  key: string
  /** Fixed pixel height of the item (rows must not grow: clamp their text). */
  height: number
  /** Group header: the latest one above the viewport stays pinned at the top. */
  header?: boolean
}

interface WindowedListProps {
  items: WindowedItem[]
  renderItem: (index: number) => ReactNode
  /** Accessible name of the scroll region (also announces the total). */
  label: string
  /** Scrolls back to the top when this changes (search, group-by). */
  resetKey?: string
  /** Tailwind max-height of the scroller. */
  maxHeightClass?: string
  /** Extra items rendered above / below the viewport. */
  overscan?: number
  /** Viewport height assumed before it can be measured. */
  defaultViewport?: number
  className?: string
}

/**
 * Internal-scroll list that renders only the items in view (plus overscan), so thousands of rows
 * stay fast while every one remains reachable by scrolling. Fixed item heights, sticky group
 * headers, keyboard scrollable (the scroller is focusable: arrows / PageUp / PageDown / Home / End).
 *
 * Prefer this to a "Load more" or a cap when users must be able to browse *everything*.
 */
export function WindowedList({
  items,
  renderItem,
  label,
  resetKey,
  maxHeightClass = 'max-h-[32rem]',
  overscan = 6,
  defaultViewport = 512,
  className = '',
}: WindowedListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewport, setViewport] = useState(defaultViewport)

  const { offsets, total, headerBefore } = useMemo(() => {
    const offsets = new Array<number>(items.length)
    const headerBefore = new Array<number>(items.length)
    let y = 0
    let lastHeader = -1
    items.forEach((it, i) => {
      offsets[i] = y
      y += it.height
      if (it.header) lastHeader = i
      headerBefore[i] = lastHeader
    })
    return { offsets, total: y, headerBefore }
  }, [items])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => el.clientHeight > 0 && setViewport(el.clientHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = 0
    setScrollTop(0)
  }, [resetKey])

  // First item whose bottom edge is below the viewport top (binary search).
  let lo = 0
  let hi = items.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] + items[mid].height <= scrollTop) lo = mid + 1
    else hi = mid
  }
  const first = Math.min(lo, Math.max(0, items.length - 1))
  let last = first
  while (last < items.length && offsets[last] < scrollTop + viewport) last++
  const start = Math.max(0, first - overscan)
  const end = Math.min(items.length, last + overscan)

  const pinned = items.length ? headerBefore[first] : -1
  const showPinned = pinned >= 0 && offsets[pinned] < scrollTop

  const rendered: ReactNode[] = []
  for (let i = start; i < end; i++) {
    if (showPinned && i === pinned) continue // drawn once, by the sticky overlay
    rendered.push(
      <div key={items[i].key} style={{ position: 'absolute', top: offsets[i], left: 0, right: 0, height: items[i].height }}>
        {renderItem(i)}
      </div>,
    )
  }

  return (
    <div
      ref={scrollerRef}
      role="region"
      aria-label={label}
      tabIndex={0}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className={`relative overflow-y-auto overscroll-contain rounded-xl border border-white/[0.07] bg-white/[0.02] outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/60 ${maxHeightClass} ${className}`}
    >
      {showPinned && (
        <div className="sticky top-0 z-10 h-0" data-testid="windowed-pinned-header">
          <div style={{ height: items[pinned].height }} className="bg-gray-900/95 backdrop-blur-sm">
            {renderItem(pinned)}
          </div>
        </div>
      )}
      <div style={{ height: total, position: 'relative' }}>{rendered}</div>
    </div>
  )
}
