import { atom } from 'jotai'
import type { ChatPanelMode, WsConnectionStatus } from '@/types'

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
