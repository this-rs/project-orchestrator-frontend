import { AttachSessionButton } from '@/components/discussions/AttachSessionButton'
import { AttachSessionDialog } from '@/components/discussions/AttachSessionDialog'
import { OverflowMenu } from '@/components/ui/OverflowMenu'
import { useRequestAttentionRefresh } from '@/hooks/useAttentionCount'
import { useAtom } from 'jotai'
import { useChatUrlSync } from '@/hooks/useChatUrlSync'
import { chatPanelModeAtom, chatPanelWidthAtom, chatScrollToTurnAtom, chatPermissionConfigAtom, chatSelectedProjectAtom, chatAllProjectsModeAtom, chatWorkspaceHasProjectsAtom, chatBackgroundTasksAtom, chatSessionOpenErrorAtom, chatSessionCapabilitiesAtom, chatSessionEngineAtom, chatSessionProviderAtom, chatSessionModelAtom, chatDraftInputAtom } from '@/atoms'
import { useChat, useDetachedRuns, useVisualViewportHeight, useWindowFullscreen, useWorkspaceSlug } from '@/hooks'
import { useProviders } from '@/hooks/useProviders'
import { useSessionLive } from '@/hooks/useSessionLive'
import { describeSessionProvider, providerUnavailableReason } from '@/constants/providers'
import { INSTANCE_MISSING_COMPOSER_TEXT, NO_PROVIDER_COMPOSER_TEXT, NO_PROVIDER_ERROR } from '@/constants/providerErrors'
import { RESUME_UNSUPPORTED_TEXT } from '@/constants/capabilities'
import type { BackgroundTaskInfo } from '@/types'
import { chatApi } from '@/services/chat'
import { Plus, X, Menu, Settings, Minimize2, Maximize2, FolderPlus, TreePine, ArrowLeft, ClipboardCopy, Check, Link2 } from 'lucide-react'
import { ChatMessages } from './ChatMessages'
import { ChatCapabilitiesProvider, ChatSessionProvider } from './ChatSessionContext'
import { ProviderStateCard } from './ProviderStateCard'
import { ChatHeaderTitle } from './ChatHeaderTitle'
import { Button, StatusDot } from '@/components/ui'
import { glassButton, glassFlat, iconButton } from '@/components/ui/classes'
import { PolicyOnlyBanner } from './PolicyOnlyBanner'
import { RemoteNoToolsBanner } from './RemoteNoToolsBanner'
import { EngineBanner } from './EngineBanner'
import { ChatInput, type PrefillPayload } from './ChatInput'
import { CompactionBanner } from './CompactionBanner'
import { SecretRequestTray } from './SecretRequestTray'
import { SessionOpenError } from './SessionOpenError'
import { ComposerDock } from './ComposerDock'
import { collectRunning } from './runningActivity'
import type { RunActions } from './ActivityBar'
import { DetachedRunsPanel } from './DetachedRunsPanel'
import { SessionList } from './SessionList'
import { ProjectSelect } from './ProjectSelect'
import { PermissionSettingsPanel } from './PermissionSettingsPanel'
import { MODE_DOT_COLORS } from '@/constants/toolPolicy'
import { toToolPolicyMode } from '@/types/provider'
import { SessionBreadcrumb } from './SessionBreadcrumb'
import { DiscussionTreeView } from '@/components/discussions/DiscussionTreeView'
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { messagesToMarkdown } from '@/utils/chatExport'
import { useSetAtom, useAtomValue, useStore } from 'jotai'
import { Link, useNavigate } from 'react-router-dom'
import { isTauri } from '@/services/env'
import { workspacePath } from '@/utils/paths'

const MIN_WIDTH = 320
const MAX_WIDTH = 800
const MOBILE_BREAKPOINT = 768
const NOOP = () => {}
/** A provider without background tasks tracks none: nothing to list. */
const NO_BACKGROUND_TASKS: BackgroundTaskInfo[] = []

/** The live-connection state of the conversation: a `StatusDot` with its label (DESIGN.md § 4). */
function WsStatusDot({ status }: { status: string }) {
  if (status === 'connected') return <StatusDot tone="success" label="Connected" />
  if (status === 'reconnecting' || status === 'connecting') return <StatusDot tone="warning" pulse label="Reconnecting…" />
  // disconnected or unknown — only shown when there is a session
  return <StatusDot tone="muted" label="Disconnected" />
}

/** Ghost glass icon button of the chat chrome (36 px on phones, 32 px on desktop), flat: a bar holds several. */
const chromeIcon = (active = false) => `${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} ${active ? 'text-indigo-300 bg-white/[0.08]' : 'text-gray-400'}`
const chromeIconDisabled = `${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} text-gray-600`

