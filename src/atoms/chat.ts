import { atom } from 'jotai'
import type { ChatPanelMode, PermissionConfig, PermissionMode, Project, WsConnectionStatus } from '@/types'

/** Hint set by pages that know which project the user is looking at */
export const chatSuggestedProjectIdAtom = atom<string | null>(null)

export const chatPanelModeAtom = atom<ChatPanelMode>('closed')
export const chatPanelWidthAtom = atom<number>(400)
export const chatSessionIdAtom = atom<string | null>(null)
export const chatStreamingAtom = atom<boolean>(false)

/** Whether the context window is currently being compacted (PreCompact hook fired, waiting for compact_boundary) */
export const chatCompactingAtom = atom<boolean>(false)

/** WebSocket connection status for the chat */
export const chatWsStatusAtom = atom<WsConnectionStatus>('disconnected')

/** Whether the chat is replaying persisted events (after WS connect) */
export const chatReplayingAtom = atom<boolean>(false)

/** Scroll-to-message target from search results (null = no scroll target) */
export const chatScrollToTurnAtom = atom<{
  turnIndex: number
  snippet?: string
  /** Unix timestamp (seconds) from the search hit — used for exact matching */
  createdAt?: number
  role?: 'user' | 'assistant'
} | null>(null)

/** Runtime permission config (loaded from server, null = not yet loaded) */
export const chatPermissionConfigAtom = atom<PermissionConfig | null>(null)

/** Per-session permission mode override (null = use server default) */
export const chatSessionPermissionOverrideAtom = atom<PermissionMode | null>(null)

/** Active model for the current session (null = not yet known / use default) */
export const chatSessionModelAtom = atom<string | null>(null)

/** Tools auto-approved via "Remember for this session" checkbox (reset on new session) */
export const chatAutoApprovedToolsAtom = atom<Set<string>>(new Set<string>())

/** Whether auto-continue is enabled (automatically sends "Continue" after max_turns) */
export const chatAutoContinueAtom = atom<boolean>(false)

/** Draft text in the chat input textarea (survives layout switches & settings overlay) */
export const chatDraftInputAtom = atom<string>('')

/** Selected project for new conversations (survives layout switches & new-session) */
export const chatSelectedProjectAtom = atom<Project | null>(null)

/** Derived: true when permission mode requires interactive approval (not bypassPermissions) */
export const chatPermissionInteractiveAtom = atom((get) => {
  const config = get(chatPermissionConfigAtom)
  return config !== null && config.mode !== 'bypassPermissions'
})
