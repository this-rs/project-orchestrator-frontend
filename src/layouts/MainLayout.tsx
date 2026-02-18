import { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAtom, useAtomValue } from 'jotai'
import { NextStepReact } from 'nextstepjs'
import { useReactRouterAdapter } from 'nextstepjs/adapters/react-router'
import {
  sidebarCollapsedAtom,
  chatPanelModeAtom,
  chatPanelWidthAtom,
  eventBusStatusAtom,
  tutorialStateAtom,
} from '@/atoms'
import { ToastContainer } from '@/components/ui'
import { ChatPanel } from '@/components/chat'
import { UserMenu } from '@/components/auth/UserMenu'
import { useMediaQuery, useCrudEventRefresh, useDragRegion, useWindowFullscreen } from '@/hooks'
import { isTauri } from '@/services/env'
import type { Tour } from 'nextstepjs'
import { testTour, mainTour, chatTour, planListTour, planDetailTour, kanbanTour, taskDetailTour, notesTour, codeTour } from '@/tutorial/steps'
import { TutorialButton, TutorialCard, TutorialWelcome } from '@/tutorial/components'
import { useTutorial } from '@/tutorial/hooks'
import { TOUR_NAMES } from '@/tutorial/constants'

// All tours — test tour + main tour; micro-tours added as they are implemented
const allTours: Tour[] = [testTour, mainTour, chatTour, planListTour, planDetailTour, kanbanTour, taskDetailTour, notesTour, codeTour]

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

function SidebarContent({ collapsed, trafficLightPad }: { collapsed: boolean; trafficLightPad?: boolean }) {
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
    </>
  )
}

