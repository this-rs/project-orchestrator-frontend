/**
 * A provider failure on the SETTINGS page, in its context: the
 * page retries with "Test" (not by sending a message), a login is a command
 * to run on the server, a locked vault links to the vault.
 *
 * The chat keeps `ProviderStateCard` (its own wording and actions).
 */
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ClipboardCopy } from 'lucide-react'
import { Button } from '@/components/ui'
import { PROVIDER_ERROR_TITLES, VAULT_PATH } from '@/constants/providerErrors'
import { useT } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { providerErrorFr } from '@/constants/providerWizard'
import type { ProviderErrorInfo } from '@/types/provider'

const RETRYABLE = new Set([
  'endpoint_unreachable',
  'rate_limited',
  'overloaded',
  'timeout',
  'process_exited',
  'protocol',
])

function Command({ command }: { command: string }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard (insecure context): the command stays selectable.
    }
  }, [command])
  return (
    <div className="mt-2 flex min-w-0 items-center gap-2">
      <code className="min-w-0 flex-1 select-all break-all rounded bg-black/40 px-2 py-1 font-mono text-xs text-gray-100">
        {command}
      </code>
      <Button size="sm" variant="ghost" flat onClick={copy} aria-label={t('settingsShared.errorCard.copyAria')} className="shrink-0 gap-1 px-2 text-xs text-gray-300">
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {copied ? t('settingsShared.errorCard.copied') : t('settingsShared.errorCard.copy')}
      </Button>
    </div>
  )
}

export function SettingsErrorCard({
  error,
  className = '',
  testId,
}: {
  error: ProviderErrorInfo
  className?: string
  testId?: string
}) {
  const { t } = useT()
  const titleKey = `settingsShared.errorTitle.${error.code}` as MessageKey
  const own = t(titleKey)
  const title = own !== titleKey ? own : PROVIDER_ERROR_TITLES[error.code]
  return (
    <div
      role="alert"
      data-testid={testId}
      data-error-code={error.code}
      className={`flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 break-words text-amber-100/80">
          {error.code === 'auth_required' && error.login_hint
            ? t('settingsShared.errorCard.loginHint')
            : providerErrorFr(error, t)}
          {RETRYABLE.has(error.code) && ` ${t('settingsShared.errorCard.retryByTesting')}`}
        </p>
        {error.code === 'auth_required' && error.login_hint && (
          <Command command={error.login_hint} />
        )}
        {error.code === 'credentials_locked' && (
          <Link
            to={VAULT_PATH}
            className="mt-1 inline-block text-indigo-300 underline hover:text-indigo-200"
          >
            {t('settingsShared.errorCard.unlockVault')}
          </Link>
        )}
      </div>
    </div>
  )
}
