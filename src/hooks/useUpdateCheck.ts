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
