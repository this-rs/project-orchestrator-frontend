import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { CLAUDE_CODE_CAPABILITIES, type ProviderCapabilities } from '@/types/provider'

/**
 * Lightweight context exposing the current chat `sessionId` to descendants
 * deep in the message tree (e.g., `ToolCallBlock` for the per-tool Stop
 * button) without prop-drilling through 4 components.
 *
 * Mounted by `ChatPanel` once per active session.
 */
/**
 * A conversation this session opened, as the transcript needs it: enough to
 * name it, say whether it is still working, and open it. Built from the
 * children endpoint (`useDetachedRuns`), so `toolUseId` is the child's
 * `spawned_by.tool_use_id` — the only join between a native-harness `Agent`
 * tool call and the conversation it ran in.
 */
export interface ChatChildSession {
  sessionId: string
  title: string
  isStreaming: boolean
  /** The parent tool call that opened it, when it was opened by one. */
  toolUseId?: string
}

interface ChatSessionContextValue {
  /** UUID of the currently-open chat session, or null on the "new conversation" screen. */
  sessionId: string | null
  /**
   * Cancel the running tools over the chat socket (`cancel_tools` frame). False = not
   * sent (socket not open on this session): the caller falls back to REST.
   */
  cancelToolsLive?: () => boolean
  /**
   * The conversations this session opened. Empty outside the chat panel (a
   * transcript rendered on a runner page has no children list to read), which
   * is why the sub-agent card says "not listed yet" instead of inventing a link.
   */
  childSessions?: readonly ChatChildSession[]
  /** Show another conversation in this panel. Absent where the panel cannot navigate. */
  openSession?: (sessionId: string) => void
}

const ChatSessionContext = createContext<ChatSessionContextValue>({ sessionId: null })

export function ChatSessionProvider({
  sessionId,
  cancelToolsLive,
  childSessions,
  openSession,
  children,
}: {
  sessionId: string | null
  cancelToolsLive?: () => boolean
  childSessions?: readonly ChatChildSession[]
  openSession?: (sessionId: string) => void
  children: ReactNode
}) {
  const value = useMemo(
    () => ({ sessionId, cancelToolsLive, childSessions, openSession }),
    [sessionId, cancelToolsLive, childSessions, openSession],
  )
  return (
    <ChatSessionContext.Provider value={value}>
      {children}
    </ChatSessionContext.Provider>
  )
}

/** Read the current chat sessionId. Returns null on the welcome screen. */
// eslint-disable-next-line react-refresh/only-export-components
export function useChatSessionId(): string | null {
  return useContext(ChatSessionContext).sessionId
}

/** The socket path of "cancel the running tools", when the transcript has one (see `ChatSessionProvider`). */
// eslint-disable-next-line react-refresh/only-export-components
export function useCancelToolsLive(): (() => boolean) | undefined {
  return useContext(ChatSessionContext).cancelToolsLive
}

/**
 * The child conversation opened by the tool call `toolUseId`, and the way to
 * show it — `undefined` for either when the transcript knows no such child
 * (yet), or cannot navigate.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useChildSessionOf(toolUseId: string | undefined): {
  child?: ChatChildSession
  openSession?: (sessionId: string) => void
} {
  const { childSessions, openSession } = useContext(ChatSessionContext)
  const child = toolUseId ? childSessions?.find((c) => c.toolUseId === toolUseId) : undefined
  return { child, openSession }
}

// ----------------------------------------------------------------------------
// Capabilities of the conversation a transcript belongs to
// ----------------------------------------------------------------------------

/**
 * What the provider behind THIS transcript can do. The default is the full
 * Claude profile: a transcript rendered outside the chat panel (runner, linked
 * discussion, read-only page) belongs to another session than the one the
 * provider atoms describe, and must render exactly as it always has.
 *
 * `ChatPanel` provides the capabilities of the session it shows.
 */
const ChatCapabilitiesContext = createContext<Readonly<ProviderCapabilities>>(CLAUDE_CODE_CAPABILITIES)

export function ChatCapabilitiesProvider({
  capabilities,
  children,
}: {
  capabilities: Readonly<ProviderCapabilities>
  children: ReactNode
}) {
  return <ChatCapabilitiesContext.Provider value={capabilities}>{children}</ChatCapabilitiesContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChatCapabilities(): Readonly<ProviderCapabilities> {
  return useContext(ChatCapabilitiesContext)
}
