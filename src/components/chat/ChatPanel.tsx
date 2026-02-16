import { useAtom } from 'jotai'
import { chatPanelModeAtom, chatPanelWidthAtom, chatScrollToTurnAtom, chatPermissionConfigAtom } from '@/atoms'
import { useChat, useWindowFullscreen } from '@/hooks'
import { ChatMessages } from './ChatMessages'
import { ChatInput, type PrefillPayload } from './ChatInput'
import { CompactionBanner } from './CompactionBanner'
import { SessionList } from './SessionList'
import { ProjectSelect } from './ProjectSelect'
import { PermissionSettingsPanel } from './PermissionSettingsPanel'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { Link } from 'react-router-dom'
import type { Project } from '@/types'
import { isTauri } from '@/services/env'
import { chatApi } from '@/services/chat'

const MIN_WIDTH = 320
const MAX_WIDTH = 800
const MOBILE_BREAKPOINT = 768

/** Small dot indicator for WebSocket status */
function WsStatusDot({ status }: { status: string }) {
  if (status === 'connected') {
    return <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Connected" />
  }
  if (status === 'reconnecting' || status === 'connecting') {
    return <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" title="Reconnecting..." />
  }
  // disconnected or unknown — only show when there's a session
  return <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" title="Disconnected" />
}

