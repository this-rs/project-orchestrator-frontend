/**
 * useUpdateCheck — "a newer version is available", plus the actions to apply it.
 *
 * Source of truth, in order:
 * 1. The server's own update service: `GET /api/version` → `update` (backend ≥ 0.0.16).
 *    It knows whether the deployment can update itself, the install progress and
 *    whether a restart is pending, and exposes check / install / restart actions.
 * 2. Older servers (no `update` field): compare `/api/version` with the latest
 *    GitHub release in the browser. Notification only, no actions.
 *
 * Skips entirely inside Tauri (the Tauri updater handles that case).
 * Dismiss state is persisted in localStorage with a 24h TTL.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { updateApi } from '@/services/update'
import { apiErrorMessage } from '@/services/api'
import type { ServerUpdateStatus } from '@/types/update'

// ============================================================================
// Types
// ============================================================================

interface GitHubRelease {
  tag_name: string
  html_url: string
  body: string | null
}

interface VersionResponse {
  version: string
  update?: ServerUpdateStatus | null
}

export interface UpdateCheckResult {
  /** Whether a newer version is available */
  updateAvailable: boolean
  /** The latest version string (e.g. "0.2.0") */
  latestVersion: string | null
  /** The currently running server version */
  currentVersion: string | null
  /** URL to the GitHub release page */
  releaseUrl: string | null
  /** Whether the user has dismissed the notification */
  dismissed: boolean
  /** Dismiss the notification (persists for 24h) */
  dismiss: () => void
  /** Whether we're currently checking */
  loading: boolean
  /** Server update state; null on servers without the update service (or before the first check) */
  status: ServerUpdateStatus | null
  /** Ask the server to query GitHub now */
  check: () => Promise<void>
  /** Download and stage the latest release (standalone deployments) */
  install: () => Promise<void>
  /** Restart the server to apply the staged update */
  restart: () => Promise<void>
  /** An action is in flight */
  acting: boolean
  /** The server was asked to restart and has not come back yet */
  restarting: boolean
  /** Last action failure, shown to the user */
  actionError: string | null
}

// ============================================================================
// Constants
// ============================================================================

const GITHUB_REPO = 'this-rs/project-orchestrator'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
const INSTALL_POLL_MS = 2000 // while the server downloads
const DISMISS_KEY = 'orchestrator-update-dismissed'
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

// ============================================================================
// Helpers
// ============================================================================

function isTauriEnv(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

interface Semver {
  core: [number, number, number]
  prerelease: boolean
}

/** Parse "1.2.3", "v1.2.3", "1.2.3-rc1" or "1.2.3+build" (build metadata is ignored). */
export function parseSemver(version: string): Semver | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/.exec(version.trim())
  if (!m) return null
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], prerelease: m[4] !== undefined }
}

/** True when `latest` is strictly newer than `current` (a pre-release sorts before its release). */
export function isNewer(current: string, latest: string): boolean {
  const c = parseSemver(current)
  const l = parseSemver(latest)
  if (!c || !l) return false
  for (let i = 0; i < 3; i++) {
    if (l.core[i] !== c.core[i]) return l.core[i] > c.core[i]
  }
  return c.prerelease && !l.prerelease
}

/** Check if a dismiss is still valid (within TTL) */
export function isDismissed(version: string): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const data = JSON.parse(raw) as { version: string; timestamp: number }
    if (data.version !== version) return false
    return Date.now() - data.timestamp < DISMISS_TTL_MS
  } catch {
    return false
  }
}

