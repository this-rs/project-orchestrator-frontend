/**
 * VaultWaitBanner — where the user looks (the composer) says that the turn is held
 * by a locked secrets vault, for how long, and offers the unlock on the spot.
 *
 * Driven by `chatVaultWaitAtom`, which only a LIVE `credentials_locked` notice sets
 * (never a replayed one) and which `model_recovered`, a result and an interrupt clear.
 */
import { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { Lock } from 'lucide-react'
import { chatVaultWaitAtom } from '@/atoms'
import { useT } from '@/i18n'
import { VaultUnlock } from './VaultUnlock'

interface VaultWaitBannerProps {
  /** The conversation this composer belongs to: another one's wait is not shown. */
  sessionId?: string | null
  /** The vault is open: the caller sends the held message again. */
  onUnlocked?: () => void
}

export function VaultWaitBanner({ sessionId, onUnlocked }: VaultWaitBannerProps) {
  const { t } = useT()
  const [wait, setWait] = useAtom(chatVaultWaitAtom)
  const [now, setNow] = useState(() => Date.now())
  const [unlocking, setUnlocking] = useState(false)
  const active = wait != null && (wait.sessionId ?? null) === (sessionId ?? null)

  // One tick a second, only while the wait is on screen.
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active, wait?.since])

  if (!wait || !active) return null
  const total = Math.max(0, Math.floor((now - wait.since) / 1000))
  const elapsed =
    total < 60
      ? t('session.vaultWait.seconds', { s: total })
      : t('session.vaultWait.minutes', { m: Math.floor(total / 60), s: total % 60 })

  return (
    <div
      data-testid="vault-wait-banner"
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-100"
    >
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span role="status" className="flex-1">
          {t('session.vaultWait.banner', { elapsed })}
        </span>
        {!unlocking && (
          <button
            type="button"
            onClick={() => setUnlocking(true)}
            className="shrink-0 rounded px-2 py-0.5 text-amber-50 hover:bg-amber-500/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-300"
          >
            {t('session.vaultWait.unlock')}
          </button>
        )}
      </div>
      {unlocking && (
        <div className="mt-1.5">
          <VaultUnlock
            onUnlocked={() => {
              setWait(null)
              setUnlocking(false)
              onUnlocked?.()
            }}
          />
        </div>
      )}
    </div>
  )
}
