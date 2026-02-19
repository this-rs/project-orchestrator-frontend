import { useState, useEffect, useMemo, useCallback } from 'react'
import { Outlet, NavLink, useLocation, useParams } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Menu, Home, Flag, Box, ClipboardList, CheckCircle2, FileText, Code, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { sidebarCollapsedAtom, chatPanelModeAtom, chatPanelWidthAtom, eventBusStatusAtom, workspacesAtom, activeWorkspaceAtom } from '@/atoms'
import { ToastContainer } from '@/components/ui'
import { ChatPanel } from '@/components/chat'
import { UserMenu } from '@/components/auth/UserMenu'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { useMediaQuery, useCrudEventRefresh, useDragRegion, useWindowFullscreen, useViewTransition } from '@/hooks'
import type { NavDirection } from '@/hooks'
import { isTauri } from '@/services/env'
import { workspacesApi } from '@/services/workspaces'
import { workspacePath } from '@/utils/paths'

function SidebarContent({ collapsed, trafficLightPad, wsSlug, onNavClick }: { collapsed: boolean; trafficLightPad?: boolean; wsSlug: string; onNavClick?: (href: string, direction: NavDirection) => void }) {
  const location = useLocation()
  const navGroups = useMemo(() => [
    {
      label: 'Organize',
      items: [
        { name: 'Overview', href: workspacePath(wsSlug, '/overview'), icon: Home },
        { name: 'Projects', href: workspacePath(wsSlug, '/projects'), icon: Box },
        { name: 'Milestones', href: workspacePath(wsSlug, '/milestones'), icon: Flag },
      ],
    },
    {
      label: 'Plan',
      items: [
        { name: 'Plans', href: workspacePath(wsSlug, '/plans'), icon: ClipboardList },
        { name: 'Tasks', href: workspacePath(wsSlug, '/tasks'), icon: CheckCircle2 },
      ],
    },
    {
      label: 'Knowledge',
      items: [
        { name: 'Notes', href: workspacePath(wsSlug, '/notes'), icon: FileText },
        { name: 'Code', href: workspacePath(wsSlug, '/code'), icon: Code },
      ],
    },
  ], [wsSlug])

  // Flat list of all nav hrefs for direction detection
  const allHrefs = useMemo(
    () => navGroups.flatMap((g) => g.items.map((i) => i.href)),
    [navGroups],
  )

  const handleNavClick = useCallback(
    (e: React.MouseEvent, href: string) => {
      if (!onNavClick) return
      // Don't intercept if already on this page
      if (location.pathname === href || location.pathname.startsWith(href + '/')) return
      e.preventDefault()
      const currentIdx = allHrefs.findIndex(
        (h) => location.pathname === h || location.pathname.startsWith(h + '/'),
      )
      const targetIdx = allHrefs.indexOf(href)
      const direction: NavDirection = targetIdx >= currentIdx ? 'down' : 'up'
      onNavClick(href, direction)
    },
    [onNavClick, allHrefs, location.pathname],
  )

  return (
    <>
      {/* Logo — taller on Tauri (non-fullscreen) to clear native traffic lights */}
      <div className={`flex items-center px-4 transition-all duration-300 ${trafficLightPad ? 'h-[88px] pt-7' : 'h-16'}`}>
        <div className="flex items-center gap-3">
          <img src="/logo-32.png" alt="PO" className="w-8 h-8 rounded-lg" />
          {!collapsed && (
            <span className="font-semibold text-gray-100">Project Orchestrator</span>
          )}
        </div>
      </div>

      {/* Workspace Switcher */}
      <WorkspaceSwitcher collapsed={collapsed} />

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
                      end={item.name === 'Overview'}
                      onClick={(e) => handleNavClick(e, item.href)}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                          isActive
                            ? 'bg-indigo-500/15 text-indigo-400 font-medium border-l-[3px] border-indigo-500 -ml-[3px] glow-primary'
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
    </>
  )
}

