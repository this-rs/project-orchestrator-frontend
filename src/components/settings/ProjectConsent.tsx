import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { NO_PROJECT_TEXT, formatWhen, originOf, settingsErrorMessage } from '@/constants/providerSettings'
import { isClaudeCodeProvider, type ProviderInstance } from '@/types/provider'
import type { LlmConsent } from '@/types/providerSettings'
import { ConfirmPanel, FIELD, LABEL } from './ConfirmPanel'
import { useProjectOptions } from './useProjectOptions'

function instanceOrigin(instance: ProviderInstance): string | null {
  return instance.origin ?? (instance.base_url ? originOf(instance.base_url) : null)
}

/**
 * Which projects agreed to send their content to which endpoint.
 *
 * Consent is bound to an ORIGIN: when an instance's origin changes, the old
 * consent stops holding and is shown as invalidated. A local endpoint asks for
 * it too: "local" says nothing about who is listening.
 */
export function ProjectConsent() {
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
        setError(settingsErrorMessage(err))
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
      setError(settingsErrorMessage(err))
    }
    setAllowing(null)
    setRevoking(null)
    setReloadTick((n) => n + 1)
  }

  const external = providers.filter((p) => !(p.builtin || isClaudeCodeProvider(p.id, p.kind)))

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">{NO_PROJECT_TEXT}</p>
      <div className="max-w-sm">
        <label htmlFor="consent-project" className={LABEL}>
          Project
        </label>
        <select
          id="consent-project"
          className={FIELD}
          value={slug}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            if (e.target.value) next.set('project', e.target.value)
            else next.delete('project')
            setConsents(null)
            setAllowing(null)
            setRevoking(null)
            setParams(next, { replace: true })
          }}
        >
          <option value="">Choose a project…</option>
          {(projects ?? []).map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {!slug && <p className="text-sm text-gray-500">Choose a project to see where it may send its content.</p>}
      {slug && external.length === 0 && (
        <p className="text-sm text-gray-500">No provider instance other than Claude Code is configured, so there is nothing to allow.</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      {slug && consents && (
        <ul className="space-y-2" aria-label="Consent per instance">
          {external.map((p) => {
            const consent = consents.find((c) => c.provider_id === p.id)
            const origin = instanceOrigin(p)
            const state = !consent ? 'denied' : consent.valid ? 'allowed' : 'invalidated'
            return (
              <li key={p.id} data-testid={`consent-${p.id}`} data-state={state} className="rounded-lg border border-gray-800 px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-medium text-gray-100">{p.label}</span>
                  <span className="break-all text-xs text-gray-500">{origin ?? 'unknown endpoint'}</span>
                  <span className="text-xs font-medium text-gray-300">
                    {state === 'allowed' ? 'Allowed' : state === 'denied' ? 'Not allowed' : 'Invalidated'}
                  </span>
                  <span className="ml-auto flex gap-2">
                    {state !== 'allowed' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => origin && setAllowing(p)}
                        aria-disabled={!origin}
                        aria-describedby={!origin ? `consent-${p.id}-noorigin` : undefined}
                      >
                        Allow…
                      </Button>
                    )}
                    {consent && (
                      <Button size="sm" variant="ghost" className="text-red-300" onClick={() => setRevoking(p)}>
                        Revoke
                      </Button>
                    )}
                  </span>
                </div>
                {!origin && (
                  <p id={`consent-${p.id}-noorigin`} className="mt-1 text-xs text-gray-500">
                    The endpoint of this instance is unknown, so there is nothing to consent to yet.
                  </p>
                )}
                {consent && (
                  <p className="mt-1 text-xs text-gray-400">
                    {state === 'invalidated'
                      ? `Consent was given for ${consent.origin}, but this instance now points to ${origin ?? 'another endpoint'}. Allow it again to send content there. `
                      : `Allowed for ${consent.origin}. `}
                    By {consent.consented_by}, {formatWhen(consent.consented_at)}.
                  </p>
                )}
                {allowing?.id === p.id && origin && (
                  <ConfirmPanel
                    title={`Content of project ${project?.name ?? slug} will be sent to ${origin}`}
                    confirmLabel={`Allow ${origin}`}
                    onConfirm={() => act(() => providersApi.allow(slug, p.id, origin))}
                    onCancel={() => setAllowing(null)}
                  >
                    Prompts, files and tool results of this project's conversations on {p.label} leave this machine for that endpoint.
                  </ConfirmPanel>
                )}
                {revoking?.id === p.id && (
                  <ConfirmPanel
                    title={`Stop sending content of project ${project?.name ?? slug} to ${p.label}?`}
                    confirmLabel="Revoke"
                    tone="danger"
                    onConfirm={() => act(() => providersApi.revoke(slug, p.id))}
                    onCancel={() => setRevoking(null)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