/** Persist dismiss for a specific version */
function persistDismiss(version: string): void {
  try {
    localStorage.setItem(
      DISMISS_KEY,
      JSON.stringify({ version, timestamp: Date.now() }),
    )
  } catch {
    // localStorage might be unavailable
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useUpdateCheck(): UpdateCheckResult {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<ServerUpdateStatus | null>(null)
  const [acting, setActing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [restarting, setRestarting] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /** Apply a server status to the derived fields. */
  const applyStatus = useCallback((s: ServerUpdateStatus) => {
    setStatus(s)
    setCurrentVersion(s.current)
    setLatestVersion(s.latest)
    setReleaseUrl(s.release_url)
    setUpdateAvailable(s.update_available)
    setDismissed(s.update_available && s.latest ? isDismissed(s.latest) : false)
  }, [])

  /** Read the server's version (and its update status when it has one). */
  const fetchVersion = useCallback(async (): Promise<VersionResponse | null> => {
    const { getApiBase } = await import('@/services/env')
    const resp = await fetch(`${getApiBase()}/version`)
    if (!resp.ok) return null
    return (await resp.json()) as VersionResponse
  }, [])

  const checkForUpdate = useCallback(async () => {
    // Skip in Tauri mode
    if (isTauriEnv()) return

    try {
      setLoading(true)

      // 1. Current server version (and its update status, if it has the service)
      const versionData = await fetchVersion()
      if (!versionData) return
      if (versionData.update) {
        applyStatus(versionData.update)
        return
      }
      const current = versionData.version
      setCurrentVersion(current)
      setStatus(null)

      // 2. Older server: compare with the latest GitHub release ourselves
      const ghResp = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
        { headers: { Accept: 'application/vnd.github.v3+json' } },
      )
      if (!ghResp.ok) return
      const ghData = (await ghResp.json()) as GitHubRelease
      const latest = ghData.tag_name.replace(/^v/, '')

      setLatestVersion(latest)
      setReleaseUrl(ghData.html_url)

      // 3. Compare
      if (isNewer(current, latest)) {
        setUpdateAvailable(true)
        setDismissed(isDismissed(latest))
      } else {
        setUpdateAvailable(false)
      }
    } catch {
      // Silently fail — update check is non-critical
    } finally {
      setLoading(false)
    }
  }, [applyStatus, fetchVersion])

  /** Run a server action; the response is the new status when it has one. */
  const act = useCallback(
    async (run: () => Promise<ServerUpdateStatus | unknown>): Promise<boolean> => {
      setActing(true)
      setActionError(null)
      try {
        const result = await run()
        if (result && typeof result === 'object' && 'update_available' in result) {
          applyStatus(result as ServerUpdateStatus)
        }
        return true
      } catch (e) {
        setActionError(apiErrorMessage(e, 'Update action failed'))
        return false
      } finally {
        setActing(false)
      }
    },
    [applyStatus],
  )

  const check = useCallback(async () => {
    await act(updateApi.check)
  }, [act])
  const install = useCallback(async () => {
    await act(updateApi.install)
  }, [act])
  const restart = useCallback(async () => {
    if (await act(updateApi.restart)) setRestarting(true)
  }, [act])

  const dismiss = useCallback(() => {
    if (latestVersion) {
      persistDismiss(latestVersion)
    }
    setDismissed(true)
  }, [latestVersion])

  // Initial check + periodic interval
  useEffect(() => {
    if (isTauriEnv()) return

    // Check after a short delay (don't block initial render)
    const timeout = setTimeout(checkForUpdate, 5000)

    // Set up periodic check
    intervalRef.current = setInterval(checkForUpdate, CHECK_INTERVAL_MS)

    return () => {
      clearTimeout(timeout)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [checkForUpdate])

  // While the server downloads, follow its progress until it stages or fails.
  const installing = status?.installing === true
  useEffect(() => {
    if (!installing) return
    const id = setInterval(async () => {
      try {
        const data = await fetchVersion()
        if (data?.update) applyStatus(data.update)
      } catch {
        // Server may be busy or restarting; the next tick retries
      }
    }, INSTALL_POLL_MS)
    return () => clearInterval(id)
  }, [installing, applyStatus, fetchVersion])

  // After a restart request the server goes away and comes back with the new
  // binary: poll until it answers with nothing left to restart for.
  useEffect(() => {
    if (!restarting) return
    const id = setInterval(async () => {
      try {
        const data = await fetchVersion()
        if (data?.update && !data.update.restart_required) {
          applyStatus(data.update)
          setRestarting(false)
        }
      } catch {
        // Still down — expected while it restarts
      }
    }, INSTALL_POLL_MS)
    return () => clearInterval(id)
  }, [restarting, applyStatus, fetchVersion])

  return {
    updateAvailable,
    latestVersion,
    currentVersion,
    releaseUrl,
    dismissed,
    dismiss,
    loading,
    status,
    check,
    install,
    restart,
    acting,
    restarting,
    actionError,
  }
}
