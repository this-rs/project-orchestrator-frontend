import { useAtom } from 'jotai'
import { chatPanelModeAtom, chatPanelWidthAtom, chatScrollToTurnAtom, chatPermissionConfigAtom, chatSelectedProjectAtom, chatAllProjectsModeAtom, activeWorkspaceSlugAtom } from '@/atoms'
import { useChat, useWindowFullscreen } from '@/hooks'
import { Plus, X, Menu, Settings, Minimize2, Maximize2, Loader2 } from 'lucide-react'
import { ChatMessages } from './ChatMessages'
import { ChatInput, type PrefillPayload } from './ChatInput'
import { CompactionBanner } from './CompactionBanner'
import { SessionList } from './SessionList'
import { ProjectSelect } from './ProjectSelect'
import { PermissionSettingsPanel } from './PermissionSettingsPanel'
import { useState, useCallback, useRef, useEffect } from 'react'
import { useSetAtom, useAtomValue } from 'jotai'
import { Link } from 'react-router-dom'
import { isTauri } from '@/services/env'
import { workspacePath } from '@/utils/paths'

const MIN_WIDTH = 320
const MAX_WIDTH = 800
const MOBILE_BREAKPOINT = 768
const NOOP = () => {}

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
  const selectedProject = useAtomValue(chatSelectedProjectAtom)
  const allProjectsMode = useAtomValue(chatAllProjectsModeAtom)
  const activeWsSlug = useAtomValue(activeWorkspaceSlugAtom)
  const [isDragging, setIsDragging] = useState(false)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [prefill, setPrefill] = useState<PrefillPayload | null>(null)
  const chat = useChat()
  const panelRef = useRef<HTMLDivElement>(null)
  const setScrollToTurn = useSetAtom(chatScrollToTurnAtom)
  const permissionConfig = useAtomValue(chatPermissionConfigAtom)
  // Note: permission config is fetched by ChatInput (which owns the write)

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

  // Whether the user has selected a valid context for new conversations
  const hasContext = !!selectedProject || (allProjectsMode && !!activeWsSlug)

  const handleSend = useCallback((text: string) => {
    if (isNewConversation && !hasContext) return
    if (!isNewConversation) {
      chat.sendMessage(text)
      return
    }
    if (selectedProject) {
      // When allProjectsMode → send workspaceSlug (adds all project dirs)
      // When single project → send only projectSlug (no extra dirs)
      chat.sendMessage(text, {
        cwd: selectedProject.root_path,
        workspaceSlug: allProjectsMode ? (activeWsSlug || undefined) : undefined,
        projectSlug: allProjectsMode ? undefined : selectedProject.slug,
      })
    }
  }, [isNewConversation, hasContext, selectedProject, allProjectsMode, activeWsSlug, chat.sendMessage])

  const handleContinue = useCallback(() => {
    chat.sendContinue()
  }, [chat.sendContinue])

  /** Quick action from welcome screen → prefill the textarea */
  const handleQuickAction = useCallback((prompt: string, cursorOffset?: number) => {
    // Create a new object reference each time to re-trigger the useEffect in ChatInput
    setPrefill({ text: prompt, cursorOffset })
  }, [])

  const handleNewSession = useCallback(() => {
    chat.newSession()
    // Keep selectedProject — user expects the project to persist across new chats
    setSessionTitle(null)
    setShowSessions(false)
  }, [chat.newSession])

  const handleSelectSession = useCallback((sessionId: string, targetTurnIndex?: number, title?: string, searchHit?: { snippet: string; createdAt: number; role: 'user' | 'assistant' }) => {
    setScrollToTurn(targetTurnIndex != null ? { turnIndex: targetTurnIndex, snippet: searchHit?.snippet, createdAt: searchHit?.createdAt, role: searchHit?.role } : null)
    // Pass the created_at timestamp (not turn_index) to loadSession for binary search offset resolution
    chat.loadSession(sessionId, searchHit?.createdAt)
    setSessionTitle(title ?? null)
    if (!isFullscreen) {
      setShowSessions(false)
    }
    // Close mobile sidebar overlay on selection
    if (isMobile) {
      setShowMobileSidebar(false)
    }
  }, [chat.loadSession, setScrollToTurn, isFullscreen, isMobile])

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
        className={`fixed inset-0 z-30 bg-surface-raised flex ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'} ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Left sidebar — hidden on mobile, permanent on desktop */}
        {/* Desktop: static sidebar */}
        <div className="hidden md:flex w-72 shrink-0 border-r border-white/[0.06] flex-col">
          {/* Sidebar header — taller on Tauri (non-fullscreen) to clear traffic lights */}
          <div className={`flex items-center justify-between px-4 shrink-0 transition-all duration-300 ${trafficLightPad ? 'h-[88px] pt-7' : 'h-14'}`}>
            <span className="text-sm font-medium text-gray-300">Conversations</span>
            <button
              onClick={handleNewSession}
              disabled={isNewConversation}
              className={`p-1.5 rounded-md transition-colors ${isNewConversation ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
              title="New conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <SessionList
            activeSessionId={chat.sessionId}
            onSelect={handleSelectSession}
            onClose={NOOP} // no-op in fullscreen desktop
            embedded
          />
        </div>

        {/* Mobile: full-screen overlay sidebar */}
        {isMobile && showMobileSidebar && (
          <div className="fixed inset-0 z-40 flex flex-col bg-surface-raised">
            {/* Mobile sidebar header — taller on Tauri (non-fullscreen) to clear traffic lights */}
            <div className={`flex items-center justify-between px-4 shrink-0 transition-all duration-300 ${trafficLightPad ? 'h-[88px] pt-7' : 'h-14'}`}>
              <span className="text-sm font-medium text-gray-300">Conversations</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
                  title="Back to chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* New conversation button */}
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <button
                onClick={() => { handleNewSession(); setShowMobileSidebar(false) }}
                disabled={isNewConversation}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isNewConversation ? 'bg-indigo-500/5 text-indigo-400/40 cursor-not-allowed' : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400'}`}
              >
                <Plus className="w-4 h-4" />
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
                <Menu className="w-4 h-4" />
              </button>
              {!isNewConversation && <WsStatusDot status={chat.wsStatus} />}
              <div className="min-w-0">
                <span className="text-sm font-medium text-gray-300 truncate block">
                  {headerTitle}
                </span>
                {!isNewConversation && chat.sessionMeta?.workspaceSlug && (
                  <Link
                    to={`/workspace/${chat.sessionMeta.workspaceSlug}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-purple-400 hover:text-purple-300 truncate block transition-colors"
                  >
                    ⬡ {chat.sessionMeta.workspaceSlug}
                  </Link>
                )}
                {!isNewConversation && !chat.sessionMeta?.workspaceSlug && chat.sessionMeta?.projectSlug && (
                  <Link
                    to={activeWsSlug ? `/workspace/${activeWsSlug}/projects/${chat.sessionMeta.projectSlug}` : `/projects/${chat.sessionMeta.projectSlug}`}
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
                disabled={isNewConversation}
                className={`p-1.5 rounded-md transition-colors md:hidden ${isNewConversation ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
                title="New chat"
              >
                <Plus className="w-4 h-4" />
              </button>
              {/* Permission settings gear icon */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`relative p-1.5 rounded-md transition-colors ${showSettings ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
                title="Permission settings"
              >
                <Settings className="w-4 h-4" />
                {modeColor && (
                  <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${modeColor} ring-1 ring-[#1a1d27]`} />
                )}
              </button>
              <button
                onClick={() => setMode('open')}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
                title="Exit fullscreen"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMode('closed')}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Reconnecting / Disconnected banner */}
          {!isNewConversation && chat.wsStatus === 'reconnecting' && (
            <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin shrink-0" />
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
                <ProjectSelect />
              )}

              <ChatMessages
                messages={chat.messages}
                isStreaming={chat.isStreaming}
                isLoadingHistory={chat.isLoadingHistory}
                isReplaying={chat.isReplaying}
                hasOlderMessages={chat.hasOlderMessages}
                isLoadingOlder={chat.isLoadingOlder}
                onLoadOlder={chat.loadOlderMessages}
                hasNewerMessages={chat.hasNewerMessages}
                isLoadingNewer={chat.isLoadingNewer}
                onLoadNewer={chat.loadNewerMessages}
                hasLiveActivity={chat.hasLiveActivity}
                onJumpToTail={chat.jumpToTail}
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
                disabled={isNewConversation && !hasContext}
                sessionId={chat.sessionId}
                onChangePermissionMode={chat.changePermissionMode}
                onChangeModel={chat.changeModel}
                onChangeAutoContinue={chat.changeAutoContinue}
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
      className={`fixed z-30 bg-surface-raised border-l border-border-subtle flex flex-col ${isDragging ? '' : 'transition-transform duration-300 ease-in-out'} ${isOpen ? 'translate-x-0' : 'translate-x-full'} top-0 right-0 bottom-0 w-full`}
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
            <Menu className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex items-center gap-1.5">
            {/* WS status dot — only show when connected to a session */}
            {!isNewConversation && <WsStatusDot status={chat.wsStatus} />}
            <div className="min-w-0">
              <span className="text-sm font-medium text-gray-300 truncate block">
                {headerTitle}
              </span>
              {!isNewConversation && chat.sessionMeta?.workspaceSlug && (
                <Link
                  to={workspacePath(chat.sessionMeta.workspaceSlug, '/overview')}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-purple-400 hover:text-purple-300 truncate block transition-colors"
                >
                  ⬡ {chat.sessionMeta.workspaceSlug}
                </Link>
              )}
              {!isNewConversation && !chat.sessionMeta?.workspaceSlug && chat.sessionMeta?.projectSlug && activeWsSlug && (
                <Link
                  to={workspacePath(activeWsSlug, `/projects/${chat.sessionMeta.projectSlug}`)}
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
            disabled={isNewConversation}
            className={`p-1.5 rounded-md transition-colors ${isNewConversation ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
            title="New chat"
          >
            <Plus className="w-4 h-4" />
          </button>
          {/* Permission settings gear icon */}
          <button
            onClick={() => { setShowSettings(!showSettings); setShowSessions(false) }}
            className={`relative p-1.5 rounded-md transition-colors ${showSettings ? 'text-indigo-400 bg-indigo-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'}`}
            title="Permission settings"
          >
            <Settings className="w-4 h-4" />
            {modeColor && (
              <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${modeColor} ring-1 ring-[#1a1d27]`} />
            )}
          </button>
          <button
            onClick={() => setMode('fullscreen')}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors hidden md:flex"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMode('closed')}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Reconnecting / Disconnected banner */}
      {!isNewConversation && chat.wsStatus === 'reconnecting' && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-xs flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
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
            <ProjectSelect />
          )}

          <ChatMessages
            messages={chat.messages}
            isStreaming={chat.isStreaming}
            isLoadingHistory={chat.isLoadingHistory}
            isReplaying={chat.isReplaying}
            hasOlderMessages={chat.hasOlderMessages}
            isLoadingOlder={chat.isLoadingOlder}
            onLoadOlder={chat.loadOlderMessages}
            hasNewerMessages={chat.hasNewerMessages}
            isLoadingNewer={chat.isLoadingNewer}
            onLoadNewer={chat.loadNewerMessages}
            hasLiveActivity={chat.hasLiveActivity}
            onJumpToTail={chat.jumpToTail}
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
            disabled={isNewConversation && !hasContext}
            sessionId={chat.sessionId}
            onChangePermissionMode={chat.changePermissionMode}
            onChangeModel={chat.changeModel}
            onChangeAutoContinue={chat.changeAutoContinue}
            prefill={prefill}
          />
        </>
      )}
    </div>
  )
}
