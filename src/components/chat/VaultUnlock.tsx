/**
 * VaultUnlock — unlock the secrets vault where the user is, inside the provider
 * picker, when a provider's credential sits in the locked vault.
 *
 * Same call as the vault page (`vaultApi.unlock`): the passphrase goes to the
 * vault API and nowhere else. The settings link stays as the fallback.
 */

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import { Check, Lock } from 'lucide-react'
import { useT } from '@/i18n'
import { ApiError } from '@/services/api'
import { vaultApi, vaultErrorMessage } from '@/services/vault'
import { VAULT_PATH } from '@/constants/providerErrors'

/** Same default as the chat's secret tray: an hour, then the vault locks itself again. */
const UNLOCK_MINUTES = 60

interface VaultUnlockProps {
  /** Called once the vault is open: the caller re-reads the providers that depend on it. */
  onUnlocked: () => void
}

export function VaultUnlock({ onUnlocked }: VaultUnlockProps) {
  const { t } = useT()
  const inputId = useId()
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const doneRef = useRef<HTMLParagraphElement>(null)

  // The form unmounts on success: the focus moves to the status line instead of
  // falling back to the page.
  useEffect(() => {
    if (done) doneRef.current?.focus()
  }, [done])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy || passphrase.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await vaultApi.unlock(passphrase, UNLOCK_MINUTES)
      setPassphrase('')
      setDone(true)
      onUnlocked()
    } catch (err) {
      // The server answers 403 for a wrong passphrase; anything else (rate limit,
      // network) is said as the server or the browser says it.
      const wrong = err instanceof ApiError && err.status === 403
      setError(wrong ? t('session.vaultUnlock.wrongPassphrase') : t('session.vaultUnlock.failed', { reason: vaultErrorMessage(err) }))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <p ref={doneRef} tabIndex={-1} role="status" className="flex items-center gap-1.5 text-xs text-emerald-200 focus:outline-none">
        <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
        {t('session.vaultUnlock.done')}
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-1.5" aria-busy={busy || undefined}>
      <label htmlFor={inputId} className="flex items-center gap-1.5 text-xs text-gray-200">
        <Lock className="h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
        {t('session.vaultUnlock.locked')}
      </label>
      <div className="flex items-center gap-1.5">
        <input
          id={inputId}
          type="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          placeholder={t('session.vaultUnlock.placeholder')}
          disabled={busy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="min-w-0 flex-1 h-7 rounded border border-white/[0.08] bg-surface-base px-2 text-base text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-400/50 focus-visible:ring-1 focus-visible:ring-indigo-300 sm:text-xs"
        />
        <button
          type="submit"
          disabled={busy || passphrase.length === 0}
          className="h-7 shrink-0 rounded border border-indigo-400/40 bg-indigo-500/15 px-2 text-xs font-medium text-indigo-100 hover:bg-indigo-500/25 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-300 disabled:opacity-60"
        >
          {busy ? t('session.vaultUnlock.submitting') : t('session.vaultUnlock.submit')}
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} role="alert" className="text-[11px] leading-snug text-red-200">
          {error}
        </p>
      )}
      <SettingsFallback label={t('session.vaultUnlock.settings')} />
    </form>
  )
}

/** Link to the vault settings; a plain anchor outside a router (tests, standalone mounts). */
function SettingsFallback({ label }: { label: string }) {
  const inRouter = useInRouterContext()
  const className =
    'inline-flex min-h-6 items-center text-[11px] text-indigo-300 underline underline-offset-2 hover:text-indigo-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-indigo-300'
  return inRouter ? (
    <Link to={VAULT_PATH} className={className}>
      {label}
    </Link>
  ) : (
    <a href={VAULT_PATH} className={className}>
      {label}
    </a>
  )
}