export function MainLayout() {
  const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom)
  const [chatMode, setChatMode] = useAtom(chatPanelModeAtom)
  const [chatWidth] = useAtom(chatPanelWidthAtom)
  const [, setTutorialState] = useAtom(tutorialStateAtom)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const location = useLocation()
  const { isFirstTimeUser, isNextStepVisible, startTour, skipTour } = useTutorial()
  const isSmUp = useMediaQuery('(min-width: 640px)')
  const chatOpen = chatMode === 'open'
  const chatFullscreen = chatMode === 'fullscreen'
  const wsStatus = useAtomValue(eventBusStatusAtom)
  const isWindowFullscreen = useWindowFullscreen()

  // Show extra top padding on Tauri desktop (non-fullscreen) to clear native traffic lights
  const trafficLightPad = isTauri && !isWindowFullscreen

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

  // ---------------------------------------------------------------------------
  // Welcome modal — auto-show for first-time users
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isFirstTimeUser && !isNextStepVisible) {
      const id = setTimeout(() => setShowWelcome(true), 800)
      return () => clearTimeout(id)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentional mount-only

  const handleWelcomeStart = useCallback(() => {
    setShowWelcome(false)
    // Small delay to let the modal close animation finish
    setTimeout(() => startTour(TOUR_NAMES.MAIN), 250)
  }, [startTour])

  const handleWelcomeDismiss = useCallback(() => {
    setShowWelcome(false)
    skipTour(TOUR_NAMES.MAIN)
  }, [skipTour])

  // ---------------------------------------------------------------------------
  // NextStepjs lifecycle callbacks — persist tour state in Jotai atom
  // ---------------------------------------------------------------------------
  const handleTourComplete = useCallback(
    (tourName: string | null) => {
      if (!tourName) return
      setTutorialState((prev) => ({
        ...prev,
        tours: {
          ...prev.tours,
          [tourName]: {
            completed: true,
            completedAt: new Date().toISOString(),
            skippedAt: null,
          },
        },
      }))
    },
    [setTutorialState],
  )

  const handleTourSkip = useCallback(
    (_step: number, tourName: string | null) => {
      if (!tourName) return
      setTutorialState((prev) => ({
        ...prev,
        tours: {
          ...prev.tours,
          [tourName]: {
            completed: false,
            completedAt: null,
            skippedAt: new Date().toISOString(),
          },
        },
      }))
    },
    [setTutorialState],
  )

  return (
    <NextStepReact
      steps={allTours}
      navigationAdapter={useReactRouterAdapter}
      cardComponent={TutorialCard}
      shadowRgb="0, 0, 0"
      shadowOpacity="0.6"
      onComplete={handleTourComplete}
      onSkip={handleTourSkip}
      disableConsoleLogs
    >
    <div className="flex min-h-0 flex-1 bg-[#0f1117]">
      {/* Desktop Sidebar */}
      <aside
        data-tour="sidebar-nav"
        className={`${
          collapsed ? 'w-16' : 'w-64'
        } hidden md:flex flex-col bg-[#1a1d27] border-r border-white/[0.06] transition-all duration-200`}
      >
        <SidebarContent collapsed={collapsed} trafficLightPad={trafficLightPad} />

        {/* User menu + Collapse button */}
        <div className={`border-t border-white/[0.06] p-2 ${collapsed ? 'flex flex-col items-center gap-1' : 'flex items-center gap-1'}`}>
          <UserMenu dropUp showName={!collapsed} />
          {!collapsed && <div className="flex-1" />}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center p-2 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            {collapsed ? (
              <ChevronRightIcon className="w-5 h-5" />
            ) : (
              <ChevronLeftIcon className="w-5 h-5" />
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
          className={`absolute left-0 top-0 bottom-0 w-64 flex flex-col bg-[#1a1d27] border-r border-white/[0.06] transition-transform duration-200 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarContent collapsed={false} />

          {/* User menu + Close button */}
          <div className="border-t border-white/[0.06] p-2 flex items-center gap-1">
            <UserMenu dropUp showName />
            <div className="flex-1" />
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center p-2 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors"
            >
              <ChevronLeftIcon className="w-5 h-5" />
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
        <header data-tour="header-breadcrumb" className="h-16 flex items-center px-4 md:px-6 border-b border-white/[0.06] bg-[#1a1d27]/80 backdrop-blur-sm" onMouseDown={onDragMouseDown}>
          {/* Hamburger button (mobile only) */}
          <button
            className="mr-3 p-2 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] rounded-lg transition-colors md:hidden"
            onClick={() => setMobileMenuOpen(true)}
          >
            <HamburgerIcon className="w-5 h-5" />
          </button>

          {/* WS status dot — before breadcrumb, vertically centered */}
          <span
            data-tour="ws-status"
            className={`w-2 h-2 rounded-full shrink-0 mr-2.5 transition-colors ${
              wsStatus === 'connected'
                ? 'bg-emerald-400'
                : wsStatus === 'reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-gray-600'
            }`}
            title={`WebSocket: ${wsStatus}`}
          />

          <Breadcrumb pathname={location.pathname} />

          {/* Chat toggle (only icon in header right) */}
          <div className="ml-auto flex items-center gap-1">
            <TutorialButton />
            <button
              data-tour="chat-toggle"
              onClick={() => setChatMode(chatMode === 'closed' ? 'open' : 'closed')}
              className={`p-2 rounded-lg transition-colors ${chatMode !== 'closed' ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'}`}
              title="Toggle chat"
            >
              <ChatIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div data-tour="main-content" className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-6 pb-6">
          <Outlet />

          {/* Branding */}
          <div className="py-8 text-center text-xs tracking-wide">
            <div className="text-gray-600">Made by</div>
            <div className="text-gray-500">Freedom From Scratch</div>
          </div>
        </div>
      </main>

      <ChatPanel />
      <ToastContainer />
      <TutorialWelcome
        open={showWelcome}
        onStartTour={handleWelcomeStart}
        onDismiss={handleWelcomeDismiss}
      />
    </div>
    </NextStepReact>
  )
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const parts = pathname.split('/').filter(Boolean)

  return (
    <nav className="flex items-center gap-2 text-sm min-w-0">
      <NavLink to="/" className="text-gray-400 hover:text-gray-200 shrink-0">
        Home
      </NavLink>
      {parts.length > 2 && (
        <span className="flex items-center gap-2 min-w-0 sm:hidden">
          <span className="text-gray-600 shrink-0">/</span>
          <span className="text-gray-500">...</span>
        </span>
      )}
      {parts.map((part, index) => {
        const isFirst = index === 0
        const isLast = index === parts.length - 1
        const isMiddle = !isFirst && !isLast
        const hideOnMobile = isMiddle && parts.length > 2
        return (
          <span key={`${part}-${index}`} className={`flex items-center gap-2 min-w-0 ${hideOnMobile ? 'hidden sm:flex' : ''}`}>
            <span className="text-gray-600 shrink-0">/</span>
            <NavLink
              to={`/${parts.slice(0, index + 1).join('/')}`}
              className={`truncate max-w-[120px] sm:max-w-[200px] md:max-w-none ${
                isLast
                  ? 'text-gray-200 font-medium'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {part.charAt(0).toUpperCase() + part.slice(1)}
            </NavLink>
          </span>
        )
      })}
    </nav>
  )
}

// Icons
function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

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

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}
