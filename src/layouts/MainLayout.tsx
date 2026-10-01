import { useState, useEffect, useMemo, useCallback, useContext } from 'react'
import { Outlet, NavLink, useLocation, useParams } from 'react-router-dom'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Menu, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { NOMENCLATURE, NAV_GROUPS, segmentLabel, entityNoun } from '@/constants/nomenclature'
import { sidebarCollapsedAtom, breadcrumbTitleAtom, chatPanelModeAtom, chatPanelWidthAtom, eventBusStatusAtom, workspacesAtom, workspaceRefreshAtom } from '@/atoms'
import { ToastContainer, Branding } from '@/components/ui'
import { ChatPanel } from '@/components/chat'
import { UserMenu } from '@/components/auth/UserMenu'
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher'
import { useMediaQuery, useCrudEventRefresh, useModelCatalogEvents, useDragRegion, useWindowFullscreen, useViewTransition, useWorkspace, ChromeWorkspaceSlugContext } from '@/hooks'
import type { NavDirection } from '@/hooks'
import { isTauri } from '@/services/env'
import { workspacesApi } from '@/services/workspaces'
import { workspacePath } from '@/utils/paths'
import type { Project } from '@/types'

/** Cross-workspace entry of Today; the sidebar's Today item stays lit on it. */
const GLOBAL_TODAY_PATH = '/today'

function SidebarContent({ collapsed, trafficLightPad, wsSlug, onNavClick }: { collapsed: boolean; trafficLightPad?: boolean; wsSlug: string; onNavClick?: (href: string, direction: NavDirection) => void }) {
  const location = useLocation()
  const [projects, setProjects] = useState<Project[]>([])

  // Load projects for the workspace (for sidebar sub-items)
  useEffect(() => {
    if (!wsSlug) return
    const controller = new AbortController()
    workspacesApi
      .listProjects(wsSlug, controller.signal)
      .then((data) => setProjects(data))
      .catch((err) => {
        if (err?.name === 'AbortError') return
        setProjects([])
      })
    return () => controller.abort()
  }, [wsSlug])

  const navGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        label: group.label,
        items: group.items.map((key) => {
          const concept = NOMENCLATURE[key]
          return {
            key,
            name: concept.plural,
            href: workspacePath(wsSlug, `/${concept.segment}`),
            icon: concept.icon,
          }
        }),
      })),
    [wsSlug],
  )

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

  // Check if Projects section is active (for showing sub-items)
  const projectsHref = workspacePath(wsSlug, '/projects')
  const isProjectsActive = location.pathname === projectsHref || location.pathname.startsWith(projectsHref + '/')

  return (
    <>
      {/* Workspace Switcher (logo + workspace name) */}
      <WorkspaceSwitcher collapsed={collapsed} trafficLightPad={trafficLightPad} />

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
                  <li key={item.key}>
                    <NavLink
                      to={item.href}
                      end={item.key === 'overview' || item.key === 'projects'}
                      onClick={(e) => handleNavClick(e, item.href)}
                      aria-label={collapsed ? item.name : undefined}
                      title={collapsed ? item.name : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
                          isActive || (item.key === 'projects' && isProjectsActive) || (item.key === 'today' && location.pathname === GLOBAL_TODAY_PATH)
                            ? 'bg-indigo-500/15 text-indigo-400 font-medium border-l-[3px] border-indigo-500 -ml-[3px] glow-primary'
                            : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-200'
                        }`
                      }
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {!collapsed && <span>{item.name}</span>}
                    </NavLink>

                    {/* Project sub-items — shown when Projects is active */}
                    {item.key === 'projects' && isProjectsActive && !collapsed && projects.length > 0 && (
                      <ul className="mt-1 ml-5 space-y-0.5 border-l border-white/[0.06] pl-3">
                        {projects.map((project) => (
                          <li key={project.id}>
                            <NavLink
                              to={workspacePath(wsSlug, `/projects/${project.slug}`)}
                              className={({ isActive }) =>
                                `block px-2 py-1.5 rounded-md text-xs transition-colors truncate ${
                                  isActive
                                    ? 'text-indigo-400 bg-indigo-500/10 font-medium'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]'
                                }`
                              }
                            >
                              {project.name}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    )}
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
  const { slug: urlSlug } = useParams<{ slug: string }>()
  // Cross-workspace pages (/today) have no :slug: the sidebar and chat use the
  // chrome slug, but the breadcrumb must not claim a workspace.
  const chromeSlug = useContext(ChromeWorkspaceSlugContext)
  const wsSlug = urlSlug ?? chromeSlug ?? undefined
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
  const activeWorkspace = useWorkspace()
  const breadcrumbWorkspaceName = urlSlug ? activeWorkspace?.name : undefined
  const wsRefresh = useAtomValue(workspaceRefreshAtom)

  // Show extra top padding on Tauri desktop (non-fullscreen) to clear native traffic lights
  const trafficLightPad = isTauri && !isWindowFullscreen

  // Load workspaces list (for the switcher and route guard)
  // Re-fetches when wsRefresh bumps (CRUD event via WebSocket)
  useEffect(() => {
    const controller = new AbortController()
    workspacesApi
      .list({ limit: 100, sort_by: 'name', sort_order: 'asc' }, controller.signal)
      .then((data) => setWorkspaces(data.items || []))
      .catch((err) => {
        if (err?.name === 'AbortError') return
      })
    return () => controller.abort()
  }, [setWorkspaces, wsRefresh])

  // Connect to WebSocket CRUD event bus and auto-refresh pages
  useCrudEventRefresh()
  useModelCatalogEvents()

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

          <Breadcrumb pathname={location.pathname} workspaceName={breadcrumbWorkspaceName} />

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
            {/* Key on slug forces page remount on workspace switch,
                clearing all stale useState (workspace data, loading flags, etc.).
                Sidebar + ChatPanel stay mounted — only the page resets. */}
            <Outlet key={currentSlug} />
          </div>

          {/* Branding */}
          <Branding className="mt-4" />
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
 * /workspace/my-ws/plans/abc → My Workspace / Plans / Auth flow (title published by PageHeader)
 */
export function Breadcrumb({ pathname, workspaceName }: { pathname: string; workspaceName?: string }) {
  const parts = pathname.split('/').filter(Boolean)

  // Strip "workspace" and the slug from the display
  const isWorkspaceScoped = parts[0] === 'workspace' && parts.length >= 2
  const displayParts = isWorkspaceScoped ? parts.slice(2) : parts
  const basePath = isWorkspaceScoped ? `/workspace/${parts[1]}` : ''

  // Title published by the detail page's PageHeader (see breadcrumbTitleAtom).
  const published = useAtomValue(breadcrumbTitleAtom)
  const entityTitle = published && published.pathname === pathname ? published.title : null
  const lastIdIndex = displayParts.reduce((acc, p, i) => (segmentLabel(p) ? acc : i), -1)

  // Names come from the nomenclature registry; anything else is an entity id.
  const prettyName = (part: string, index: number) => {
    const known = segmentLabel(part)
    if (known) return known
    if (index === lastIdIndex && entityTitle) return entityTitle
    return (index > 0 ? entityNoun(displayParts[index - 1]) : null) ?? 'Details'
  }

  // Segments whose list page lives at a different route
  const linkOverrides: Record<string, string> = {
    'project-milestones': 'milestones',
    'feature-graphs': 'feature-graphs',
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
              {prettyName(part, index)}
            </NavLink>
          </span>
        )
      })}
    </nav>
  )
}

