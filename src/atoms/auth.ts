import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { AuthUser } from '@/types'

/** JWT token persisted in localStorage under key "auth_token" */
export const authTokenAtom = atomWithStorage<string | null>('auth_token', null)

/** Current authenticated user (loaded from /auth/me on app start) */
export const currentUserAtom = atom<AuthUser | null>(null)

/** Derived: true when a token is present */
export const isAuthenticatedAtom = atom((get) => get(authTokenAtom) !== null)
