/**
 * useUpdateCheck — periodically checks if a newer version of Project Orchestrator
 * is available on GitHub Releases.
 *
 * Compares the server's current version (GET /api/version) with the latest
 * GitHub Release tag. Skips entirely when running inside Tauri (the Tauri
 * updater handles that case).
 *
 * Dismiss state is persisted in localStorage with a 24h TTL.
 */
import { useState, useEffect, useCallback, useRef } from 'react'

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
}

// ============================================================================
// Constants
// ============================================================================

const GITHUB_REPO = 'this-rs/project-orchestrator'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
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

/** Parse semver string to comparable tuple */
function parseSemver(version: string): [number, number, number] | null {
  const v = version.replace(/^v/, '')
  const parts = v.split('.').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  return parts as [number, number, number]
}

/** Check if latest > current */
function isNewer(current: string, latest: string): boolean {
  const c = parseSemver(current)
  const l = parseSemver(latest)
  if (!c || !l) return false
  if (l[0] !== c[0]) return l[0] > c[0]
  if (l[1] !== c[1]) return l[1] > c[1]
  return l[2] > c[2]
}

/** Check if a dismiss is still valid (within TTL) */
function isDismissed(version: string): boolean {
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkForUpdate = useCallback(async () => {
    // Skip in Tauri mode
    if (isTauriEnv()) return

    try {
      setLoading(true)

      // 1. Get current server version
      const { getApiBase } = await import('@/services/env')
      const versionResp = await fetch(`${getApiBase()}/version`)
      if (!versionResp.ok) return
      const versionData = (await versionResp.json()) as VersionResponse
      const current = versionData.version
      setCurrentVersion(current)

      // 2. Get latest GitHub release
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
  }, [])

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

  return {
    updateAvailable,
    latestVersion,
    currentVersion,
    releaseUrl,
    dismissed,
    dismiss,
    loading,
  }
}
