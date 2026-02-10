import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { AuthMode, AuthProviderInfo, AuthUser } from '@/types'

/** JWT token persisted in localStorage under key "auth_token" */
export const authTokenAtom = atomWithStorage<string | null>('auth_token', null)

/** Current authenticated user (loaded from /auth/me on app start) */
export const currentUserAtom = atom<AuthUser | null>(null)

/**
 * Auth mode determined by GET /auth/providers at app boot.
 * - 'required' (default) → login needed, ProtectedRoute enforces auth
 * - 'none' → open access, no login required
 */
export const authModeAtom = atom<AuthMode>('required')

/** List of available auth providers from GET /auth/providers */
export const authProvidersAtom = atom<AuthProviderInfo[]>([])

/** Whether user registration is allowed (from GET /auth/providers) */
export const allowRegistrationAtom = atom<boolean>(false)

/** Whether auth providers have been fetched (prevents redundant calls) */
export const authProvidersLoadedAtom = atom<boolean>(false)

/**
 * Derived: true when user is considered authenticated.
 * In no-auth mode, always returns true.
 * In required mode, checks for a valid token.
 */
export const isAuthenticatedAtom = atom((get) => {
  if (get(authModeAtom) === 'none') return true
  return get(authTokenAtom) !== null
})
