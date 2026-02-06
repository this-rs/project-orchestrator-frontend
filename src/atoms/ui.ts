import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export const sidebarCollapsedAtom = atom<boolean>(false)

export const globalSearchQueryAtom = atom<string>('')

export const activeModalAtom = atom<string | null>(null)

export const toastMessagesAtom = atom<
  { id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string }[]
>([])

export const tasksViewModeAtom = atomWithStorage<'list' | 'kanban'>('tasks-view-mode', 'list')
