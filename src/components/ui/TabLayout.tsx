import type { ReactNode } from 'react'

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
  /** Additional className for the content wrapper */
  className?: string
}

/**
 * Unified tab layout with consistent styling.
 * Provides a horizontal tab bar with optional icons and badge counts,
 * followed by a content area.
 *
 * @example
 * <TabLayout
 *   tabs={[
 *     { id: 'overview', label: 'Vue d\'ensemble', icon: <LayoutDashboard /> },
 *     { id: 'tasks', label: 'Tâches', count: 12 },
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
  className,
}: TabLayoutProps) {
  return (
    <div className="flex flex-col min-h-0">
      {/* Tab bar */}
      <div className="border-b border-white/[0.08] shrink-0">
        <nav className="flex gap-1 px-1 -mb-px" role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                disabled={tab.disabled}
                onClick={() => onTabChange(tab.id)}
                className={`
                  inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium
                  border-b-2 transition-colors whitespace-nowrap
                  ${
                    isActive
                      ? 'border-indigo-400 text-gray-100'
                      : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-white/[0.15]'
                  }
                  ${tab.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {tab.icon && (
                  <span className={`w-4 h-4 ${isActive ? 'text-indigo-400' : ''}`}>
                    {tab.icon}
                  </span>
                )}
                {tab.label}
                {tab.count != null && (
                  <span
                    className={`
                      ml-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium leading-none
                      ${isActive ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/[0.06] text-gray-500'}
                    `}
                  >
                    {tab.count}
                  </span>
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
        className={`flex-1 min-h-0 ${className ?? ''}`}
      >
        {children}
      </div>
    </div>
  )
}
