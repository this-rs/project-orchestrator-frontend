/**
 * WebUpdateBanner — displays a notification when a newer version of
 * Project Orchestrator is available on GitHub.
 *
 * This is for the web/server deployment mode. It does NOT render when
 * running inside Tauri (the Tauri UpdateBanner handles that case).
 */
import { AlertCircle, X } from 'lucide-react'
import { useUpdateCheck } from '@/hooks'
import { ExternalLink } from '@/components/ui/ExternalLink'

export function WebUpdateBanner() {
  const { updateAvailable, latestVersion, currentVersion, releaseUrl, dismissed, dismiss } =
    useUpdateCheck()

  // Don't show if no update, already dismissed, or in Tauri mode
  if (!updateAvailable || dismissed) return null

  return (
    <div className="border-b border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-800 dark:bg-blue-950">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* Info icon */}
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />

          <p className="text-sm text-blue-800 dark:text-blue-200">
            <span className="font-medium">Version {latestVersion}</span> is available
            {currentVersion && (
              <span className="text-blue-600 dark:text-blue-400"> (current: {currentVersion})</span>
            )}
            {releaseUrl && (
              <>
                {' — '}
                <ExternalLink
                  href={releaseUrl}
                  className="font-medium underline hover:text-blue-900 dark:hover:text-blue-100"
                >
                  View release notes
                </ExternalLink>
              </>
            )}
          </p>
        </div>

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          className="flex-shrink-0 rounded p-1 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900 dark:hover:text-blue-300"
          aria-label="Dismiss update notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
