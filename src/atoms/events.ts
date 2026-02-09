import { atom } from 'jotai'
import type { EventBusStatus } from '@/types'

export const eventBusStatusAtom = atom<EventBusStatus>('disconnected')

/**
 * Bump counters per entity type. Pages add these to their useEffect deps
 * to re-fetch when a WS CRUD event arrives for that entity type.
 */
export const planRefreshAtom = atom(0)
export const taskRefreshAtom = atom(0)
export const projectRefreshAtom = atom(0)
export const milestoneRefreshAtom = atom(0)
export const noteRefreshAtom = atom(0)
export const workspaceRefreshAtom = atom(0)
export const chatSessionRefreshAtom = atom(0)
