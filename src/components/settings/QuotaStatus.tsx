import { useCallback, useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui'
import { useT } from '@/i18n'
import { formatWhenFr } from '@/constants/providerWizard'
import { providersApi, toProviderError } from '@/services/providers'
import type { QuotaResponse } from '@/types/quota'
import { ConfirmPanel } from './ConfirmPanel'

/**
 * The provider ACCOUNT's quota (QUOTA), as the server last observed it: until when it refuses,
 * how old that observation is, and the one human escape hatch — forgetting it — that survives a
 * restart. Renders nothing when the server knows nothing (a quota display is best-effort) or when
 * the read failed.
 */
export function QuotaStatus({ instanceId, name }: { instanceId: string; name: string }) {
  const tr = useT()
  const { t } = tr
  const [quota, setQuota] = useState<QuotaResponse | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    // Only a NON-null quota is worth a state update: a null one renders nothing, and setting it
    // would still fire a re-render after the fetch resolves.
    providersApi
      .quota(instanceId)
      .then((res) => {
        if (res?.quota) setQuota(res)
      })
      .catch(() => {})
  }, [instanceId])

  useEffect(() => {
    load()
  }, [load])

  if (!quota?.quota) return null
  const view = quota.quota

  const minutes = Math.max(0, Math.floor((quota.now_ms - view.observed_at_ms) / 60_000))
  const when =
    minutes < 1
      ? t('providerAdmin.quota.agoNow')
      : minutes < 60
        ? t('providerAdmin.quota.agoMinutes', { n: minutes })
        : minutes < 24 * 60
          ? t('providerAdmin.quota.agoHours', { n: Math.floor(minutes / 60) })
          : t('providerAdmin.quota.agoDays', { n: Math.floor(minutes / (24 * 60)) })

  const exhausted = view.exhausted
  const reset = exhausted ? formatWhenFr(tr, new Date(exhausted.resets_at_ms).toISOString()) : null

  const clear = async () => {
    setError(null)
    try {
      await providersApi.clearQuota(instanceId)
      setConfirming(false)
      setQuota(null)
    } catch (err) {
      setError(toProviderError(err)?.message ?? t('providerAdmin.common.errors.requestFailed'))
    }
  }

  return (
    <div
      data-testid={`quota-${instanceId}`}
      className="mt-3 space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2 text-xs"
    >
      <p className="flex items-center gap-2 font-medium text-amber-200">
        <Clock className="h-4 w-4" aria-hidden />
        {t('providerAdmin.quota.title')}
      </p>
      {exhausted ? (
        <p className="text-amber-100">
          {exhausted.reset_known
            ? t('providerAdmin.quota.exhausted', { time: reset ?? '' })
            : t('providerAdmin.quota.exhaustedOpen')}
          {exhausted.window ? t('providerAdmin.quota.exhaustedWindow', { window: exhausted.window }) : ''}
        </p>
      ) : (
        <p className="text-amber-100/80">{t('providerAdmin.quota.notExhausted')}</p>
      )}
      <p className="text-gray-500">{t('providerAdmin.quota.observed', { when })}</p>

      {confirming ? (
        <ConfirmPanel
          title={t('providerAdmin.quota.clearTitle', { name })}
          confirmLabel={t('providerAdmin.quota.clearConfirm')}
          cancelLabel={t('providerAdmin.instances.keep')}
          tone="info"
          onConfirm={clear}
          onCancel={() => setConfirming(false)}
        >
          {exhausted?.reset_known && reset
            ? t('providerAdmin.quota.clearBody', { name, time: reset, when })
            : t('providerAdmin.quota.clearBodyOpen', { name, when })}
        </ConfirmPanel>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setConfirming(true)}
          aria-label={t('providerAdmin.quota.clearAria', { name })}
        >
          {t('providerAdmin.quota.clear')}
        </Button>
      )}

      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
