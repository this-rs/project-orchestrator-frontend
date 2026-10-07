import type { ReactNode } from 'react'
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

/**
 * Compact segmented control to switch between the views of one page or
 * section (Protocols · Runs · Scheduled, Waves · Discussion tree…).
 *
 * Secondary to `TabLayout` (the page-level underline bar): use it inside a
 * section or under a header. Scrolls horizontally inside its own strip on
 * very narrow screens — never the page. Material: `.seg` / `.seg-item`
 * (styles/buttons.css) — the active item is `aria-selected`.
 */
export function ViewTabs<V extends string>({ tabs, value, onChange, label, className = '' }: ViewTabsProps<V>) {
  return (
    <div className={`max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
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