export function ChatPanel() {
  const [mode, setMode] = useAtom(chatPanelModeAtom)
  const [panelWidth, setPanelWidth] = useAtom(chatPanelWidthAtom)
  const [showSessions, setShowSessions] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // Height of the composer floating over the bottom of the transcript (see ComposerDock)
  const [dockHeight, setDockHeight] = useState(0)
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const selectedProject = useAtomValue(chatSelectedProjectAtom)
  const allProjectsMode = useAtomValue(chatAllProjectsModeAtom)
  const workspaceHasProjects = useAtomValue(chatWorkspaceHasProjectsAtom)
  const activeWsSlug = useWorkspaceSlug()
  const [isDragging, setIsDragging] = useState(false)
  const [sessionTitle, setSessionTitle] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [prefill, setPrefill] = useState<PrefillPayload | null>(null)
  const [showAgentTree, setShowAgentTree] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const requestAttentionRefresh = useRequestAttentionRefresh()
  const [copiedChat, setCopiedChat] = useState(false)
  const chat = useChat()
  // Provider instances of this server, for the project the chat is about. The
  // composer reads them from the atoms; a backend without provider routes
  // leaves everything as it was (Claude Code only).
  const providers = useProviders()
  const store = useStore()
  // What the provider of the conversation on screen can do. Every absent
  // capability removes or disables its control here and in the transcript.
  const capabilities = useAtomValue(chatSessionCapabilitiesAtom)
  const sessionProvider = useAtomValue(chatSessionProviderAtom)
  const sessionModel = useAtomValue(chatSessionModelAtom)
  const engine = useAtomValue(chatSessionEngineAtom)
  const [sessionOpenError, setSessionOpenError] = useAtom(chatSessionOpenErrorAtom)
  const dismissSessionOpenError = useCallback(() => setSessionOpenError(null), [setSessionOpenError])
  // Session + panel mode live in the URL, so a reload reopens the chat as it was.
  useChatUrlSync({ sessionId: chat.sessionId, mode, setMode, loadSession: chat.loadSession })
  const detachedRuns = useDetachedRuns(chat.sessionId)
  // One derivation of "what is running here", rendered above the composer (ActivityBar).
  const trackedBackgroundTasks = useAtomValue(chatBackgroundTasksAtom)
  const backgroundTasks = capabilities.background_tasks ? trackedBackgroundTasks : NO_BACKGROUND_TASKS
  const activity = useMemo(
    () =>
      collectRunning({
        messages: chat.messages,
        backgroundTasks,
        isStreaming: chat.isStreaming,
        detachedRuns: detachedRuns.runs,
      }),
    [chat.messages, backgroundTasks, chat.isStreaming, detachedRuns.runs],
  )
  // A run that streams is in the activity bar; the panel above the transcript keeps the finished
  // ones. Showing a live run in both (and in a banner, and in a header pill) was three surfaces
  // for one fact.
  const finishedRuns = useMemo(() => detachedRuns.runs.filter((r) => !r.isStreaming), [detachedRuns.runs])
  const panelRef = useRef<HTMLDivElement>(null)
  const setScrollToTurn = useSetAtom(chatScrollToTurnAtom)
  const permissionConfig = useAtomValue(chatPermissionConfigAtom)
  // Note: permission config is fetched by ChatInput (which owns the write)

  // Mode-based color for gear icon badge
  const modeColor = permissionConfig
    ? MODE_DOT_COLORS[toToolPolicyMode(permissionConfig.mode) ?? 'plan_only']
    : null

  const isOpen = mode !== 'closed'
  const isFullscreen = mode === 'fullscreen'
  const isNewConversation = !chat.sessionId && !chat.isSending
  const isWindowFullscreen = useWindowFullscreen()

  // Show extra top padding on Tauri desktop (non-fullscreen) to clear native traffic lights
  const trafficLightPad = isTauri && !isWindowFullscreen

  // Mobile soft-keyboard compensation: the panel is `position: fixed` and
  // sized against the LAYOUT viewport, which iOS does not shrink when the
  // keyboard opens — the input bar then floats above dead space. The hook
  // returns a PASSIVE height covering [0, visualViewport bottom]: the
  // panel's bottom edge lands on the keyboard top wherever iOS pans the
  // visual viewport, with NO scroll manipulation and no moving `top`
  // (scroll-fighting variants stuttered — reverted). `undefined` (desktop,
  // keyboard closed, Android with interactive-widget=resizes-content)
  // keeps the pure-CSS layout.
  const keyboardBox = useVisualViewportHeight(isOpen)
  const keyboardStyle = keyboardBox !== undefined
    ? { height: keyboardBox.height, bottom: 'auto' as const }
    : undefined

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
  // Requires at least one project in the workspace — allProjectsMode alone isn't enough
  const hasContext = workspaceHasProjects && (!!selectedProject || (allProjectsMode && !!activeWsSlug))

  // `attachmentIds` are document ids the server has already issued — ChatInput
  // holds the send until every upload has resolved (see `attachmentState.ts`).
  const handleSend = useCallback((text: string, attachmentIds?: string[]) => {
    if (isNewConversation && !hasContext) return
    // `sendMessage` reports a failed session creation itself (see
    // `chatSessionOpenErrorAtom`). Anything else it could reject with is
    // logged here: a send must never end as an unhandled rejection.
    const send = (...args: Parameters<typeof chat.sendMessage>) => {
      Promise.resolve(chat.sendMessage(...args)).catch((err: unknown) => console.error('Send failed', err))
    }
    if (!isNewConversation) {
      send(text, undefined, attachmentIds)
      return
    }
    if (selectedProject) {
      // When allProjectsMode → send workspaceSlug (adds all project dirs)
      // When single project → send only projectSlug (no extra dirs)
      send(text, {
        cwd: selectedProject.root_path ?? '',
        workspaceSlug: allProjectsMode ? (activeWsSlug || undefined) : undefined,
        projectSlug: allProjectsMode ? undefined : selectedProject.slug,
      }, attachmentIds)
    }
  }, [isNewConversation, hasContext, selectedProject, allProjectsMode, activeWsSlug, chat.sendMessage])

  // ── Provider state of the composer ────────────────────────────────────
  // Nothing below applies to a backend without provider routes
  // (`unsupported`): the list is never `ready` there, and a session names no
  // provider — the chat behaves as it always has.
  const providerList = providers.state === 'ready' ? providers.providers : null
  // A new conversation with no instance that is both healthy and allowed.
  const noProvider =
    isNewConversation && providerList !== null && !providerList.some((p) => providerUnavailableReason(p) === null)
  // The provider this conversation runs on, as its `system_init` named it.
  const sessionProviderInfo = describeSessionProvider(sessionProvider, providerList)
  // Its instance was deleted since: the conversation cannot be resumed.
  const instanceMissing = !isNewConversation && sessionProviderInfo.unavailable
  // A provider that cannot resume can only be talked to while its process lives.
  const sessionLive = useSessionLive(chat.sessionId, !isNewConversation && !capabilities.resume, chat.isStreaming)
  const cannotResume = !isNewConversation && !capabilities.resume && sessionLive === false
  /** Why the composer is off, when a provider state (not a missing project) is the reason. */
  const composerBlockedReason = noProvider
    ? NO_PROVIDER_COMPOSER_TEXT
    : instanceMissing
      ? INSTANCE_MISSING_COMPOSER_TEXT
      : cannotResume
        ? RESUME_UNSUPPORTED_TEXT
        : null
  const composerDisabled = (isNewConversation && !hasContext) || composerBlockedReason !== null

  /** Send again what could not open a conversation — the composer's text if it was edited since. */
  const retrySessionOpen = useCallback(() => {
    if (!sessionOpenError) return
    const draft = store.get(chatDraftInputAtom).trim()
    handleSend(draft || sessionOpenError.text, sessionOpenError.attachments.length > 0 ? sessionOpenError.attachments : undefined)
  }, [sessionOpenError, store, handleSend])

  const handleContinue = useCallback(() => {
    chat.sendContinue()
  }, [chat.sendContinue])

  /** Quick action from welcome screen → prefill the textarea */
  const handleQuickAction = useCallback((prompt: string, cursorOffset?: number) => {
    // Create a new object reference each time to re-trigger the useEffect in ChatInput
    setPrefill({ text: prompt, cursorOffset })
  }, [])

  const handleViewRun = useCallback((childSessionId: string) => {
    chat.loadSession(childSessionId)
    setSessionTitle(null)
  }, [chat.loadSession])

  const handleStopRun = useCallback((childSessionId: string) => {
    // This used to swallow every failure, which hid the fact that the route
    // it calls did not exist at all: the button was a no-op for months and
    // said nothing. Failures are loud now.
    chatApi.interruptSession(childSessionId)
      .then((outcome) => {
        if (!outcome?.delivered) {
          console.warn('Stop run: nothing was interrupted', childSessionId, outcome)
        }
      })
      .catch((err) => console.error('Stop run failed', childSessionId, err))
  }, [])

  const navigate = useNavigate()
  const runActions = useMemo<RunActions>(
    () => ({
      view: handleViewRun,
      stop: handleStopRun,
      dashboard: (planId) => navigate(workspacePath(activeWsSlug, `/plans/${planId}/runner`)),
    }),
    [handleViewRun, handleStopRun, navigate, activeWsSlug],
  )

  const handleNewSession = useCallback(() => {
    chat.newSession()
    // Keep selectedProject — user expects the project to persist across new chats
    setSessionTitle(null)
    setShowSessions(false)
  }, [chat.newSession])

  const handleCopyChat = useCallback(async () => {
    const markdown = messagesToMarkdown(chat.messages, {
      sessionId: chat.sessionId ?? undefined,
      provider: sessionProviderInfo.label,
      model: sessionModel ?? undefined,
      projectSlug: chat.sessionMeta?.projectSlug,
      workspaceSlug: chat.sessionMeta?.workspaceSlug,
      exportedAt: new Date(),
    })
    try {
      await navigator.clipboard.writeText(markdown)
      setCopiedChat(true)
      setTimeout(() => setCopiedChat(false), 2000)
    } catch {
      // Fallback: open in a new window as plain text (non-secure context)
      const win = window.open('', '_blank')
      if (win) {
        win.document.write(`<pre style="white-space:pre-wrap;font-family:monospace;padding:16px">${markdown.replace(/</g, '&lt;')}</pre>`)
        win.document.title = 'Chat Export'
      }
    }
  }, [chat.messages, chat.sessionId, chat.sessionMeta, sessionProviderInfo.label, sessionModel])

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

  // Spawned-by navigation: derive parent session ID from session metadata
  const spawnedBy = chat.sessionMeta?.spawnedBy
  const parentSessionId = useMemo(() => {
    if (!spawnedBy) return null
    if (spawnedBy.type === 'conversation') return spawnedBy.parent_session_id
    // runner-spawned sessions don't have a direct parent to navigate back to
    return null
  }, [spawnedBy])

  // The root session ID for tree view — use parent if we're a child, otherwise current
  const rootSessionId = parentSessionId || chat.sessionId

  // Whether session has children (show Agent Tree button)
  const hasChildren = detachedRuns.runs.length > 0

  const handleBackToParent = useCallback(() => {
    if (!parentSessionId) return
    chat.loadSession(parentSessionId)
    setSessionTitle(null)
    setShowAgentTree(false)
  }, [parentSessionId, chat.loadSession])

  const handleTreeNavigate = useCallback((targetSessionId: string) => {
    chat.loadSession(targetSessionId)
    setSessionTitle(null)
    setShowAgentTree(false)
  }, [chat.loadSession])

  // Reset agent tree panel when session changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync reset on session change
    setShowAgentTree(false)
  }, [chat.sessionId])

  // Everything said above the composer about the provider, shared by both layouts.
  const composerNotices = (
    <>
      {sessionOpenError && (
        <SessionOpenError
          error={sessionOpenError}
          onDismiss={dismissSessionOpenError}
          onRetry={retrySessionOpen}
          projectSlug={selectedProject?.slug}
        />
      )}
      {noProvider && !sessionOpenError && (
        <ProviderStateCard error={NO_PROVIDER_ERROR} projectSlug={selectedProject?.slug} floating className="mx-3 mb-1" />
      )}
      {instanceMissing && (
        <ProviderStateCard
          error={{ code: 'instance_not_found', message: '', provider_id: sessionProvider?.id }}
          onNewConversation={handleNewSession}
          floating
          className="mx-3 mb-1"
        />
      )}
      {!capabilities.interactive_permissions && !noProvider && !instanceMissing && <PolicyOnlyBanner />}
      {!isNewConversation && sessionProviderInfo.isRemote && !capabilities.per_session_mcp && (
        <RemoteNoToolsBanner machine={sessionProviderInfo.label} />
      )}
      <EngineBanner degraded={engine.degraded} />
    </>
  )

  // --- FULLSCREEN LAYOUT: sidebar + conversation side by side ---
  // On mobile (<768px): sidebar is a full-screen overlay toggled via hamburger
  // On desktop: sidebar is a permanent 288px column
  if (isFullscreen) {
    return (
      <ChatCapabilitiesProvider capabilities={capabilities}>
      <div
        ref={panelRef}
        className={`fixed inset-0 z-30 bg-surface-raised flex ${isDragging ? '' : 'transition-transform duration-(--duration-stage) ease-(--ease-standard)'} ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={keyboardStyle}
      >
        {/* Left sidebar — hidden on mobile, permanent on desktop */}
        {/* Desktop: static sidebar */}
        <div className="hidden md:flex w-72 shrink-0 border-r border-white/[0.06] flex-col">
          {/* Sidebar header — taller on Tauri (non-fullscreen) to clear traffic lights */}
          <div className={`flex items-center justify-between px-4 shrink-0 ${trafficLightPad ? 'h-[88px] pt-7' : 'h-14'}`}>
            <span className="text-sm font-medium text-gray-300">Conversations</span>
            <button
              type="button"
              onClick={handleNewSession}
              disabled={isNewConversation}
              className={isNewConversation ? chromeIconDisabled : chromeIcon()}
              title="New conversation"
              aria-label="New conversation"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
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
            <div className={`flex items-center justify-between px-4 shrink-0 ${trafficLightPad ? 'h-[88px] pt-7' : 'h-14'}`}>
              <span className="text-sm font-medium text-gray-300">Conversations</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setShowMobileSidebar(false)} className={chromeIcon()} title="Back to chat" aria-label="Back to chat">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* New conversation button */}
            <div className="px-3 py-2 border-b border-white/[0.06]">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { handleNewSession(); setShowMobileSidebar(false) }}
                disabled={isNewConversation}
                className="w-full gap-2"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                New conversation
              </Button>
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
            <div className="min-w-0 flex flex-1 items-center gap-2">
              {/* Mobile: hamburger to toggle sidebar */}
              <button
                type="button"
                onClick={() => { if (isMobile) setShowMobileSidebar(true) }}
                className={`shrink-0 md:hidden ${chromeIcon(showMobileSidebar)}`}
                title="Sessions"
                aria-label="Sessions"
                aria-expanded={showMobileSidebar}
              >
                <Menu className="w-4 h-4" aria-hidden="true" />
              </button>
              {!isNewConversation && <WsStatusDot status={chat.wsStatus} />}
              <ChatHeaderTitle
                title={headerTitle}
                scope={
                  isNewConversation
                    ? null
                    : chat.sessionMeta?.workspaceSlug
                      ? { kind: 'workspace', label: chat.sessionMeta.workspaceSlug, to: `/workspace/${chat.sessionMeta.workspaceSlug}` }
                      : chat.sessionMeta?.projectSlug
                        ? {
                            kind: 'project',
                            label: chat.sessionMeta.projectSlug,
                            to: activeWsSlug ? `/workspace/${activeWsSlug}/projects/${chat.sessionMeta.projectSlug}` : `/projects/${chat.sessionMeta.projectSlug}`,
                          }
                        : null
                }
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={handleNewSession}
                disabled={isNewConversation}
                className={`md:hidden ${isNewConversation ? chromeIconDisabled : chromeIcon()}`}
                title="New chat"
                aria-label="New chat"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
              {/* Link this conversation to a plan or a task of its project */}
              {!isNewConversation && chat.sessionId && (
                <AttachSessionButton variant="icon" sessionId={chat.sessionId} projectSlug={chat.sessionMeta?.projectSlug} />
              )}
              {/* Agent Tree toggle — visible when session has children */}
              {hasChildren && chat.sessionId && (
                <button
                  type="button"
                  onClick={() => { setShowAgentTree(!showAgentTree); setShowSettings(false) }}
                  className={chromeIcon(showAgentTree)}
                  title="Assistant tree"
                  aria-label="Assistant tree"
                  aria-pressed={showAgentTree}
                >
                  <TreePine className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
              {/* Permission settings gear icon */}
              <button
                type="button"
                onClick={() => { setShowSettings(!showSettings); setShowAgentTree(false) }}
                className={`relative ${chromeIcon(showSettings)}`}
                title="Permission settings"
                aria-label="Permission settings"
                aria-pressed={showSettings}
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
                {modeColor && (
                  <span className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${modeColor} ring-1 ring-[#1a1d27]`} aria-hidden="true" />
                )}
              </button>
              {/* Copy chat to clipboard */}
              {chat.messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyChat}
                  className={`${chromeIcon()} ${copiedChat ? 'text-emerald-400' : ''}`}
                  title={copiedChat ? 'Copied!' : 'Copy chat as markdown'}
                  aria-label={copiedChat ? 'Copied!' : 'Copy chat as markdown'}
                >
                  {copiedChat ? <Check className="w-4 h-4" aria-hidden="true" /> : <ClipboardCopy className="w-4 h-4" aria-hidden="true" />}
                </button>
              )}
              <button type="button" onClick={() => setMode('open')} className={chromeIcon()} title="Exit fullscreen" aria-label="Exit fullscreen">
                <Minimize2 className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setMode('closed')} className={chromeIcon()} title="Close" aria-label="Close">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Back to parent button — shown when session is spawned */}
          {parentSessionId && (
            <button
              onClick={handleBackToParent}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-xs text-indigo-400 hover:text-indigo-300 hover:bg-white/[0.04] transition-colors w-full text-left"
            >
              <ArrowLeft className="w-3 h-3 shrink-0" />
              Back to parent
            </button>
          )}

          {/* Session breadcrumb — shown when session is spawned */}
          {parentSessionId && rootSessionId && chat.sessionId && (
            <SessionBreadcrumb
              sessionId={chat.sessionId}
              rootSessionId={rootSessionId}
              onNavigate={handleTreeNavigate}
              isStreaming={chat.isStreaming}
            />
          )}

          {/* Reconnecting / Disconnected banner */}
          {!isNewConversation && chat.wsStatus === 'reconnecting' && (
            <div className="px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-xs flex items-center gap-1.5">
              <StatusDot tone="warning" pulse />
              <span className="text-amber-300">Reconnecting…</span>
            </div>
          )}
          {!isNewConversation && chat.wsStatus === 'disconnected' && chat.sessionId && (
            <div className="px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-xs flex items-center gap-1.5">
              <StatusDot tone="danger" />
              <span className="text-red-300">Connection lost</span>
            </div>
          )}

          {/* ProjectSelect always mounted for new convos — manages chatWorkspaceHasProjectsAtom via effects */}
          {isNewConversation && <ProjectSelect />}

          {/* Settings panel overlay */}
          {showSettings ? (
            <PermissionSettingsPanel onClose={() => setShowSettings(false)} />
          ) : isNewConversation && !hasContext ? (
            <NoProjectsPlaceholder wsSlug={activeWsSlug} />
          ) : (
            <div className="flex flex-1 min-h-0">
              {/* Main conversation column */}
              <div className="flex flex-col flex-1 min-w-0">
                {/* Detached runs panel — fullscreen layout (collapsible historical view) */}
                {finishedRuns.length > 0 && (
                  <DetachedRunsPanel
                    runs={finishedRuns}
                    hasActiveRuns={false}
                    onViewRun={handleViewRun}
                    onStopRun={handleStopRun}
                  />
                )}
                {/* The composer floats over the transcript: the messages scroll under its glass. */}
                <div className="relative flex flex-1 min-h-0 flex-col">
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
                    bottomInset={dockHeight}
                  />
                  <ComposerDock onHeight={setDockHeight}>
                    <CompactionBanner visible={chat.isCompacting && capabilities.compaction_signal} />
                    <SecretRequestTray sessionId={chat.sessionId} />
                    {composerNotices}
                    <ChatInput
                      onSend={handleSend}
                      onQueue={chat.queueMessage}
                      onQueueOp={chat.queueOp}
                      onInterrupt={chat.interrupt}
                      isStreaming={chat.isStreaming}
                      disabled={composerDisabled}
                disabledReason={composerBlockedReason}
                      sessionId={chat.sessionId}
                      onChangePermissionMode={chat.changePermissionMode}
                      onChangeModel={chat.changeModel}
                      onNewConversation={handleNewSession}
                      onChangeAutoContinue={chat.changeAutoContinue}
                      prefill={prefill}
                      activity={activity}
                      runActions={runActions}
                    />
                  </ComposerDock>
                </div>
              </div>

              {/* Agent Tree right panel — fullscreen layout */}
              {showAgentTree && rootSessionId && (
                <div className="w-80 shrink-0 border-l border-white/[0.06] flex flex-col overflow-y-auto p-3">
                  <DiscussionTreeView sessionId={rootSessionId} onNavigate={handleTreeNavigate} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </ChatCapabilitiesProvider>
    )
  }

  // --- PANEL LAYOUT (non-fullscreen): toggle-based session list ---
  return (
    <ChatSessionProvider sessionId={chat.sessionId ?? null}>
    <ChatCapabilitiesProvider capabilities={capabilities}>
    <div
      ref={panelRef}
      className={`fixed z-30 bg-surface-raised border-l border-border-subtle flex flex-col ${isDragging ? '' : 'transition-transform duration-(--duration-stage) ease-(--ease-standard)'} ${isOpen ? 'translate-x-0' : 'translate-x-full'} top-0 right-0 bottom-0 w-full`}
      style={{ maxWidth: isMobile ? undefined : panelWidth, ...keyboardStyle }}
    >
      {/* Resize handle — hidden on mobile (panel takes full width) */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-indigo-500/40 transition-colors hidden md:block ${isDragging ? 'bg-indigo-500/50' : ''}`}
      />

      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] shrink-0">
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => { setShowSessions(!showSessions); setShowSettings(false) }}
            className={`shrink-0 ${chromeIcon(showSessions)}`}
            title="Sessions"
            aria-label="Sessions"
            aria-pressed={showSessions}
          >
            <Menu className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex flex-1 items-center gap-1.5">
            {/* WS status dot — only show when connected to a session */}
            {!isNewConversation && <WsStatusDot status={chat.wsStatus} />}
            <ChatHeaderTitle
              title={headerTitle}
              scope={
                isNewConversation
                  ? null
                  : chat.sessionMeta?.workspaceSlug
                    ? { kind: 'workspace', label: chat.sessionMeta.workspaceSlug, to: workspacePath(chat.sessionMeta.workspaceSlug, '/overview') }
                    : chat.sessionMeta?.projectSlug && activeWsSlug
                      ? { kind: 'project', label: chat.sessionMeta.projectSlug, to: workspacePath(activeWsSlug, `/projects/${chat.sessionMeta.projectSlug}`) }
                      : null
              }
            />
          </div>
        </div>
        {/* Four controls, not seven: a docked panel is narrow (400 px by default) and seven 28 px
            buttons left the title about 70 px. The less frequent ones live under the ⋯ menu. */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleNewSession}
            disabled={isNewConversation}
            className={isNewConversation ? chromeIconDisabled : chromeIcon()}
            title="New chat"
            aria-label="New chat"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
          {/* Permission settings gear icon */}
          <button
            type="button"
            onClick={() => { setShowSettings(!showSettings); setShowSessions(false); setShowAgentTree(false) }}
            className={`relative ${chromeIcon(showSettings)}`}
            title="Permission settings"
            aria-label="Permission settings"
            aria-pressed={showSettings}
          >
            <Settings className="w-4 h-4" aria-hidden="true" />
            {modeColor && (
              <span className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${modeColor} ring-1 ring-[#1a1d27]`} aria-hidden="true" />
            )}
          </button>
          <OverflowMenu
            size="sm"
            label="Conversation actions"
            actions={[
              // Link this conversation to a plan or a task of its project
              { label: 'Attach to a plan or task…', icon: Link2, hidden: isNewConversation || !chat.sessionId, onClick: () => setShowAttach(true) },
              // Agent Tree toggle — visible when session has children
              {
                label: showAgentTree ? 'Hide the assistant tree' : 'Show the assistant tree',
                icon: TreePine,
                hidden: !(hasChildren && chat.sessionId),
                onClick: () => { setShowAgentTree(!showAgentTree); setShowSettings(false); setShowSessions(false) },
              },
              // Copy chat to clipboard
              { label: copiedChat ? 'Copied!' : 'Copy chat as markdown', icon: copiedChat ? Check : ClipboardCopy, hidden: chat.messages.length === 0, onClick: handleCopyChat },
              { label: 'Fullscreen', icon: Maximize2, hidden: isMobile, onClick: () => setMode('fullscreen') },
            ]}
          />
          <button type="button" onClick={() => setMode('closed')} className={chromeIcon()} title="Close" aria-label="Close">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* The dialog of "Attach to a plan or task…" (the ⋯ menu opens it) */}
      {chat.sessionId && (
        <AttachSessionDialog
          open={showAttach}
          onClose={() => setShowAttach(false)}
          sessionId={chat.sessionId}
          projectSlug={chat.sessionMeta?.projectSlug}
          onAttached={requestAttentionRefresh}
        />
      )}

      {/* Back to parent button — shown when session is spawned */}
      {parentSessionId && (
        <button
          onClick={handleBackToParent}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-xs text-indigo-400 hover:text-indigo-300 hover:bg-white/[0.04] transition-colors w-full text-left"
        >
          <ArrowLeft className="w-3 h-3 shrink-0" />
          Back to parent
        </button>
      )}

      {/* Session breadcrumb — shown when session is spawned */}
      {parentSessionId && rootSessionId && chat.sessionId && (
        <SessionBreadcrumb
          sessionId={chat.sessionId}
          rootSessionId={rootSessionId}
          onNavigate={handleTreeNavigate}
          isStreaming={chat.isStreaming}
        />
      )}

      {/* Reconnecting / Disconnected banner */}
      {!isNewConversation && chat.wsStatus === 'reconnecting' && (
        <div className="px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-xs flex items-center gap-1.5">
          <StatusDot tone="warning" pulse />
          <span className="text-amber-300">Reconnecting…</span>
        </div>
      )}
      {!isNewConversation && chat.wsStatus === 'disconnected' && chat.sessionId && (
        <div className="px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.06] text-xs flex items-center gap-1.5">
          <StatusDot tone="danger" />
          <span className="text-red-300">Connection lost</span>
        </div>
      )}

      {/* ProjectSelect always mounted for new convos — manages chatWorkspaceHasProjectsAtom via effects */}
      {isNewConversation && !showSettings && !showSessions && <ProjectSelect />}

      {/* Content */}
      {showSettings ? (
        <PermissionSettingsPanel onClose={() => setShowSettings(false)} />
      ) : showSessions ? (
        <SessionList
          activeSessionId={chat.sessionId}
          onSelect={handleSelectSession}
          onClose={() => setShowSessions(false)}
        />
      ) : showAgentTree && rootSessionId ? (
        <div className="flex-1 overflow-y-auto p-3">
          <DiscussionTreeView sessionId={rootSessionId} onNavigate={handleTreeNavigate} />
        </div>
      ) : isNewConversation && !hasContext ? (
        <NoProjectsPlaceholder wsSlug={activeWsSlug} />
      ) : (
        <>
          {/* Detached runs panel — panel/sidebar layout (collapsible historical view) */}
          {finishedRuns.length > 0 && (
            <DetachedRunsPanel
              runs={finishedRuns}
              hasActiveRuns={false}
              onViewRun={handleViewRun}
              onStopRun={handleStopRun}
            />
          )}
          {/* The composer floats over the transcript: the messages scroll under its glass. */}
          <div className="relative flex flex-1 min-h-0 flex-col">
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
              bottomInset={dockHeight}
            />
            <ComposerDock onHeight={setDockHeight}>
              <CompactionBanner visible={chat.isCompacting && capabilities.compaction_signal} />
              <SecretRequestTray sessionId={chat.sessionId} />
              {composerNotices}
              <ChatInput
                onSend={handleSend}
                onQueue={chat.queueMessage}
                onQueueOp={chat.queueOp}
                onInterrupt={chat.interrupt}
                isStreaming={chat.isStreaming}
                disabled={composerDisabled}
                disabledReason={composerBlockedReason}
                sessionId={chat.sessionId}
                onChangePermissionMode={chat.changePermissionMode}
                onChangeModel={chat.changeModel}
                onNewConversation={handleNewSession}
                onChangeAutoContinue={chat.changeAutoContinue}
                prefill={prefill}
                activity={activity}
                runActions={runActions}
              />
            </ComposerDock>
          </div>
        </>
      )}
    </div>
    </ChatCapabilitiesProvider>
    </ChatSessionProvider>
  )
}

