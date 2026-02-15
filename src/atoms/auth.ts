import { atom } from 'jotai'
import type { AuthMode, AuthProviderInfo, AuthUser } from '@/types'

/**
 * JWT access token — stored in memory only (NOT localStorage).
 *
 * Security: the access token is short-lived (15min) and never persisted.
 * On page reload, a fresh token is obtained via the HttpOnly refresh cookie
 * (POST /auth/refresh with credentials: 'include').
 */
export const authTokenAtom = atom<string | null>(null)

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
 * In required mode, checks for a valid token OR a loaded user.
 *
 * After page reload, the token is null (memory-only) but the user may
 * be re-authenticated via the HttpOnly cookie during boot. The user
 * atom is set after a successful refresh, making this atom true.
 */
export const isAuthenticatedAtom = atom((get) => {
  if (get(authModeAtom) === 'none') return true
  return get(authTokenAtom) !== null || get(currentUserAtom) !== null
})
