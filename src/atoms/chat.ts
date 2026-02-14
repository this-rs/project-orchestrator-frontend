import { atom } from 'jotai'
import type { ChatPanelMode, PermissionConfig, WsConnectionStatus } from '@/types'

/** Hint set by pages that know which project the user is looking at */
export const chatSuggestedProjectIdAtom = atom<string | null>(null)

export const chatPanelModeAtom = atom<ChatPanelMode>('closed')
export const chatPanelWidthAtom = atom<number>(400)
export const chatSessionIdAtom = atom<string | null>(null)
export const chatStreamingAtom = atom<boolean>(false)

/** WebSocket connection status for the chat */
export const chatWsStatusAtom = atom<WsConnectionStatus>('disconnected')

/** Whether the chat is replaying persisted events (after WS connect) */
export const chatReplayingAtom = atom<boolean>(false)

/** Target message turn index for scroll-to-message from search results (null = no scroll target) */
export const chatScrollToTurnAtom = atom<number | null>(null)

/** Runtime permission config (loaded from server, null = not yet loaded) */
export const chatPermissionConfigAtom = atom<PermissionConfig | null>(null)

/** Derived: true when permission mode requires interactive approval (not bypassPermissions) */
export const chatPermissionInteractiveAtom = atom((get) => {
  const config = get(chatPermissionConfigAtom)
  return config !== null && config.mode !== 'bypassPermissions'
})
