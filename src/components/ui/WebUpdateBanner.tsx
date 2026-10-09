/**
 * WebUpdateBanner — "a newer version is available" for the web/server deployment,
 * with the actions the server supports:
 *
 * - standalone binary → "Install update", then "Restart now" once it is staged;
 * - any other deployment (Docker, package manager, source…) → the command to run;
 * - older servers without the update service → notification only.
 *
 * It does NOT render when running inside Tauri (the Tauri UpdateBanner handles that).
 */
import { useState } from 'react'
import { AlertCircle, Download, Loader2, RotateCw, X } from 'lucide-react'
import { useUpdateCheck } from '@/hooks'
import { useT } from '@/i18n'
import { ExternalLink } from '@/components/ui/ExternalLink'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const ACTION_BTN =
  'inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60'

export function WebUpdateBanner() {
  const { t } = useT()
  const {
    updateAvailable,
    latestVersion,
    currentVersion,
    releaseUrl,
    dismissed,
    dismiss,
    status,
    install,
    restart,
    acting,
    restarting,
    actionError,
  } = useUpdateCheck()
  const [confirmRestart, setConfirmRestart] = useState(false)

  const staged = status?.staged_version ?? null
  const installing = status?.installing === true
  const installError = status?.install_error ?? null

  // Something is in progress or waiting on the user: show it even if dismissed.
  const pending = installing || restarting || staged !== null || installError !== null
  if (!pending && (!updateAvailable || dismissed)) return null

  const canInstall = !!status?.self_update_supported && !installing && staged === null

  return (
    <div
      className="border-b border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-800 dark:bg-blue-950"
      role="status"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />

          <p className="text-sm text-blue-800 dark:text-blue-200">
            {restarting ? (
              <>{t('ui.webUpdate.restarting', { version: staged ?? latestVersion ?? '' })}</>
            ) : installing ? (
              <>{t('ui.webUpdate.downloading', { version: latestVersion ?? '' })}</>
            ) : staged ? (
              <>
                <span className="font-medium">{t('ui.webUpdate.version', { version: staged })}</span>{' '}
                {t('ui.webUpdate.installedReady')}{' '}
                {status?.restart_supported ? t('ui.webUpdate.restartToApply') : t('ui.webUpdate.restartManually')}
              </>
            ) : (
              <>
                <span className="font-medium">{t('ui.webUpdate.version', { version: latestVersion ?? '' })}</span>{' '}
                {t('ui.webUpdate.available')}
                {currentVersion && (
                  <span className="text-blue-600 dark:text-blue-400"> {t('ui.webUpdate.current', { version: currentVersion })}</span>
                )}
                {releaseUrl && (
                  <>
                    {' — '}
                    <ExternalLink
                      href={releaseUrl}
                      className="font-medium underline hover:text-blue-900 dark:hover:text-blue-100"
                    >
                      {t('ui.webUpdate.releaseNotes')}
                    </ExternalLink>
                  </>
                )}
              </>
            )}
            {status && !status.self_update_supported && !staged && !installing && status.update_hint && (
              <span className="text-blue-700 dark:text-blue-300"> · {t('ui.webUpdate.toUpdate', { hint: status.update_hint })}</span>
            )}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {(installing || restarting) && <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-label={t('ui.webUpdate.installing')} />}
          {canInstall && (
            <button onClick={install} disabled={acting} className={ACTION_BTN}>
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {installError ? t('ui.webUpdate.retryInstall') : t('ui.webUpdate.install')}
            </button>
          )}
          {staged && !restarting && status?.restart_supported && (
            <button onClick={() => setConfirmRestart(true)} disabled={acting} className={ACTION_BTN}>
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              {t('ui.webUpdate.restartNow')}
            </button>
          )}
          {!pending && (
            <button
              onClick={dismiss}
              className="rounded p-1 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900 dark:hover:text-blue-300"
              aria-label={t('ui.webUpdate.dismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {(installError || actionError) && (
        <p className="mx-auto mt-1.5 max-w-7xl text-xs text-red-600 dark:text-red-400" role="alert">
          {installError ? t('ui.webUpdate.installFailed', { error: installError }) : actionError}
        </p>
      )}

      <ConfirmDialog
        open={confirmRestart}
        onClose={() => setConfirmRestart(false)}
        onConfirm={async () => {
          await restart()
          setConfirmRestart(false)
        }}
        title={t('ui.webUpdate.restartTitle')}
        description={t('ui.webUpdate.restartDescription', { version: staged ?? '' })}
        confirmLabel={t('ui.webUpdate.restartNow')}
        variant="warning"
      />
    </div>
  )
}
