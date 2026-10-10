import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { CLAUDE_CODE_CAPABILITIES, type ProviderCapabilities } from '@/types/provider'

/**
 * Lightweight context exposing the current chat `sessionId` to descendants
 * deep in the message tree (e.g., `ToolCallBlock` for the per-tool Stop
 * button) without prop-drilling through 4 components.
 *
 * Mounted by `ChatPanel` once per active session.
 */
interface ChatSessionContextValue {
  /** UUID of the currently-open chat session, or null on the "new conversation" screen. */
  sessionId: string | null
  /**
   * Cancel the running tools over the chat socket (`cancel_tools` frame). False = not
   * sent (socket not open on this session): the caller falls back to REST.
   */
  cancelToolsLive?: () => boolean
}

const ChatSessionContext = createContext<ChatSessionContextValue>({ sessionId: null })

export function ChatSessionProvider({
  sessionId,
  cancelToolsLive,
  children,
}: {
  sessionId: string | null
  cancelToolsLive?: () => boolean
  children: ReactNode
}) {
  const value = useMemo(() => ({ sessionId, cancelToolsLive }), [sessionId, cancelToolsLive])
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
