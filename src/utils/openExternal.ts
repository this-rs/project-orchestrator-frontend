/**
 * Detect whether we're running inside a Tauri v2 webview.
 *
 * In Tauri v2, `window.__TAURI__` is only set when `withGlobalTauri` is
 * enabled. The reliable check is `window.__TAURI_INTERNALS__` which is
 * always injected by the Tauri runtime.
 */
export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}
