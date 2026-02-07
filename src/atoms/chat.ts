import { atom } from 'jotai'
import type { ChatPanelMode } from '@/types'

export const chatPanelModeAtom = atom<ChatPanelMode>('closed')
export const chatSessionIdAtom = atom<string | null>(null)
export const chatStreamingAtom = atom<boolean>(false)
