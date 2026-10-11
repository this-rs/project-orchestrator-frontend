/**
 * VaultUnlock — unlock the secrets vault where the user is, inside the provider
 * picker, when a provider's credential sits in the locked vault.
 *
 * Same call as the vault page (`vaultApi.unlock`): the passphrase goes to the
 * vault API and nowhere else. The settings link stays as the fallback.
 */

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import { Check, ChevronDown, Lock } from 'lucide-react'
import { useT } from '@/i18n'
import { ApiError } from '@/services/api'
import { DURATION_CHOICES, vaultApi, vaultErrorMessage } from '@/services/vault'
import { VAULT_PATH } from '@/constants/providerErrors'

/** Default = 1 hour, matching the chat's secret tray. */
const DEFAULT_MINUTES = 60

/** Key for remembering the user's last chosen duration across unlocks (session only). */
const DURATION_STORAGE_KEY = 'po-vault-unlock-minutes'

function readLastDuration(): number {
  try {
    const v = sessionStorage.getItem(DURATION_STORAGE_KEY)
    if (v) {
      const n = Number(v)
      if (DURATION_CHOICES.some((d) => d.minutes === n)) return n
    }
  } catch { /* private mode, blocked storage */ }
  return DEFAULT_MINUTES
}

function saveLastDuration(minutes: number): void {
  try { sessionStorage.setItem(DURATION_STORAGE_KEY, String(minutes)) } catch { /* ignore */ }
}

interface VaultUnlockProps {
  /** Called once the vault is open: the caller re-reads the providers that depend on it. */
  onUnlocked: () => void
  /** The status line once unlocked; the default says the providers were refreshed. */
  doneText?: string
  /** Told when an unlock starts and ends: the caller can hold its other actions meanwhile. */
  onBusyChange?: (busy: boolean) => void
}

export function VaultUnlock({ onUnlocked, doneText, onBusyChange }: VaultUnlockProps) {
  const { t } = useT()
  const inputId = useId()
  const durationId = useId()
  const [passphrase, setPassphrase] = useState('')
  const [minutes, setMinutes] = useState(readLastDuration)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const doneRef = useRef<HTMLParagraphElement>(null)
  // An unlock still running when the form goes away (the card was dismissed, or the
  // message went out another way) must not act for it: `onUnlocked` would send a
  // message nobody is looking at any more (review of #335, finding 1).
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

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
      await vaultApi.unlock(passphrase, minutes)
      if (!mounted.current) return
      saveLastDuration(minutes)
      setPassphrase('')
      setDone(true)
      onUnlocked()
    } catch (err) {
      if (!mounted.current) return
      // The server answers 403 for a wrong passphrase; anything else (rate limit,
      // network) is said as the server or the browser says it.
      const wrong = err instanceof ApiError && err.status === 403
      setError(wrong ? t('session.vaultUnlock.wrongPassphrase') : t('session.vaultUnlock.failed', { reason: vaultErrorMessage(err) }))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  if (done) {
    return (
      <p ref={doneRef} tabIndex={-1} role="status" className="flex items-center gap-1.5 text-xs text-emerald-200 focus:outline-none">
        <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
        {doneText ?? t('session.vaultUnlock.done')}
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
        {/* Duration selector — reuses the same choices as VaultPage / SecretRequestTray */}
        <div className="relative shrink-0">
          <select
            id={durationId}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            disabled={busy}
            aria-label={t('session.vaultUnlock.durationLabel')}
            className="h-7 appearance-none rounded border border-white/[0.08] bg-surface-base pl-2 pr-6 text-xs text-gray-200 focus:outline-none focus:border-indigo-400/50 focus-visible:ring-1 focus-visible:ring-indigo-300 disabled:opacity-60"
          >
            {DURATION_CHOICES.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                {d.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        </div>
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