/** Full-area placeholder shown when the workspace has no projects */
function NoProjectsPlaceholder({ wsSlug }: { wsSlug: string | null }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
      {/* Folder illustration — matches EmptyState style */}
      <svg width={72} height={72} viewBox="0 0 80 80" fill="none" aria-hidden="true" className="mb-5">
        <path d="M16 24h16l4-6h28a3 3 0 013 3v38a3 3 0 01-3 3H16a3 3 0 01-3-3V27a3 3 0 013-3z" stroke="currentColor" className="text-gray-700" strokeWidth="1.5" />
        <line x1="13" y1="32" x2="67" y2="32" stroke="currentColor" className="text-gray-700" strokeWidth="1" />
        <rect x="24" y="40" width="16" height="2" rx="1" className="fill-gray-700" />
        <rect x="24" y="46" width="12" height="2" rx="1" className="fill-gray-700/50" />
        <circle cx="58" cy="52" r="10" className="fill-indigo-500/10" />
        <path d="M55 52h6M58 49v6" stroke="currentColor" className="text-indigo-400" strokeWidth="1.5" strokeLinecap="round" />
      </svg>

      <h3 className="text-base font-medium text-gray-200 mb-1.5">No projects yet</h3>
      <p className="text-sm text-gray-500 max-w-[240px] mb-5">
        Add a project to this workspace to start a conversation with Claude.
      </p>

      {wsSlug && (
        <Link
          to={workspacePath(wsSlug, '/projects')}
          className={`${glassButton.primary} min-h-9 gap-2 px-4 py-2 text-sm`}
        >
          <FolderPlus className="w-4 h-4" aria-hidden="true" />
          Add a project
        </Link>
      )}
    </div>
  )
}
