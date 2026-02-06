import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAtom } from 'jotai'
import { sidebarCollapsedAtom } from '@/atoms'
import { ToastContainer } from '@/components/ui'

const navGroups = [
  {
    label: 'Organize',
    items: [
      { name: 'Workspaces', href: '/workspaces', icon: FolderIcon },
      { name: 'Projects', href: '/projects', icon: CubeIcon },
      { name: 'Milestones', href: '/milestones', icon: FlagIcon },
    ],
  },
  {
    label: 'Plan',
    items: [
      { name: 'Plans', href: '/plans', icon: ClipboardIcon },
      { name: 'Tasks', href: '/tasks', icon: CheckCircleIcon },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { name: 'Notes', href: '/notes', icon: DocumentIcon },
      { name: 'Code', href: '/code', icon: CodeIcon },
    ],
  },
]

export function MainLayout() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom)
  const location = useLocation()

  return (
    <div className="flex h-screen bg-[#0f1117]">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-64'
        } flex flex-col bg-[#1a1d27] border-r border-white/[0.06] transition-all duration-200`}
      >
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white font-bold">PO</span>
            </div>
            {!collapsed && (
              <span className="font-semibold text-gray-100">Project Orchestrator</span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="space-y-5 px-2">
            {navGroups.map((group) => (
              <div key={group.label}>
                {collapsed ? (
                  <div className="h-px bg-white/[0.06] mx-2 mb-2" />
                ) : (
                  <div className="text-[10px] uppercase tracking-widest text-gray-500 px-3 mb-1.5">
                    {group.label}
                  </div>
                )}
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.name}>
                      <NavLink
                        to={item.href}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                            isActive
                              ? 'bg-indigo-500/15 text-indigo-400 font-medium border-l-[3px] border-indigo-500 -ml-[3px]'
                              : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
                          }`
                        }
                      >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        {!collapsed && <span>{item.name}</span>}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Collapse button */}
        <div className="p-4 border-t border-white/[0.06]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            {collapsed ? (
              <ChevronRightIcon className="w-5 h-5" />
            ) : (
              <ChevronLeftIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Breadcrumb */}
        <header className="h-16 flex items-center px-6 border-b border-white/[0.06] bg-[#1a1d27]/80 backdrop-blur-sm">
          <Breadcrumb pathname={location.pathname} />
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </div>
      </main>

      <ToastContainer />
    </div>
  )
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const parts = pathname.split('/').filter(Boolean)

  return (
    <nav className="flex items-center gap-2 text-sm">
      <NavLink to="/" className="text-gray-400 hover:text-gray-200">
        Home
      </NavLink>
      {parts.map((part, index) => (
        <span key={part} className="flex items-center gap-2">
          <span className="text-gray-600">/</span>
          <NavLink
            to={`/${parts.slice(0, index + 1).join('/')}`}
            className={
              index === parts.length - 1
                ? 'text-gray-200 font-medium'
                : 'text-gray-400 hover:text-gray-200'
            }
          >
            {part.charAt(0).toUpperCase() + part.slice(1)}
          </NavLink>
        </span>
      ))}
    </nav>
  )
}

// Icons
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  )
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
    </svg>
  )
}

function CubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  )
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
}
