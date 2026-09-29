import type { ReactNode } from 'react'
import { focusRingInset, pressFeedback } from './classes'

export interface TabItem {
  /** Unique tab identifier */
  id: string
  /** Display label */
  label: string
  /** Optional icon */
  icon?: ReactNode
  /** Optional badge count */
  count?: number
  /** Disable this tab */
  disabled?: boolean
}

interface TabLayoutProps {
  /** Available tabs */
  tabs: TabItem[]
  /** Currently active tab id */
  activeTab: string
  /** Called when user switches tab */
  onTabChange: (tabId: string) => void
  /** Tab panel content */
  children: ReactNode
  /** Accessible name of the tab list (e.g. "Plan sections"). */
  label?: string
  /** Additional className for the content wrapper */
  className?: string
}

/**
 * Page-level tab bar (underline style) followed by the tab panel.
 *
 * The strip scrolls horizontally in its own box on narrow phones — the page
 * never grows wider (DESIGN.md §1 / §7). Tabs are `role=tab` buttons with
 * ids (`tab-<id>`) so the panel (`tabpanel-<id>`) is labelled by them.
 *
 * @example
 * <TabLayout
 *   tabs={[
 *     { id: 'overview', label: 'Overview', icon: <LayoutDashboard /> },
 *     { id: 'tasks', label: 'Tasks', count: 12 },
 *   ]}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * >
 *   {activeTab === 'overview' && <OverviewPanel />}
 *   {activeTab === 'tasks' && <TasksPanel />}
 * </TabLayout>
 */
export function TabLayout({
  tabs,
  activeTab,
  onTabChange,
  children,
  label,
  className,
}: TabLayoutProps) {
  return (
    <div className="flex flex-col min-h-0">
      {/* Tab bar — scrolls in its own strip, never the page */}
      <div className="border-b border-white/[0.08] shrink-0 min-w-0">
        <nav
          className="flex gap-1 -mb-px overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={label}
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                disabled={tab.disabled}
                onClick={() => onTabChange(tab.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 h-10 px-3 text-sm font-medium whitespace-nowrap border-b-2 ${pressFeedback} ${focusRingInset} ${
                  isActive
                    ? 'border-indigo-400 text-gray-100'
                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-white/[0.15]'
                } ${tab.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                {tab.icon && (
                  <span className={`inline-flex [&_svg]:w-4 [&_svg]:h-4 ${isActive ? 'text-indigo-400' : ''}`} aria-hidden="true">
                    {tab.icon}
                  </span>
                )}
                {tab.label}
                {tab.count != null && ' '}
                {tab.count != null && (
                  <span className={`text-[11px] tabular-nums ${isActive ? 'text-indigo-300' : 'text-gray-500'}`}>{tab.count}</span>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Tab panel content */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className={`flex-1 min-h-0 ${className ?? ''}`}
      >
        {children}
      </div>
    </div>
  )
}
