import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { originOf } from '@/constants/providerSettings'
import { kindLabel, wizardErrorMessage } from '@/constants/providerWizard'
import { useT } from '@/i18n'
import { isClaudeCodeProvider, providerDisplayName, type ProviderInstance } from '@/types/provider'
import type { LlmConsent } from '@/types/providerSettings'
import { ConfirmPanel } from './ConfirmPanel'
import { ErrorLine, Panel } from './SettingsPanel'
import { useProjectOptions } from './useProjectOptions'

function instanceOrigin(instance: ProviderInstance): string | null {
  return instance.origin ?? (instance.base_url ? originOf(instance.base_url) : null)
}

/**
 * Authorise one provider across several projects in a single gesture, instead of
 * one project at a time: pick the projects, then "Allow"/"Withdraw" applies to all
 * of them. Lives above the single-project consent panel (detailed review stays there).
 */
export function BulkConsent({ onAddProvider }: { onAddProvider?: () => void }) {
  const { t } = useT()
  const { providers } = useProviders()
  const projects = useProjectOptions()
  const [params, setParams] = useSearchParams()
  // The projects of the bulk gesture, as a comma-separated `bulk` query param (independent of the single `project` one).
  const rawSelected = params.get('bulk') ?? ''
  const selected = useMemo(() => rawSelected.split(',').map((s) => s.trim()).filter(Boolean), [rawSelected])
  const [consentsByProject, setConsentsByProject] = useState<Record<string, LlmConsent[]>>({})
  const [error, setError] = useState<string | null>(null)
  const [allowing, setAllowing] = useState<ProviderInstance | null>(null)
  const [revoking, setRevoking] = useState<ProviderInstance | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (selected.length === 0) return
    let live = true
    Promise.all(
      selected.map(async (slug) => {
        try {
          return [slug, await providersApi.consents(slug)] as const
        } catch {
          return [slug, [] as LlmConsent[]] as const
        }
      }),
    ).then((rows) => {
      if (!live) return
      setConsentsByProject(Object.fromEntries(rows))
      setError(null)
    })
    return () => {
      live = false
    }
  }, [selected, reloadTick])

  const external = providers.filter((p) => !(p.builtin || isClaudeCodeProvider(p.id, p.kind)))

  const setSelected = (next: string[]) => {
    const q = new URLSearchParams(params)
    if (next.length) q.set('bulk', next.join(','))
    else q.delete('bulk')
    setParams(q, { replace: true })
    setConsentsByProject({})
    setAllowing(null)
    setRevoking(null)
  }
  const toggleProject = (slug: string) =>
    setSelected(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug])

  /** How many of the selected projects already have a valid consent for this provider. */
  const allowedCount = (providerId: string): number =>
    selected.filter((slug) => {
      const c = (consentsByProject[slug] ?? []).find((x) => x.provider_id === providerId)
      return !!c && c.valid
    }).length

  const act = async (fn: (slug: string) => Promise<unknown>, close: 'allow' | 'revoke') => {
    setBusy(true)
    setError(null)
    const results = await Promise.allSettled(selected.map((slug) => fn(slug)))
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    if (rejected.length > 0) setError(wizardErrorMessage(rejected[0].reason, t))
    setBusy(false)
    if (close === 'allow') setAllowing(null)
    else setRevoking(null)
    setReloadTick((n) => n + 1)
  }

  if (external.length === 0) {
    return (
      <Panel testId="bulk-consent-panel" title={t('providerAdmin.consent.bulkTitle')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-400">{t('providerAdmin.consent.noProviders')}</p>
          {onAddProvider && (
            <Button size="sm" variant="secondary" onClick={onAddProvider}>
              {t('providerAdmin.consent.addProvider')}
            </Button>
          )}
        </div>
      </Panel>
    )
  }

  return (
    <Panel testId="bulk-consent-panel" title={t('providerAdmin.consent.bulkTitle')} description={t('providerAdmin.consent.bulkDescription')}>
      <div className="space-y-4">
        <div>
          <button
            type="button"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-surface-base px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/[0.04]"
            data-testid="bulk-project-toggle"
          >
            <span className="min-w-0 truncate">
              {selected.length === 0
                ? t('providerAdmin.consent.chooseProject')
                : t('providerAdmin.consent.selectedCount', { count: selected.length })}
            </span>
            <span aria-hidden="true">▾</span>
          </button>
          {pickerOpen && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/[0.08] bg-surface-base p-2">
              <div className="mb-1 flex items-center justify-between gap-2 border-b border-white/[0.06] px-1 pb-1">
                <button type="button" className="text-xs text-indigo-300 hover:text-indigo-200" onClick={() => setSelected((projects ?? []).map((p) => p.slug))}>
                  {t('routing.menu.selectAll')}
                </button>
                <button type="button" className="text-xs text-gray-400 hover:text-gray-200" onClick={() => setSelected([])}>
                  {t('routing.menu.clearAll')}
                </button>
              </div>
              {(projects ?? []).length === 0 && <p className="px-1 py-2 text-xs text-gray-500">{t('providerAdmin.consent.chooseProject')}</p>}
              {(projects ?? []).map((p) => {
                const on = selected.includes(p.slug)
                return (
                  <label key={p.slug} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 hover:bg-white/[0.04]">
                    <input type="checkbox" checked={on} onChange={() => toggleProject(p.slug)} className="size-4 shrink-0 accent-indigo-500" />
                    <span className="min-w-0 truncate text-xs text-gray-200">{p.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {selected.length > 0 && (
          <ul className="-mx-4 -my-4 divide-y divide-white/[0.05]" aria-label={t('providerAdmin.consent.listAria')}>
            {external.map((p) => {
              const origin = instanceOrigin(p)
              const allowed = allowedCount(p.id)
              return (
                <li key={p.id} data-testid={`bulk-consent-${p.id}`} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-[1_1_16rem]">
                      <p className="text-sm font-medium text-gray-100">
                        {providerDisplayName(p)}{' '}
                        <span className="font-normal text-gray-500">· {kindLabel(t, p.kind)}</span>
                      </p>
                      <p className="break-all font-mono text-xs text-gray-400">{origin ?? t('providerAdmin.consent.unknownOrigin')}</p>
                    </div>
                    <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                      <span className="min-w-0 text-xs text-gray-400">{t('providerAdmin.consent.allowedOn', { allowed, total: selected.length })}</span>
                      <div className="flex justify-end gap-2">
                        {allowed < selected.length && (
                          <Button size="sm" variant="secondary" disabled={!origin || busy} onClick={() => origin && setAllowing(p)} aria-disabled={!origin || undefined}>
                            {t('providerAdmin.consent.allow')}
                          </Button>
                        )}
                        {allowed > 0 && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRevoking(p)}>
                            {t('providerAdmin.consent.revoke')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  {!origin && <p className="mt-1 text-xs text-gray-500">{t('providerAdmin.consent.noOrigin')}</p>}
                  {allowing?.id === p.id && origin && (
                    <ConfirmPanel
                      title={t('providerAdmin.consent.allowManyTitle', { count: selected.length, origin })}
                      confirmLabel={t('providerAdmin.consent.allowConfirm', { origin })}
                      onConfirm={() => act((slug) => providersApi.allow(slug, p.id, origin), 'allow')}
                      onCancel={() => setAllowing(null)}
                    >
                      {t('providerAdmin.consent.allowBody', { provider: providerDisplayName(p) })}
                    </ConfirmPanel>
                  )}
                  {revoking?.id === p.id && (
                    <ConfirmPanel
                      title={t('providerAdmin.consent.revokeManyTitle', { count: selected.length, provider: providerDisplayName(p) })}
                      confirmLabel={t('providerAdmin.consent.revokeConfirm')}
                      tone="danger"
                      onConfirm={() => act((slug) => providersApi.revoke(slug, p.id), 'revoke')}
                      onCancel={() => setRevoking(null)}
                    >
                      {t('providerAdmin.consent.revokeBody', { provider: providerDisplayName(p) })}
                    </ConfirmPanel>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
    </Panel>
  )
}