export function ChatPanel() {
  const [mode, setMode] = useAtom(chatPanelModeAtom)
  const [panelWidth, setPanelWidth] = useAtom(chatPanelWidthAtom)
  const [showSessions, setShowSessions] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [prefill, setPrefill] = useState<PrefillPayload | null>(null)
  const chat = useChat()
  const panelRef = useRef<HTMLDivElement>(null)
  const setScrollToTurn = useSetAtom(chatScrollToTurnAtom)
  const permissionConfig = useAtomValue(chatPermissionConfigAtom)
  const setPermissionConfig = useSetAtom(chatPermissionConfigAtom)

  // Load permission config from server on mount (so ChatInput has the correct default mode)
  useEffect(() => {
    if (permissionConfig) return // Already loaded (e.g. from PermissionSettingsPanel)
    let cancelled = false
    chatApi.getPermissionConfig().then((config) => {
      if (!cancelled) setPermissionConfig(config)
    }).catch(() => {
      // Non-critical — ChatInput will fallback to 'default'
    })
    return () => { cancelled = true }
  }, [permissionConfig, setPermissionConfig])

  // Mode-based color for gear icon badge
  const modeColor = permissionConfig
    ? { bypassPermissions: 'bg-emerald-400', acceptEdits: 'bg-blue-400', default: 'bg-amber-400', plan: 'bg-gray-400' }[permissionConfig.mode] || 'bg-gray-400'
    : null

  const isOpen = mode !== 'closed'
  const isFullscreen = mode === 'fullscreen'
  const isNewConversation = !chat.sessionId && !chat.isSending
  const isWindowFullscreen = useWindowFullscreen()

  // Show extra top padding on Tauri desktop (non-fullscreen) to clear native traffic lights
  const trafficLightPad = isTauri && !isWindowFullscreen

  // Detect mobile viewport
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      // Close mobile sidebar when switching to desktop
      if (!e.matches) setShowMobileSidebar(false)
    }
    // Sync initial value via the same callback path
    handler({ matches: mql.matches } as MediaQueryListEvent)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Reset session title when sessionId is cleared
  useEffect(() => {
    if (!chat.sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync title reset on session clear
      setSessionTitle(null)
    }
  }, [chat.sessionId])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX
      setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)))
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, setPanelWidth])

  const handleSend = (text: string) => {
    if (isNewConversation && !selectedProject) return
    chat.sendMessage(
      text,
      isNewConversation
        ? { cwd: selectedProject!.root_path, projectSlug: selectedProject!.slug }
        : undefined,
    )
  }

  const handleContinue = () => {
    chat.sendMessage('Continue')
  }

  /** Quick action from welcome screen → prefill the textarea */
  const handleQuickAction = useCallback((prompt: string, cursorOffset?: number) => {
    // Create a new object reference each time to re-trigger the useEffect in ChatInput
    setPrefill({ text: prompt, cursorOffset })
  }, [])

  const handleNewSession = () => {
    chat.newSession()
    setSelectedProject(null)
    setSessionTitle(null)
    setShowSessions(false)
  }

  const handleSelectSession = (sessionId: string, targetTurnIndex?: number, title?: string) => {
    setScrollToTurn(targetTurnIndex ?? null)
    chat.loadSession(sessionId)
    setSessionTitle(title ?? null)
    if (!isFullscreen) {
      setShowSessions(false)
    }
    // Close mobile sidebar overlay on selection
    if (isMobile) {
      setShowMobileSidebar(false)
    }
  }

  // Determine header title
  const headerTitle = isNewConversation
    ? 'New Chat'
    : sessionTitle || 'Chat'

  // --- FULLSCREEN LAYOUT: sidebar + conversation side by side ---
  // On mobile (<768px): sidebar is a full-screen overlay toggled via hamburger
  // On desktop: sidebar is a permanent 288px column
  if (isFullscreen) {
    return (
      <div
        ref={panelRef}
        className={`fixed inset-0 z-30 bg-[#1a1d27] flex ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'} ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Left sidebar — hidden on mobile, permanent on desktop */}
        {/* Desktop: static sidebar */}
        <div className="hidden md:flex w-72 shrink-0 border-r border-white/[0.06] flex-col">
          {/* Sidebar header — taller on Tauri (non-fullscreen) to clear traffic lights */}
          <div className={`flex items-center justify-between px-4 shrink-0 ${trafficLightPad ? 'h-[88px] pt-7' : 'h-14'}`}>
            <span className="text-sm font-medium text-gray-300">Conversations</span>
            <button
              onClick={handleNewSession}
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
              title="New conversation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <SessionList
            activeSessionId={chat.sessionId}
            onSelect={handleSelectSession}
            onClose={() => {}} // no-op in fullscreen desktop
            embedded
          />
        </div>

        {/* Mobile: full-screen overlay sidebar */}
        {isMobile && showMobileSidebar && (
          <div className="fixed inset-0 z-40 flex flex-col bg-[#1a1d27]">
            {/* Mobile sidebar header — taller on Tauri (non-fullscreen) to clear traffic lights */}
            <div className={`flex items-center justify-between px-4 shrink-0 ${trafficLightPad ? 'h-[88px] pt-7' : 'h-14'}`}>
              <span className="text-sm font-medium text-gray-300">Conversations</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
                  title="Back to chat"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* New conversation button */}
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <button
                onClick={() => { handleNewSession(); setShowMobileSidebar(false) }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New conversation
              </button>
            </div>

            <SessionList
              activeSessionId={chat.sessionId}
              onSelect={handleSelectSession}
              onClose={() => setShowMobileSidebar(false)}
              embedded
            />
          </div>
        )}

        {/* Right side — conversation (full width on mobile) */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Conversation header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0">
            <div className="min-w-0 flex items-center gap-2">
              {/* Mobile: hamburger to toggle sidebar */}
              <button
                onClick={() => isMobile ? setShowMobileSidebar(true) : undefined}
                className={`shrink-0 p-1.5 rounded-md transition-colors md:hidden ${showMobileSidebar ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
                title="Sessions"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              {!isNewConversation && <WsStatusDot status={chat.wsStatus} />}
              <div className="min-w-0">
                <span className="text-sm font-medium text-gray-300 truncate block">
                  {headerTitle}
                </span>
                {!isNewConversation && chat.sessionMeta?.projectSlug && (
                  <Link
                    to={`/projects/${chat.sessionMeta.projectSlug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 truncate block transition-colors"
                  >
                    {chat.sessionMeta.projectSlug}
                  </Link>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewSession}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors md:hidden"
                title="New chat"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {/* Permission settings gear icon */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`relative p-1.5 rounded-md transition-colors ${showSettings ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
                title="Permission settings"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a7.723 7.723 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {modeColor && (
                  <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${modeColor} ring-1 ring-[#1a1d27]`} />
                )}
              </button>
              <button
                onClick={() => setMode('open')}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
                title="Exit fullscreen"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0v5m0-5h5m6 6l5 5m0 0v-5m0 5h-5" />
                </svg>
              </button>
              <button
                onClick={() => setMode('closed')}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Reconnecting / Disconnected banner */}
          {!isNewConversation && chat.wsStatus === 'reconnecting' && (
            <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-1.5">
              <svg className="w-3 h-3 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Reconnecting...</span>
            </div>
          )}
          {!isNewConversation && chat.wsStatus === 'disconnected' && chat.sessionId && (
            <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center gap-1.5">
              <span>Connection lost</span>
            </div>
          )}

          {/* Settings panel overlay */}
          {showSettings ? (
            <PermissionSettingsPanel onClose={() => setShowSettings(false)} />
          ) : (
            <>
              {/* Project selector — only for new conversations */}
              {isNewConversation && (
                <ProjectSelect
                  value={selectedProject?.id || null}
                  onChange={setSelectedProject}
                />
              )}

              <ChatMessages
                messages={chat.messages}
                isStreaming={chat.isStreaming}
                isLoadingHistory={chat.isLoadingHistory}
                isReplaying={chat.isReplaying}
                hasOlderMessages={chat.hasOlderMessages}
                isLoadingOlder={chat.isLoadingOlder}
                onLoadOlder={chat.loadOlderMessages}
                onRespondPermission={chat.respondPermission}
                onRespondInput={chat.respondInput}
                onContinue={handleContinue}
                onQuickAction={handleQuickAction}
                onSelectSession={handleSelectSession}
                selectedProject={selectedProject}
              />
              <CompactionBanner visible={chat.isCompacting} />
              <ChatInput
                onSend={handleSend}
                onInterrupt={chat.interrupt}
                isStreaming={chat.isStreaming}
                disabled={isNewConversation && !selectedProject}
                sessionId={chat.sessionId}
                onChangePermissionMode={chat.changePermissionMode}
                onChangeModel={chat.changeModel}
                prefill={prefill}
              />
            </>
          )}
        </div>
      </div>
    )
  }

  // --- PANEL LAYOUT (non-fullscreen): toggle-based session list ---
  return (
    <div
      ref={panelRef}
      className={`fixed z-30 bg-[#1a1d27] border-l border-white/[0.06] flex flex-col ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'} ${isOpen ? 'translate-x-0' : 'translate-x-full'} top-0 right-0 bottom-0 w-full`}
      style={{ maxWidth: isMobile ? undefined : panelWidth }}
    >
      {/* Resize handle — hidden on mobile (panel takes full width) */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-indigo-500/40 transition-colors hidden md:block ${isDragging ? 'bg-indigo-500/50' : ''}`}
      />

      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => { setShowSessions(!showSessions); setShowSettings(false) }}
            className={`shrink-0 p-1.5 rounded-md transition-colors ${showSessions ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
            title="Sessions"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex items-center gap-1.5">
            {/* WS status dot — only show when connected to a session */}
            {!isNewConversation && <WsStatusDot status={chat.wsStatus} />}
            <div className="min-w-0">
              <span className="text-sm font-medium text-gray-300 truncate block">
                {headerTitle}
              </span>
              {!isNewConversation && chat.sessionMeta?.projectSlug && (
                <Link
                  to={`/projects/${chat.sessionMeta.projectSlug}`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 truncate block transition-colors"
                >
                  {chat.sessionMeta.projectSlug}
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewSession}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            title="New chat"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {/* Permission settings gear icon */}
          <button
            onClick={() => { setShowSettings(!showSettings); setShowSessions(false) }}
            className={`relative p-1.5 rounded-md transition-colors ${showSettings ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
            title="Permission settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a7.723 7.723 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {modeColor && (
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${modeColor} ring-1 ring-[#1a1d27]`} />
            )}
          </button>
          <button
            onClick={() => setMode('fullscreen')}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors hidden md:flex"
            title="Fullscreen"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
            </svg>
          </button>
          <button
            onClick={() => setMode('closed')}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Reconnecting / Disconnected banner */}
      {!isNewConversation && chat.wsStatus === 'reconnecting' && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-1.5">
          <svg className="w-3 h-3 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Reconnecting...</span>
        </div>
      )}
      {!isNewConversation && chat.wsStatus === 'disconnected' && chat.sessionId && (
        <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center gap-1.5">
          <span>Connection lost</span>
        </div>
      )}

      {/* Content */}
      {showSettings ? (
        <PermissionSettingsPanel onClose={() => setShowSettings(false)} />
      ) : showSessions ? (
        <SessionList
          activeSessionId={chat.sessionId}
          onSelect={handleSelectSession}
          onClose={() => setShowSessions(false)}
        />
      ) : (
        <>
          {/* Project selector — only for new conversations */}
          {isNewConversation && (
            <ProjectSelect
              value={selectedProject?.id || null}
              onChange={setSelectedProject}
            />
          )}

          <ChatMessages
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            isLoadingHistory={chat.isLoadingHistory}
            isReplaying={chat.isReplaying}
            hasOlderMessages={chat.hasOlderMessages}
            isLoadingOlder={chat.isLoadingOlder}
            onLoadOlder={chat.loadOlderMessages}
            onRespondPermission={chat.respondPermission}
            onRespondInput={chat.respondInput}
            onContinue={handleContinue}
            onQuickAction={handleQuickAction}
            onSelectSession={handleSelectSession}
            selectedProject={selectedProject}
          />
          <CompactionBanner visible={chat.isCompacting} />
          <ChatInput
            onSend={handleSend}
            onInterrupt={chat.interrupt}
            isStreaming={chat.isStreaming}
            disabled={isNewConversation && !selectedProject}
            sessionId={chat.sessionId}
            onChangePermissionMode={chat.changePermissionMode}
            onChangeModel={chat.changeModel}
            prefill={prefill}
          />
        </>
      )}
    </div>
  )
}
