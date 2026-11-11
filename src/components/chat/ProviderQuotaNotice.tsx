import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useT } from '@/i18n'
import type { Translator } from '@/i18n/translate'
import { formatWhenFr } from '@/constants/providerWizard'
import { providersApi, providerRefusalMessage } from '@/services/providers'
import type { QuotaView } from '@/types/quota'

/**
 * The provider ACCOUNT's quota, INSIDE the model menu — where the blockage is felt, and only when
 * there is a blockage.
 *
 * A person who is refused a model reads it as "PO no longer uses that model": measured 11/11/2026,
 * with a hold on the family `Fable` dated three days out while the account served on everything
 * else. So the notice names WHAT is out (the account, or which family) and until when, and offers
 * the one human escape hatch — forgetting what the server remembers — with an inline confirmation
 * (never a modal, and never without a blockage: nothing renders when the quota is unknown or fine).
 *
 * The read is the menu's own, per provider, and starts when the menu opens. A read that fails
 * renders nothing: this is a hint, not a status; the settings card is where an unreadable quota is
 * said and retried.
 */
export function ProviderQuotaNotice({
  providerId,
  name,
  active,
  onCleared,
}: {
  providerId: string
  name: string
  /** The menu is open: read the quota (a closed menu does not touch the network). */
  active: boolean
  /** What the server remembers was forgotten: the caller may want to refresh its own view. */
  onCleared?: () => void
}) {
  const tr = useT()
  const { t } = tr
  const [read, setRead] = useState<{ now_ms: number; view: QuotaView } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    // A hint must never break the menu: a caller (or a test) whose provider service has no quota
    // read simply gets no notice. The real service always has it.
    if (!active || typeof providersApi.quota !== 'function') return
    let live = true
    providersApi.quota(providerId).then(
      (res) => {
        if (live) setRead(res.quota ? { now_ms: res.now_ms, view: res.quota } : null)
      },
      () => {
        if (live) setRead(null)
      },
    )
    return () => {
      live = false
    }
  }, [active, providerId])

  useEffect(load, [load])

  // Nothing known, or nothing held: the menu says nothing at all.
  const view = read?.view ?? null
  const holds = view?.model_holds ?? []
  if (!read || !view || (!view.exhausted && holds.length === 0)) return null

  const now_ms = read.now_ms
  const reset = (ms: number) => {
    const date = new Date(ms)
    return Number.isNaN(date.getTime()) ? null : formatWhenFr(tr, date.toISOString())
  }
  const when = age(t, now_ms - view.observed_at_ms)

  const clear = async () => {
    setBusy(true)
    setError(null)
    try {
      await providersApi.clearQuota(providerId)
      setConfirming(false)
      setRead(null)
      onCleared?.()
    } catch (err) {
      setError(providerRefusalMessage(err, t('routing.quota.failed')))
    } finally {
      setBusy(false)
    }
  }

  const exhausted = view.exhausted
  const accountUntil = exhausted?.reset_known ? reset(exhausted.resets_at_ms) : null
  const families = holds.map((h) => ({
    model: h.model,
    until: h.reset_known ? reset(h.resets_at_ms) : null,
  }))
  const what = exhausted
    ? accountUntil
      ? t('routing.quota.confirmWhatAccount', { name, time: accountUntil })
      : t('routing.quota.confirmWhatAccountOpen', { name })
    : t('routing.quota.confirmWhatFamily', {
        list: families.map((f) => f.model).join(', '),
        time: families[0]?.until ?? t('routing.quota.familyOpen', { model: families[0]?.model ?? '' }),
      })

  return (
    <div
      data-testid={`routing-quota-${providerId}`}
      className="mx-3 mb-1.5 rounded border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1.5 text-[10px] leading-snug text-amber-100"
    >
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0 text-amber-300" aria-hidden />
        <span className="min-w-0">
          {exhausted && (
            <>
              {accountUntil ? t('routing.quota.accountUntil', { time: accountUntil }) : t('routing.quota.accountOpen')}
              {exhausted.window ? t('routing.quota.accountWindow', { window: exhausted.window }) : ''}
            </>
          )}
          {families.map((f, i) => (
            <span key={f.model} className={exhausted || i > 0 ? 'block' : undefined}>
              {f.until ? t('routing.quota.familyUntil', { model: f.model, time: f.until }) : t('routing.quota.familyOpen', { model: f.model })}
            </span>
          ))}
          <span className="block text-amber-200/60">{t('routing.quota.observed', { when })}</span>
        </span>
      </p>

      {confirming ? (
        <div className="mt-1.5 space-y-1">
          <p className="font-medium text-amber-100">{t('routing.quota.confirmTitle', { name })}</p>
          <p className="text-amber-100/80">{t('routing.quota.confirmBody', { what })}</p>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              data-testid={`routing-quota-confirm-${providerId}`}
              onClick={clear}
              className="rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-50 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {t('routing.quota.confirmYes')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false)
                setError(null)
              }}
              className="rounded px-2 py-0.5 text-amber-100/80 hover:text-amber-50"
            >
              {t('routing.quota.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          data-testid={`routing-quota-unlock-${providerId}`}
          aria-label={t('routing.quota.unlockAria', { name })}
          onClick={() => setConfirming(true)}
          className="mt-1.5 rounded bg-amber-500/20 px-2 py-0.5 font-medium text-amber-50 hover:bg-amber-500/30"
        >
          {t('routing.quota.unlock')}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-1 text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}

/** "observed 12 min ago", with the same words the settings card uses. */
function age(t: Translator['t'], ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 1) return t('providerAdmin.quota.agoNow')
  if (minutes < 60) return t('providerAdmin.quota.agoMinutes', { n: minutes })
  if (minutes < 24 * 60) return t('providerAdmin.quota.agoHours', { n: Math.floor(minutes / 60) })
  return t('providerAdmin.quota.agoDays', { n: Math.floor(minutes / (24 * 60)) })
}
