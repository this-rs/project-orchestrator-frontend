import { useEffect, useRef, useState, type ReactNode } from 'react'
import { segmented, segmentItem } from './classes'

export interface ViewTab<V extends string = string> {
  id: V
  label: string
  icon?: ReactNode
  count?: number
  disabled?: boolean
}

interface ViewTabsProps<V extends string> {
  tabs: ViewTab<V>[]
  value: V
  onChange: (value: V) => void
  /** Accessible name of the tab list, e.g. "Protocol views". */
  label: string
  className?: string
}

/** Which edges of a horizontal strip hide content (pure: the strip's scroll metrics in, two flags out). */
export function overflowEdges(scrollLeft: number, scrollWidth: number, clientWidth: number): { left: boolean; right: boolean } {
  const slack = 1 // sub-pixel rounding at the end of the scroll
  if (scrollWidth <= clientWidth + slack) return { left: false, right: false }
  return { left: scrollLeft > slack, right: scrollLeft + clientWidth < scrollWidth - slack }
}

/** The fade that says "more this way": a mask on the strip, on the side(s) that hide tabs. */
const FADE: Record<'left' | 'right' | 'both', string> = {
  left: '[mask-image:linear-gradient(to_right,transparent,black_2rem)]',
  right: '[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]',
  both: '[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]',
}

/**
 * Compact segmented control to switch between the views of one page or
 * section (Protocols · Runs · Scheduled, Waves · Discussion tree…).
 *
 * Secondary to `TabLayout` (the page-level underline bar): use it inside a
 * section or under a header. Scrolls horizontally inside its own strip on
 * very narrow screens — never the page — and SAYS so: the edge that hides
 * tabs fades out, and the selected tab is scrolled into view when it changes.
 * Material: `.seg` / `.seg-item` (styles/buttons.css) — the active item is `aria-selected`.
 */
export function ViewTabs<V extends string>({ tabs, value, onChange, label, className = '' }: ViewTabsProps<V>) {
  const strip = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const el = strip.current
    if (!el) return
    const measure = () => {
      const next = overflowEdges(el.scrollLeft, el.scrollWidth, el.clientWidth)
      setEdges((cur) => (cur.left === next.left && cur.right === next.right ? cur : next))
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
  }, [tabs.length])

  // The selected tab is never left hidden behind a fade.
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [value])

  const fade = edges.left && edges.right ? FADE.both : edges.left ? FADE.left : edges.right ? FADE.right : ''

  return (
    <div
      ref={strip}
      data-overflow={edges.left && edges.right ? 'both' : edges.left ? 'left' : edges.right ? 'right' : undefined}
      className={`max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${fade} ${className}`}
    >
      <div role="tablist" aria-label={label} className={segmented}>
        {tabs.map((tab) => {
          const active = tab.id === value
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              className={`${segmentItem} shrink-0 gap-1.5 h-9 md:h-8 px-3 text-xs font-medium whitespace-nowrap ${
                tab.disabled ? 'opacity-40 cursor-not-allowed' : ''
              }`}
            >
              {tab.icon && (
                <span className="inline-flex [&_svg]:w-3.5 [&_svg]:h-3.5" aria-hidden="true">
                  {tab.icon}
                </span>
              )}
              {tab.label}
              {tab.count !== undefined && ' '}
              {tab.count !== undefined && <span className="tabular-nums font-normal text-gray-500">{tab.count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
