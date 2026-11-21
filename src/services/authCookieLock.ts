/** Serialize operations that replace or revoke the shared auth cookie.
 * Web Locks are scoped to an origin; different origins sharing a cookie, and
 * browsers without Web Locks, cannot be coordinated here.
 */
export function withAuthCookieLock<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request('project-orchestrator-auth-cookie', action)
  }
  return action()
}
