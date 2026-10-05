import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import { ProviderStateCard } from '@/components/chat/ProviderStateCard'
import { useProviders, useRefreshProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { healthDotColor, healthLabel } from '@/constants/providers'
import { COST_BASIS_LABELS, credentialLabel, formatWhen, settingsErrorMessage } from '@/constants/providerSettings'
import { isClaudeCodeProvider, providerKindLabel, type ProviderErrorInfo, type ProviderHealth, type ProviderInstance } from '@/types/provider'
import { ConfirmPanel } from './ConfirmPanel'
import { ProviderInstanceForm } from './ProviderInstanceForm'

/** The error card of a not-healthy instance. `auth_required` always gets one: it carries the login command. */
function healthError(instance: ProviderInstance, health: ProviderHealth): ProviderErrorInfo | null {
  if (health.error) return { ...health.error, provider_id: health.error.provider_id ?? instance.id }
  if (health.status === 'auth_required') {
    return { code: 'auth_required', message: '', provider_id: instance.id, login_hint: health.login_hint ?? undefined }
  }
  return null
}

function InstanceRow({
  instance,
  highlighted,
  onEdit,
  onDelete,
}: {
  instance: ProviderInstance
  highlighted: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const refresh = useRefreshProviders()
  const [fresh, setFresh] = useState<ProviderHealth | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const health = fresh ?? instance.health
  const builtin = instance.builtin || isClaudeCodeProvider(instance.id, instance.kind)
  const error = healthError(instance, health)

  const recheck = async () => {
    setChecking(true)
    setCheckError(null)
    try {
      setFresh(await providersApi.status(instance.id))
      await refresh()
    } catch (err) {
      setCheckError(settingsErrorMessage(err))
    } finally {
      setChecking(false)
    }
  }

  return (
    <li
      id={`instance-${instance.id}`}
      data-testid={`instance-${instance.id}`}
      aria-current={highlighted ? 'true' : undefined}
      className={`rounded-lg border px-3 py-2 ${highlighted ? 'border-indigo-500/60' : 'border-gray-800'}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 truncate text-sm font-medium text-gray-100">{instance.label}</span>
        <span className="text-xs text-gray-500">{providerKindLabel(instance.kind)}</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-300">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${healthDotColor(health.status)}`} />
          {healthLabel(health.status)}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {health.status !== 'auth_required' && (
            <Button size="sm" variant="ghost" onClick={recheck} loading={checking}>
              Re-check
            </Button>
          )}
          {!builtin && (
            <>
              <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${instance.label}`}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={onDelete} aria-label={`Delete ${instance.label}`} className="text-red-300">
                Delete
              </Button>
            </>
          )}
        </span>
      </div>
      <dl className="mt-1 grid gap-x-4 gap-y-0.5 text-xs text-gray-400 sm:grid-cols-2">
        <div>
          <dt className="inline text-gray-500">Endpoint: </dt>
          <dd className="inline break-all">{instance.origin ?? (builtin ? 'local CLI' : 'unknown')}</dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Default model: </dt>
          <dd className="inline">{instance.default_model ?? 'none set'}</dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Cost: </dt>
          <dd className="inline">{COST_BASIS_LABELS[instance.cost_source ?? 'unknown']}</dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Credential: </dt>
          <dd className="inline font-mono">{builtin ? 'managed by the CLI' : credentialLabel(instance.credential_ref)}</dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Version: </dt>
          <dd className="inline">{health.version ?? 'unknown'}</dd>
        </div>
        <div>
          <dt className="inline text-gray-500">Last checked: </dt>
          <dd className="inline">{formatWhen(health.checked_at)}</dd>
        </div>
      </dl>
      {error && <ProviderStateCard error={error} className="mt-2" testId={`instance-error-${instance.id}`} />}
      {checkError && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {checkError}
        </p>
      )}
    </li>
  )
}

/** Instances of this server: health, credential reference, add / edit / delete. */
export function ProviderInstances() {
  const { providers, refresh } = useProviders()
  const [params] = useSearchParams()
  const focus = params.get('instance')
  const [form, setForm] = useState<{ mode: 'add' } | { mode: 'edit'; instance: ProviderInstance } | null>(null)
  const [deleting, setDeleting] = useState<ProviderInstance | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (focus) document.getElementById(`instance-${focus}`)?.scrollIntoView?.({ block: 'center' })
  }, [focus, providers.length])

  const saved = useCallback(async () => {
    setForm(null)
    await refresh()
  }, [refresh])

  const remove = async (instance: ProviderInstance) => {
    setError(null)
    try {
      await providersApi.remove(instance.id)
      setDeleting(null)
      await refresh()
    } catch (err) {
      setError(settingsErrorMessage(err))
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2" aria-label="Provider instances">
        {providers.map((p) => (
          <InstanceRow
            key={p.id}
            instance={p}
            highlighted={focus === p.id}
            onEdit={() => setForm({ mode: 'edit', instance: p })}
            onDelete={() => setDeleting(p)}
          />
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {deleting && (
        <ConfirmPanel
          title={`Delete ${deleting.label}?`}
          confirmLabel={`Delete ${deleting.label}`}
          tone="danger"
          onConfirm={() => remove(deleting)}
          onCancel={() => setDeleting(null)}
        >
          Existing conversations on {deleting.label} will no longer be resumable.
        </ConfirmPanel>
      )}
      {form ? (
        <ProviderInstanceForm
          key={form.mode === 'edit' ? form.instance.id : 'add'}
          instance={form.mode === 'edit' ? form.instance : undefined}
          existingIds={providers.map((p) => p.id)}
          onSaved={saved}
          onCancel={() => setForm(null)}
        />
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setForm({ mode: 'add' })}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          Add an instance
        </Button>
      )}
    </div>
  )
}
