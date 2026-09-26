import { focusRing } from '@/components/ui'

export interface ViewTab<V extends string> {
  value: V
  label: string
  count?: number
}

interface ViewTabsProps<V extends string> {
  tabs: ViewTab<V>[]
  value: V
  onChange: (value: V) => void
  label: string
  className?: string
}

/**
 * Compact segmented control to switch between the views of one page
 * (e.g. Protocols · Runs · Scheduled). Scrolls horizontally inside its own
 * strip on very narrow screens — never the page.
 */
export function ViewTabs<V extends string>({ tabs, value, onChange, label, className = '' }: ViewTabsProps<V>) {
  return (
    <div className={`max-w-full overflow-x-auto ${className}`}>
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5"
      >
        {tabs.map((tab) => {
          const active = tab.value === value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.value)}
              className={`inline-flex items-center gap-1.5 h-9 md:h-8 px-3 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${focusRing} ${
                active ? 'bg-white/[0.08] text-gray-100' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && <span className="tabular-nums font-normal text-gray-500">{tab.count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