export function MainLayout() {
  const { slug: wsSlug } = useParams<{ slug: string }>()
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom)
  const [chatMode, setChatMode] = useAtom(chatPanelModeAtom)
  const [chatWidth] = useAtom(chatPanelWidthAtom)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const isSmUp = useMediaQuery('(min-width: 640px)')
  const chatOpen = chatMode === 'open'
  const chatFullscreen = chatMode === 'fullscreen'
  const wsStatus = useAtomValue(eventBusStatusAtom)
  const isWindowFullscreen = useWindowFullscreen()
  const setWorkspaces = useSetAtom(workspacesAtom)
  const activeWorkspace = useAtomValue(activeWorkspaceAtom)

  // Show extra top padding on Tauri desktop (non-fullscreen) to clear native traffic lights
  const trafficLightPad = isTauri && !isWindowFullscreen

  // Load workspaces list (for the switcher and route guard)
  useEffect(() => {
    workspacesApi
      .list({ limit: 100, sort_by: 'name', sort_order: 'asc' })
      .then((data) => setWorkspaces(data.items || []))
      .catch(() => {})
  }, [setWorkspaces])

  // Connect to WebSocket CRUD event bus and auto-refresh pages
  useCrudEventRefresh()

  // Enable native window dragging on the header bar (Tauri desktop)
  const onDragMouseDown = useDragRegion()

  // Close mobile menu on navigation
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync menu close on route change
    setMobileMenuOpen(false)
  }, [location.pathname])

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [mobileMenuOpen])

  // View transition for sidebar navigation with directional slide
  const { navigate: vtNavigate } = useViewTransition()
  const handleSidebarNav = useCallback(
    (href: string, direction: NavDirection) => {
      vtNavigate(href, { type: 'sidebar-nav', direction })
    },
    [vtNavigate],
  )

  const currentSlug = wsSlug || ''

  return (
    <div className="flex min-h-0 flex-1 bg-surface-base">
      {/* Desktop Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-16' : 'w-64'
        } hidden md:flex flex-col bg-surface-raised border-r border-border-subtle transition-all duration-200`}
        style={{ viewTransitionName: 'sidebar' }}
      >
        <SidebarContent collapsed={collapsed} trafficLightPad={trafficLightPad} wsSlug={currentSlug} onNavClick={handleSidebarNav} />

        {/* User menu + Collapse button */}
        <div className={`border-t border-white/[0.06] p-2 ${collapsed ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1'}`}>
          <UserMenu dropUp showName={!collapsed} />
          {!collapsed && <div className="flex-1" />}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center p-2 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-opacity duration-200 ${
          mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60"
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* Sidebar panel */}
        <aside
          className={`absolute left-0 top-0 bottom-0 w-64 flex flex-col bg-surface-raised border-r border-border-subtle transition-transform duration-200 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarContent collapsed={false} wsSlug={currentSlug} onNavClick={handleSidebarNav} />

          {/* User menu + Close button */}
          <div className="border-t border-white/[0.06] p-2 flex items-center gap-1">
            <UserMenu dropUp showName />
            <div className="flex-1" />
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center p-2 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </aside>
      </div>

      {/* Main content */}
      <main
        className="flex-1 flex flex-col overflow-hidden transition-[margin] duration-300"
        style={{ marginRight: chatOpen && !chatFullscreen && isSmUp ? chatWidth : 0 }}
      >
        {/* Breadcrumb */}
        <header className="h-16 flex items-center px-4 md:px-6 border-b border-border-subtle bg-surface-raised/80 backdrop-blur-sm" style={{ viewTransitionName: 'header' }} onMouseDown={onDragMouseDown}>
          {/* Hamburger button (mobile only) */}
          <button
            className="mr-3 p-2 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors md:hidden"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* WS status dot — before breadcrumb, vertically centered */}
          <span
            className={`w-2 h-2 rounded-full shrink-0 mr-2.5 transition-colors ${
              wsStatus === 'connected'
                ? 'bg-emerald-400'
                : wsStatus === 'reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-gray-600'
            }`}
            title={`WebSocket: ${wsStatus}`}
          />

          <Breadcrumb pathname={location.pathname} workspaceName={activeWorkspace?.name} />

          {/* Chat toggle (only icon in header right) */}
          <div className="ml-auto flex items-center">
            <button
              onClick={() => setChatMode(chatMode === 'closed' ? 'open' : 'closed')}
              className={`p-2 rounded-lg transition-colors ${chatMode !== 'closed' ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'}`}
              title="Toggle chat"
            >
              <MessageCircle className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 md:px-6 pb-2" style={{ viewTransitionName: 'content' }}>
          <div className="flex-1">
            <Outlet />
          </div>

          {/* Branding */}
          <div className="mt-4 text-center text-xs tracking-wide">
            <div className="text-gray-600">Made by</div>
            <div className="text-gray-500">Freedom From Scratch</div>
          </div>
        </div>
      </main>

      <ChatPanel />
      <ToastContainer />
    </div>
  )
}

/**
 * Breadcrumb that handles workspace-scoped URLs.
 * Shows: WorkspaceName > Section > Entity
 *
 * /workspace/my-ws/plans/abc → My Workspace / Plans / abc
 */
function Breadcrumb({ pathname, workspaceName }: { pathname: string; workspaceName?: string }) {
  const parts = pathname.split('/').filter(Boolean)

  // Strip "workspace" and the slug from the display
  const isWorkspaceScoped = parts[0] === 'workspace' && parts.length >= 2
  const displayParts = isWorkspaceScoped ? parts.slice(2) : parts
  const basePath = isWorkspaceScoped ? `/workspace/${parts[1]}` : ''

  // Capitalize and prettify segment names
  const prettyName = (s: string) => {
    // Known section labels
    const labels: Record<string, string> = {
      overview: 'Overview',
      projects: 'Projects',
      plans: 'Plans',
      tasks: 'Tasks',
      notes: 'Notes',
      milestones: 'Milestones',
      code: 'Code',
      'project-milestones': 'Milestones',
      'feature-graphs': 'Feature Graphs',
    }
    return labels[s] || s.charAt(0).toUpperCase() + s.slice(1)
  }

  // Segments whose list page lives at a different route
  const linkOverrides: Record<string, string> = {
    'project-milestones': 'milestones',
    'feature-graphs': 'code',
  }

  return (
    <nav className="flex items-center gap-2 text-sm min-w-0">
      {/* Workspace name as first segment */}
      <NavLink
        to={basePath || '/'}
        className={`shrink-0 truncate max-w-[140px] sm:max-w-[200px] ${displayParts.length === 0 ? 'text-gray-200 font-medium' : 'text-gray-400 hover:text-gray-200'}`}
      >
        {workspaceName || 'Home'}
      </NavLink>
      {/* Ellipsis on mobile for long paths */}
      {displayParts.length > 2 && (
        <span className="flex items-center gap-2 min-w-0 sm:hidden">
          <span className="text-gray-600 shrink-0">/</span>
          <span className="text-gray-500">...</span>
        </span>
      )}
      {displayParts.map((part, index) => {
        const isFirst = index === 0
        const isLast = index === displayParts.length - 1
        const isMiddle = !isFirst && !isLast
        const hideOnMobile = isMiddle && displayParts.length > 2
        const override = linkOverrides[part]
        const fullPath = override
          ? `${basePath}/${override}`
          : `${basePath}/${displayParts.slice(0, index + 1).join('/')}`
        return (
          <span key={`${part}-${index}`} className={`flex items-center gap-2 min-w-0 ${hideOnMobile ? 'hidden sm:flex' : ''}`}>
            <span className="text-gray-600 shrink-0">/</span>
            <NavLink
              to={fullPath}
              className={`truncate max-w-[120px] sm:max-w-[200px] md:max-w-none ${
                isLast
                  ? 'text-gray-200 font-medium'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {prettyName(part)}
            </NavLink>
          </span>
        )
      })}
    </nav>
  )
}

