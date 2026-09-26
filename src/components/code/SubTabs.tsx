import type { TabItem } from '@/components/ui'
import { focusRing } from '@/components/ui'
import { pressFeedback } from '@/components/ui/classes'

interface SubTabsProps {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
  label: string
}

/**
 * Secondary segmented tabs inside a Code tab. Scrolls horizontally in its own
 * strip on narrow phones instead of pushing the page wider.
 */
export function SubTabs({ tabs, active, onChange, label }: SubTabsProps) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5 [scrollbar-width:none]">
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm whitespace-nowrap ${pressFeedback} ${focusRing} ${
              selected
                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
