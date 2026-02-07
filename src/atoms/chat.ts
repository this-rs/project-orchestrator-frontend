import { atom } from 'jotai'
import type { ChatPanelMode } from '@/types'

export interface ChatProjectContext {
  slug: string
  rootPath: string
  name: string
}

export const chatPanelModeAtom = atom<ChatPanelMode>('closed')
export const chatSessionIdAtom = atom<string | null>(null)
export const chatStreamingAtom = atom<boolean>(false)
export const chatProjectContextAtom = atom<ChatProjectContext | null>(null)
