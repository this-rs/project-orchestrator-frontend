/**
 * WebUpdateBanner — displays a notification when a newer version of
 * Project Orchestrator is available on GitHub.
 *
 * This is for the web/server deployment mode. It does NOT render when
 * running inside Tauri (the Tauri UpdateBanner handles that case).
 */
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
          <svg
            className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400"
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
    </div>
  )
}
