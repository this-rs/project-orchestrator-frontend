import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export const sidebarCollapsedAtom = atom<boolean>(false)

export const globalSearchQueryAtom = atom<string>('')

export const activeModalAtom = atom<string | null>(null)

export const toastMessagesAtom = atom<
  { id: string; type: 'success' | 'error' | 'info' | 'warning'; message: string }[]
>([])

export const tasksViewModeAtom = atomWithStorage<'list' | 'kanban'>('tasks-view-mode', 'list')

/**
 * Title of the entity shown on the current detail page, published by
 * `PageHeader` so the breadcrumb can show "Auth flow" instead of a raw UUID.
 * Keyed by pathname so a stale title never leaks onto another page.
 */
export const breadcrumbTitleAtom = atom<{ pathname: string; title: string } | null>(null)
