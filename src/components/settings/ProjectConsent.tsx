import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button } from '@/components/ui'
import { useProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { originOf } from '@/constants/providerSettings'
import {
  CONSENT_STATE_FR,
  formatWhenFr,
  kindLabelFr,
  wizardErrorMessage,
} from '@/constants/providerWizard'
import { isClaudeCodeProvider, type ProviderInstance } from '@/types/provider'
import type { LlmConsent } from '@/types/providerSettings'
import { ConfirmPanel } from './ConfirmPanel'
import { ErrorLine, Loading, Panel, ProjectPicker } from './SettingsPanel'
import { useProjectOptions } from './useProjectOptions'

function instanceOrigin(instance: ProviderInstance): string | null {
  return instance.origin ?? (instance.base_url ? originOf(instance.base_url) : null)
}

type ConsentState = keyof typeof CONSENT_STATE_FR

const BADGE: Readonly<Record<ConsentState, 'success' | 'default' | 'warning'>> = {
  allowed: 'success',
  denied: 'default',
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
        setError(wizardErrorMessage(err))
      })
    return () => {
      live = false
    }
  }, [slug, reloadTick])

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      setError(null)
    } catch (err) {
      setError(wizardErrorMessage(err))
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
          Aucun provider enregistré : ajoutez-en un pour pouvoir l’autoriser.
        </p>
        {onAddProvider && (
          <Button size="sm" variant="secondary" onClick={onAddProvider}>
            Ajouter un provider
          </Button>
        )}
      </div>
    )
  } else if (!slug) {
    body = (
      <p className="text-sm text-gray-400">
        Choisissez un projet pour voir vers quelles origines il peut envoyer son contenu.
      </p>
    )
  } else if (!consents && !error) {
    body = <Loading>Chargement des autorisations…</Loading>
  } else if (consents) {
    body = (
      <ul
        className="-mx-4 -my-4 divide-y divide-white/[0.05]"
        aria-label="Autorisation par provider"
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
                    {p.label}{' '}
                    <span className="font-normal text-gray-500">· {kindLabelFr(p.kind)}</span>
                  </p>
                  <p className="break-all font-mono text-xs text-gray-400">
                    {origin ?? 'origine inconnue'}
                  </p>
                </div>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                  <div className="flex sm:w-40 sm:justify-end">
                    <Badge variant={BADGE[state]}>{CONSENT_STATE_FR[state]}</Badge>
                  </div>
                  <div className="flex justify-end sm:w-44">
                    {state === 'allowed' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRevoking(p)}
                        aria-label={`Retirer l’autorisation de ${p.label}`}
                      >
                        Retirer
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => origin && setAllowing(p)}
                        aria-disabled={!origin || undefined}
                        aria-describedby={!origin ? `consent-${p.id}-noorigin` : undefined}
                        aria-label={`Autoriser ${p.label}`}
                      >
                        {state === 'invalidated' ? 'Autoriser à nouveau' : 'Autoriser'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              {!origin && (
                <p id={`consent-${p.id}-noorigin`} className="mt-1 text-xs text-gray-500">
                  L’origine de ce provider est inconnue : il n’y a encore rien à autoriser.
                </p>
              )}
              {consent && state === 'allowed' && (
                <p className="mt-1 text-xs text-gray-500">
                  Autorisé pour {consent.origin} par {consent.consented_by},{' '}
                  {formatWhenFr(consent.consented_at)}.
                </p>
              )}
              {consent && state === 'invalidated' && (
                <p className="mt-1 text-xs text-amber-300">
                  L’origine ou la référence de clé a changé : l’autorisation donnée pour{' '}
                  {consent.origin} ({consent.consented_by}, {formatWhenFr(consent.consented_at)}) ne
                  vaut plus{origin ? ` pour ${origin}` : ''}. Rien n’est envoyé tant qu’elle n’est
                  pas redonnée.
                </p>
              )}
              {allowing?.id === p.id && origin && (
                <ConfirmPanel
                  title={`Le contenu du projet ${projectName} partira vers ${origin}`}
                  confirmLabel={`Autoriser ${origin}`}
                  onConfirm={() => act(() => providersApi.allow(slug, p.id, origin))}
                  onCancel={() => setAllowing(null)}
                >
                  Les prompts, fichiers et résultats d’outils des conversations de ce projet sur{' '}
                  {p.label} quittent cette machine pour cette origine.
                </ConfirmPanel>
              )}
              {revoking?.id === p.id && (
                <ConfirmPanel
                  title={`Ne plus envoyer le contenu du projet ${projectName} à ${p.label} ?`}
                  confirmLabel="Retirer l’autorisation"
                  tone="danger"
                  onConfirm={() => act(() => providersApi.revoke(slug, p.id))}
                  onCancel={() => setRevoking(null)}
                >
                  Les conversations de ce projet ne pourront plus utiliser {p.label}.
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
      title={slug ? `Origines autorisées pour ${projectName}` : 'Origines autorisées'}
      description="Une conversation sans projet ne peut utiliser que Claude Code : aucun contenu de projet ne part ailleurs."
    >
      {body}
      {error && <ErrorLine>{error}</ErrorLine>}
    </Panel>
  )
}
