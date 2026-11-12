import { useCallback, useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'
import type { Translator } from '@/i18n/translate'
import { formatWhenFr } from '@/constants/providerWizard'
import { providersApi, providerRefusalMessage } from '@/services/providers'
import type { QuotaView } from '@/types/quota'
import { ConfirmPanel } from './ConfirmPanel'

/**
 * What the last read said: a quota (with the server's clock), `'unreadable'` when the read failed
 * or its body was not a quota, `null` while nothing is read yet or when the server knows nothing.
 */
type QuotaRead = { now_ms: number; view: QuotaView } | 'unreadable' | null

/** An instant in the reader's locale; `null` when the number is not a date (`toISOString` would throw). */
function formatInstant(tr: Pick<Translator, 't' | 'date'>, ms: number): string | null {
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? null : formatWhenFr(tr, date.toISOString())
}

/**
 * The provider ACCOUNT's quota (QUOTA), as the server last observed it: until when it refuses,
 * how old that observation is, and — only while a limit is reached (account exhausted or a model
 * family held) — the one human escape hatch,
 * forgetting it, which survives a restart. Renders nothing when the server knows nothing (a quota
 * display is best-effort).
 *
 * A read that FAILED is said, with a way to read again, and no reset is offered: the server has
 * not said that a limit is reached.
 */
export function QuotaStatus({ instanceId, name }: { instanceId: string; name: string }) {
  // One card per instance: what was read, confirmed or refused for one never shows under another.
  return <QuotaCard key={instanceId} instanceId={instanceId} name={name} />
}

function QuotaCard({ instanceId, name }: { instanceId: string; name: string }) {
  const tr = useT()
  const { t } = tr
  const [read, setRead] = useState<QuotaRead>(null)
  const [retrying, setRetrying] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Never rejects: a failure is a state of the card. */
  const load = useCallback(
    () =>
      providersApi.quota(instanceId).then(
        (res) => setRead(res.quota ? { now_ms: res.now_ms, view: res.quota } : null),
        () => setRead('unreadable'),
      ),
    [instanceId],
  )

  useEffect(() => {
    void load()
  }, [load])

  if (read === null) return null
  const known = read === 'unreadable' ? null : read
  const exhausted = known?.view.exhausted ?? null
  // Families out right now (absent on an older server): the account serves, but a limit IS reached.
  const holds = known?.view.model_holds ?? []
  const limitReached = exhausted !== null || holds.length > 0
  // Only an instant the provider (or a person) gave is a date to show: without `reset_known`,
  // `resets_at_ms` is a cooldown the server guessed.
  const reset = exhausted?.reset_known ? formatInstant(tr, exhausted.resets_at_ms) : null
  // What the confirmation says of the families out: each by name, with its date when the provider gave one.
  const holdsWhat = holds
    .map((h) => {
      const until = h.reset_known ? formatInstant(tr, h.resets_at_ms) : null
      return until
        ? t('routing.quota.confirmWhatFamily', { list: h.model, time: until })
        : t('routing.quota.confirmWhatFamilyOpen', { list: h.model })
    })
    .join('; ')

  let when = ''
  if (known) {
    const minutes = Math.max(0, Math.floor((known.now_ms - known.view.observed_at_ms) / 60_000))
    when =
      minutes < 1
        ? t('providerAdmin.quota.agoNow')
        : minutes < 60
          ? t('providerAdmin.quota.agoMinutes', { n: minutes })
          : minutes < 24 * 60
            ? t('providerAdmin.quota.agoHours', { n: Math.floor(minutes / 60) })
            : t('providerAdmin.quota.agoDays', { n: Math.floor(minutes / (24 * 60)) })
  }

  const retry = async () => {
    setRetrying(true)
    await load()
    setRetrying(false)
  }

  const clear = async () => {
    setError(null)
    try {
      await providersApi.clearQuota(instanceId)
      setConfirming(false)
      setRead(null)
    } catch (err) {
      setError(providerRefusalMessage(err, t('providerAdmin.common.errors.requestFailed')))
    }
  }

  return (
    <div
      data-testid={`quota-${instanceId}`}
      className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2.5 text-xs"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-1.5 font-medium text-amber-200">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('providerAdmin.quota.title')}
          </p>
          {known ? (
            <>
              {exhausted && (
                <p className="text-amber-100">
                  {reset ? t('providerAdmin.quota.exhausted', { time: reset }) : t('providerAdmin.quota.exhaustedOpen')}
                  {exhausted.window ? t('providerAdmin.quota.exhaustedWindow', { window: exhausted.window }) : ''}
                </p>
              )}
              {holds.map((h) => {
                const until = h.reset_known ? formatInstant(tr, h.resets_at_ms) : null
                return (
                  <p key={h.model} className="text-amber-100">
                    {until ? t('routing.quota.familyUntil', { model: h.model, time: until }) : t('routing.quota.familyOpen', { model: h.model })}
                  </p>
                )
              })}
              {!exhausted && holds.length === 0 && <p className="text-amber-100/80">{t('providerAdmin.quota.noneKnown')}</p>}
              <p className="text-gray-500">{t('providerAdmin.quota.observed', { when })}</p>
            </>
          ) : (
            <p className="text-amber-100">{t('providerAdmin.quota.unreadable')}</p>
          )}
        </div>

        {/* The reset is offered only when a limit is reached (the account exhausted, or a model
            family held: `clear` drops both): nothing to reset otherwise, and an unreadable state
            does not say that one is. A failed read is retried instead. */}
        {!known && (
          <Button
            size="sm"
            variant="ghost"
            loading={retrying}
            onClick={retry}
            aria-label={t('providerAdmin.quota.retryAria', { name })}
          >
            {t('providerAdmin.ui.retry')}
          </Button>
        )}
        {limitReached && !confirming && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirming(true)}
            aria-label={t('providerAdmin.quota.clearAria', { name })}
          >
            {t('providerAdmin.quota.clear')}
          </Button>
        )}
      </div>

      {confirming && (
        <div className="mt-2">
          <ConfirmPanel
            title={t('providerAdmin.quota.clearTitle', { name })}
            confirmLabel={t('providerAdmin.quota.clearConfirm')}
            cancelLabel={t('providerAdmin.instances.keep')}
            tone="info"
            onConfirm={clear}
            onCancel={() => {
              setConfirming(false)
              setError(null)
            }}
          >
            {!known
              ? t('providerAdmin.quota.clearBodyUnknown', { name })
              : exhausted
                ? reset
                  ? t('providerAdmin.quota.clearBody', { name, time: reset, when })
                  : t('providerAdmin.quota.clearBodyOpen', { name, when })
                : t('providerAdmin.quota.clearBodyFamily', { what: holdsWhat })}
          </ConfirmPanel>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
