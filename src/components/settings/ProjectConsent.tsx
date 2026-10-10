import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, ToneText, type StatusTone } from '@/components/ui'
import { useProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { originOf } from '@/constants/providerSettings'
import {
  CONSENT_STATE_KEYS,
  formatWhenFr,
  kindLabel,
  wizardErrorMessage,
} from '@/constants/providerWizard'
import { useT } from '@/i18n'
import { isClaudeCodeProvider, providerDisplayName, type ProviderInstance } from '@/types/provider'
import type { LlmConsent } from '@/types/providerSettings'
import { ConfirmPanel } from './ConfirmPanel'
import { ErrorLine, Loading, Panel, ProjectPicker } from './SettingsPanel'
import { useProjectOptions } from './useProjectOptions'

function instanceOrigin(instance: ProviderInstance): string | null {
  return instance.origin ?? (instance.base_url ? originOf(instance.base_url) : null)
}

type ConsentState = keyof typeof CONSENT_STATE_KEYS

/** Consent is a state: dot + word in its tone (DESIGN.md § 4), never a filled pill. */
const TONE: Readonly<Record<ConsentState, StatusTone>> = {
  allowed: 'success',
  denied: 'muted',
  invalidated: 'warning',
}

/**
 * Which projects agreed to send their content to which endpoint.
 *
 * Consent is bound to an ORIGIN (and to the credential reference): when either
 * changes, the old consent stops holding and is shown as out of date. A local
 * endpoint asks for it too: "local" says nothing about who is listening.
 */
export function ProjectConsent({ onAddProvider }: { onAddProvider?: () => void }) {
  const tr = useT()
  const { t } = tr
  const { providers } = useProviders()
  const projects = useProjectOptions()
  const [params, setParams] = useSearchParams()
  const slug = params.get('project') ?? ''
  const project = projects?.find((p) => p.slug === slug)
  const [consents, setConsents] = useState<LlmConsent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [allowing, setAllowing] = useState<ProviderInstance | null>(null)
  const [revoking, setRevoking] = useState<ProviderInstance | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!slug) return
    let live = true
    providersApi
      .consents(slug)
      .then((list) => {
        if (!live) return
        setConsents(list)
        setError(null)
      })
      .catch((err) => {
        if (!live) return
        setConsents(null)
        setError(wizardErrorMessage(err, t))
      })
    return () => {
      live = false
    }
  }, [slug, reloadTick, t])

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      setError(null)
    } catch (err) {
      setError(wizardErrorMessage(err, t))
    }
    setAllowing(null)
    setRevoking(null)
    setReloadTick((n) => n + 1)
  }

  const external = providers.filter((p) => !(p.builtin || isClaudeCodeProvider(p.id, p.kind)))
  const projectName = project?.name ?? slug

  const choose = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('project', value)
    else next.delete('project')
    setConsents(null)
    setAllowing(null)
    setRevoking(null)
    setParams(next, { replace: true })
  }

  let body
  if (external.length === 0) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400">
          {t('providerAdmin.consent.noProviders')}
        </p>
        {onAddProvider && (
          <Button size="sm" variant="secondary" onClick={onAddProvider}>
            {t('providerAdmin.consent.addProvider')}
          </Button>
        )}
      </div>
    )
  } else if (!slug) {
    body = (
      <p className="text-sm text-gray-400">
        {t('providerAdmin.consent.chooseProject')}
      </p>
    )
  } else if (!consents && !error) {
    body = <Loading>{t('providerAdmin.consent.loading')}</Loading>
  } else if (consents) {
    body = (
      <ul
        className="-mx-4 -my-4 divide-y divide-white/[0.05]"
        aria-label={t('providerAdmin.consent.listAria')}
      >
        {external.map((p) => {
          const consent = consents.find((c) => c.provider_id === p.id)
          const origin = instanceOrigin(p)
          const state: ConsentState = !consent
            ? 'denied'
            : consent.valid
              ? 'allowed'
              : 'invalidated'
          return (
            <li key={p.id} data-testid={`consent-${p.id}`} data-state={state} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-0 flex-[1_1_16rem]">
                  <p className="text-sm font-medium text-gray-100">
                    {providerDisplayName(p)}{' '}
                    <span className="font-normal text-gray-500">· {kindLabel(t, p.kind)}</span>
                  </p>
                  <p className="break-all font-mono text-xs text-gray-400">
                    {origin ?? t('providerAdmin.consent.unknownOrigin')}
                  </p>
                </div>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                  <div className="flex sm:w-40 sm:justify-end">
                    <ToneText tone={TONE[state]} icon label={t(CONSENT_STATE_KEYS[state])} className="text-xs" />
                  </div>
                  <div className="flex justify-end sm:w-44">
                    {state === 'allowed' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRevoking(p)}
                        aria-label={t('providerAdmin.consent.revokeAria', { name: providerDisplayName(p) })}
                      >
                        {t('providerAdmin.consent.revoke')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => origin && setAllowing(p)}
                        aria-disabled={!origin || undefined}
                        aria-describedby={!origin ? `consent-${p.id}-noorigin` : undefined}
                        aria-label={t('providerAdmin.consent.allowAria', { name: providerDisplayName(p) })}
                      >
                        {state === 'invalidated' ? t('providerAdmin.consent.allowAgain') : t('providerAdmin.consent.allow')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {!origin && (
                <p id={`consent-${p.id}-noorigin`} className="mt-1 text-xs text-gray-500">
                  {t('providerAdmin.consent.noOrigin')}
                </p>
              )}
              {consent && state === 'allowed' && (
                <p className="mt-1 text-xs text-gray-500">
                  {t('providerAdmin.consent.allowedFor', { origin: consent.origin, by: consent.consented_by, when: formatWhenFr(tr, consent.consented_at) })}
                </p>
              )}
              {consent && state === 'invalidated' && (
                <p className="mt-1 text-xs text-amber-300">
                  {t(origin ? 'providerAdmin.consent.invalidatedFor' : 'providerAdmin.consent.invalidated', {
                    origin: consent.origin,
                    by: consent.consented_by,
                    when: formatWhenFr(tr, consent.consented_at),
                    now: origin ?? '',
                  })}
                </p>
              )}
              {allowing?.id === p.id && origin && (
                <ConfirmPanel
                  title={t('providerAdmin.consent.allowTitle', { project: projectName, origin })}
                  confirmLabel={t('providerAdmin.consent.allowConfirm', { origin })}
                  onConfirm={() => act(() => providersApi.allow(slug, p.id, origin))}
                  onCancel={() => setAllowing(null)}
                >
                  {t('providerAdmin.consent.allowBody', { provider: providerDisplayName(p) })}
                </ConfirmPanel>
              )}
              {revoking?.id === p.id && (
                <ConfirmPanel
                  title={t('providerAdmin.consent.revokeTitle', { project: projectName, provider: providerDisplayName(p) })}
                  confirmLabel={t('providerAdmin.consent.revokeConfirm')}
                  tone="danger"
                  onConfirm={() => act(() => providersApi.revoke(slug, p.id))}
                  onCancel={() => setRevoking(null)}
                >
                  {t('providerAdmin.consent.revokeBody', { provider: providerDisplayName(p) })}
                </ConfirmPanel>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <Panel
      testId="consent-panel"
      aside={
        <ProjectPicker id="consent-project" projects={projects} value={slug} onChange={choose} />
      }
      title={slug ? t('providerAdmin.consent.titleFor', { project: projectName }) : t('providerAdmin.consent.title')}
      description={t('providerAdmin.consent.description')}
    >
      {body}
      {error && <ErrorLine>{error}</ErrorLine>}
    </Panel>
  )
}
