/**
 * A provider failure on the SETTINGS page, in French and in its context: the
 * page retries with "Tester" (not by sending a message), a login is a command
 * to run on the server, a locked vault links to the vault.
 *
 * The chat keeps `ProviderStateCard` (its own wording and actions).
 */
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ClipboardCopy } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  PROVIDER_ERROR_TITLES,
  PROVIDER_ERROR_TITLES_SETTINGS_FR,
  RETRY_BY_TESTING_TEXT_FR,
  VAULT_PATH,
} from '@/constants/providerErrors'
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
      <Button size="sm" variant="ghost" flat onClick={copy} aria-label="Copier la commande" className="shrink-0 gap-1 px-2 text-xs text-gray-300">
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {copied ? 'Copiée' : 'Copier'}
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
  const title = PROVIDER_ERROR_TITLES_SETTINGS_FR[error.code] ?? PROVIDER_ERROR_TITLES[error.code]
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
            ? 'Ce provider demande une connexion. Lancez la commande ci-dessous sur le serveur, puis cliquez sur Tester. Project Orchestrator ne se connecte pas à votre place.'
            : providerErrorFr(error)}
          {RETRYABLE.has(error.code) && ` ${RETRY_BY_TESTING_TEXT_FR}`}
        </p>
        {error.code === 'auth_required' && error.login_hint && (
          <Command command={error.login_hint} />
        )}
        {error.code === 'credentials_locked' && (
          <Link
            to={VAULT_PATH}
            className="mt-1 inline-block text-indigo-300 underline hover:text-indigo-200"
          >
            Déverrouiller le coffre
          </Link>
        )}
      </div>
    </div>
  )
}
