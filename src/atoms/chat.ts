import { atom } from 'jotai'
import type { ChatPanelMode } from '@/types'

/** Hint set by pages that know which project the user is looking at */
export const chatSuggestedProjectIdAtom = atom<string | null>(null)

export const chatPanelModeAtom = atom<ChatPanelMode>('closed')
export const chatSessionIdAtom = atom<string | null>(null)
export const chatStreamingAtom = atom<boolean>(false)
