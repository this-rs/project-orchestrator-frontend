import type { TabItem } from '@/components/ui'
import { focusRing, focusRingInset } from '@/components/ui'
import { pressFeedback } from '@/components/ui/classes'

interface SubTabsProps {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
  /** Accessible name of the tab list. */
  label: string
  /**
   * `pills` (default): segmented buttons for secondary tabs inside a section.
   * `underline`: page-level tab bar (same look as the frozen `TabLayout`,
   * but the strip scrolls horizontally on narrow phones instead of pushing
   * the page wider).
   */
  variant?: 'pills' | 'underline'
  className?: string
}

/**
 * Horizontal tab strip that scrolls in its own box on phones. Composed here
 * because `TabLayout` (frozen) has no horizontal overflow handling.
 */
export function SubTabs({ tabs, active, onChange, label, variant = 'pills', className = '' }: SubTabsProps) {
  const underline = variant === 'underline'
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        underline ? 'gap-1 border-b border-white/[0.08]' : 'gap-1.5 -mx-1 px-1 pb-0.5'
      } ${className}`}
    >
      {tabs.map((tab) => {
        const selected = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={underline ? `tabpanel-${tab.id}` : undefined}
            id={underline ? `tab-${tab.id}` : undefined}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            className={
              underline
                ? `shrink-0 inline-flex items-center gap-1.5 h-10 px-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${pressFeedback} ${focusRingInset} ${
                    selected
                      ? 'border-indigo-400 text-gray-100'
                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-white/[0.15]'
                  } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`
                : `shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm whitespace-nowrap ${pressFeedback} ${focusRing} ${
                    selected
                      ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                      : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:text-gray-200'
                  } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`
            }
          >
            {tab.icon && (
              <span className={`inline-flex [&_svg]:w-4 [&_svg]:h-4 ${underline && selected ? 'text-indigo-400' : ''}`} aria-hidden="true">
                {tab.icon}
              </span>
            )}
            {tab.label}
            {tab.count != null && <span className="text-[11px] tabular-nums text-gray-500">{tab.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
