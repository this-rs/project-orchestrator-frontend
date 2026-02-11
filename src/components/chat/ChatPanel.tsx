import { useAtom } from 'jotai'
import { chatPanelModeAtom, chatPanelWidthAtom, chatScrollToTurnAtom } from '@/atoms'
import { useChat } from '@/hooks'
import { ChatMessages } from './ChatMessages'
import { ChatInput } from './ChatInput'
import { SessionList } from './SessionList'
import { ProjectSelect } from './ProjectSelect'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useSetAtom } from 'jotai'
import type { Project } from '@/types'

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
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const chat = useChat()
  const panelRef = useRef<HTMLDivElement>(null)
  const setScrollToTurn = useSetAtom(chatScrollToTurnAtom)

  const isOpen = mode !== 'closed'
  const isFullscreen = mode === 'fullscreen'
  const isNewConversation = !chat.sessionId && !chat.isSending

  // Detect mobile viewport
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    setIsMobile(mql.matches)
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
      // Close mobile sidebar when switching to desktop
      if (!e.matches) setShowMobileSidebar(false)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Fetch session title when sessionId changes
  useEffect(() => {
    if (!chat.sessionId) {
      setSessionTitle(null)
      return
    }
    // We'll get the title from the session list's onSelect callback
    // For now set a default, it will be updated by handleSelectSession
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
          {/* Sidebar header */}
          <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0">
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
            {/* Mobile sidebar header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0">
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
              <span className="text-sm font-medium text-gray-300 truncate">
                {headerTitle}
              </span>
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
          />
          <ChatInput
            onSend={handleSend}
            onInterrupt={chat.interrupt}
            isStreaming={chat.isStreaming}
            disabled={isNewConversation && !selectedProject}
          />
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
            onClick={() => setShowSessions(!showSessions)}
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
              {!isNewConversation && selectedProject && (
                <span className="text-[10px] text-gray-500 truncate block">
                  {selectedProject.name}
                </span>
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
      {showSessions ? (
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
          />
          <ChatInput
            onSend={handleSend}
            onInterrupt={chat.interrupt}
            isStreaming={chat.isStreaming}
            disabled={isNewConversation && !selectedProject}
          />
        </>
      )}
    </div>
  )
}
