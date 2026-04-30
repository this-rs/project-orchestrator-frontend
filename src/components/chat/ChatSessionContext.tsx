import { createContext, useContext, type ReactNode } from 'react'

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
}

const ChatSessionContext = createContext<ChatSessionContextValue>({ sessionId: null })

export function ChatSessionProvider({
  sessionId,
  children,
}: {
  sessionId: string | null
  children: ReactNode
}) {
  return (
    <ChatSessionContext.Provider value={{ sessionId }}>
      {children}
    </ChatSessionContext.Provider>
  )
}

/** Read the current chat sessionId. Returns null on the welcome screen. */
// eslint-disable-next-line react-refresh/only-export-components
export function useChatSessionId(): string | null {
  return useContext(ChatSessionContext).sessionId
}
