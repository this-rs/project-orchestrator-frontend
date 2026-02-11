/**
 * UpdateBanner — displays an auto-update notification banner when running inside Tauri.
 *
 * Listens for Tauri events:
 * - "update-available": shows the banner with version + release notes
 * - "update-progress": shows download progress bar
 * - "update-installing": shows installing state
 * - "update-error": shows error message
 *
 * Only renders when `window.__TAURI__` is defined (i.e. inside a Tauri webview).
 */
import { useState, useEffect, useCallback } from 'react'

// ============================================================================
// Types
// ============================================================================

interface UpdateAvailablePayload {
  version: string
  body: string | null
  date: string | null
}

interface UpdateProgressPayload {
  downloaded: number
  total: number | null
  percent: number | null
}

interface UpdateInstallingPayload {
  version: string
}

interface UpdateErrorPayload {
  message: string
}

type BannerState =
  | { kind: 'hidden' }
  | { kind: 'available'; version: string; body: string | null }
  | { kind: 'downloading'; percent: number | null; downloaded: number; total: number | null }
  | { kind: 'installing'; version: string }
  | { kind: 'error'; message: string }

// ============================================================================
// Tauri helpers (lazy-loaded to avoid import errors in web mode)
// ============================================================================

async function listenTauri<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<(() => void) | null> {
  try {
    const { listen } = await import('@tauri-apps/api/event')
    const unlisten = await listen<T>(event, (e) => handler(e.payload))
    return unlisten
  } catch {
    return null
  }
}

async function invokeTauri<T>(cmd: string): Promise<T | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<T>(cmd)
  } catch {
    return null
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function truncateMarkdown(md: string | null, maxLen = 200): string {
  if (!md) return ''
  if (md.length <= maxLen) return md
  return md.slice(0, maxLen).trimEnd() + '...'
}

// ============================================================================
// Component
// ============================================================================

export function UpdateBanner() {
  const [state, setState] = useState<BannerState>({ kind: 'hidden' })
  const [dismissed, setDismissed] = useState(false)

  // Listen for Tauri events
  useEffect(() => {
    if (!isTauriEnv()) return

    const unlisteners: ((() => void) | null)[] = []

    const setup = async () => {
      unlisteners.push(
        await listenTauri<UpdateAvailablePayload>('update-available', (payload) => {
          setState({
            kind: 'available',
            version: payload.version,
            body: payload.body,
          })
          setDismissed(false)
        }),
      )

      unlisteners.push(
        await listenTauri<UpdateProgressPayload>('update-progress', (payload) => {
          setState({
            kind: 'downloading',
            percent: payload.percent,
            downloaded: payload.downloaded,
            total: payload.total,
          })
        }),
      )

      unlisteners.push(
        await listenTauri<UpdateInstallingPayload>('update-installing', (payload) => {
          setState({ kind: 'installing', version: payload.version })
        }),
      )

      unlisteners.push(
        await listenTauri<UpdateErrorPayload>('update-error', (payload) => {
          setState({ kind: 'error', message: payload.message })
        }),
      )
    }

    setup()

    return () => {
      unlisteners.forEach((fn) => fn?.())
    }
  }, [])

  const handleInstall = useCallback(async () => {
    setState((prev) => {
      if (prev.kind === 'available') {
        return { kind: 'downloading', percent: 0, downloaded: 0, total: null }
      }
      return prev
    })
    await invokeTauri('install_update')
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
  }, [])

  // Don't render in web mode or if dismissed (except during download/install)
  if (!isTauriEnv()) return null
  if (state.kind === 'hidden') return null
  if (dismissed && state.kind === 'available') return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 mx-auto max-w-2xl px-4 pt-2">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-lg dark:border-blue-800 dark:bg-blue-950">
        {/* Available state */}
        {state.kind === 'available' && (
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className="mt-0.5 flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-600 dark:text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                New version {state.version} available
              </p>
              {state.body && (
                <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                  {truncateMarkdown(state.body)}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={handleInstall}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
              >
                Update now
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-md px-2 py-1.5 text-xs text-blue-600 transition-colors hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900"
              >
                Later
              </button>
            </div>
          </div>
        )}

        {/* Downloading state */}
        {state.kind === 'downloading' && (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Downloading update...
              </p>
              <span className="text-xs text-blue-600 dark:text-blue-400">
                {state.percent != null
                  ? `${state.percent.toFixed(0)}%`
                  : formatBytes(state.downloaded)}
                {state.total != null && ` / ${formatBytes(state.total)}`}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300 ease-out dark:bg-blue-400"
                style={{
                  width: state.percent != null ? `${state.percent}%` : '30%',
                  ...(state.percent == null && {
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }),
                }}
              />
            </div>
          </div>
        )}

        {/* Installing state */}
        {state.kind === 'installing' && (
          <div className="flex items-center gap-3">
            <svg
              className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Installing v{state.version}... The app will restart shortly.
            </p>
          </div>
        )}

        {/* Error state */}
        {state.kind === 'error' && (
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Update check failed
              </p>
              <p className="mt-0.5 text-xs text-red-600 dark:text-red-400">{state.message}</p>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 text-red-400 hover:text-red-600 dark:hover:text-red-300"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
