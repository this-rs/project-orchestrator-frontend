import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Button, Facts, ToneText, surface, type StatusTone } from '@/components/ui'
import { useProviders, useRefreshProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import {
  COST_LABEL_KEYS,
  credentialLabelFr,
  formatWhenFr,
  instanceStatus,
  kindLabel,
  wizardErrorMessage,
} from '@/constants/providerWizard'
import { useT } from '@/i18n'
import { credentialLabel } from '@/constants/providerSettings'
import {
  isClaudeCodeProvider,
  providerDisplayName,
  type ProviderErrorInfo,
  type ProviderHealth,
  type ProviderInstance,
} from '@/types/provider'
import { ConfirmPanel } from './ConfirmPanel'
import { SettingsErrorCard } from './SettingsErrorCard'
import { ProviderInstanceForm } from './ProviderInstanceForm'

/** The error card of a not-healthy instance. `auth_required` always gets one: it carries the login command. */
function healthError(instance: ProviderInstance, health: ProviderHealth): ProviderErrorInfo | null {
  if (health.error) return { ...health.error, provider_id: health.error.provider_id ?? instance.id }
  if (health.status === 'auth_required') {
    return {
      code: 'auth_required',
      message: '',
      provider_id: instance.id,
      login_hint: health.login_hint ?? undefined,
    }
  }
  return null
}

/**
 * One provider as a card: its state at a glance (badge), what it points at,
 * and the useful actions in one click — Test, Edit, Delete (with a
 * confirmation). Actions sit on the right of a single footer.
 */
function InstanceCard({
  instance,
  highlighted,
  editing,
  onEdit,
  onCloseEdit,
  onDelete,
}: {
  instance: ProviderInstance
  highlighted: boolean
  editing: boolean
  onEdit: () => void
  onCloseEdit: () => void
  onDelete: () => Promise<void>
}) {
  const tr = useT()
  const { t } = tr
  const refresh = useRefreshProviders()
  const [fresh, setFresh] = useState<ProviderHealth | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const health = fresh ?? instance.health
  const builtin = instance.builtin || isClaudeCodeProvider(instance.id, instance.kind)
  const error = healthError(instance, health)
  const status = instanceStatus(instance, health)

  const recheck = async () => {
    setChecking(true)
    setCheckError(null)
    try {
      setFresh(await providersApi.status(instance.id))
      await refresh()
    } catch (err) {
      setCheckError(wizardErrorMessage(err, t))
    } finally {
      setChecking(false)
    }
  }

  return (
    <li
      id={`instance-${instance.id}`}
      data-testid={`instance-${instance.id}`}
      data-status={status.key}
      aria-current={highlighted ? 'true' : undefined}
      className={`${surface} p-4 ${highlighted ? 'ring-1 ring-indigo-500/60' : ''}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-100">{providerDisplayName(instance)}</h3>
          <p className="text-xs text-gray-500">
            {kindLabel(t, instance.kind)}
            {instance.id.toLowerCase() !== instance.label.toLowerCase() &&
              instance.id.replace(/-/g, ' ') !== instance.label.toLowerCase() && (
                <>
                  {' '}
                  · <span className="font-mono">{instance.id}</span>
                </>
              )}
            {health.checked_at && (
              <span className="text-gray-600"> · {t('providerAdmin.instances.checked', { when: formatWhenFr(tr, health.checked_at) })}</span>
            )}
          </p>
        </div>
        <ToneText tone={STATUS_TONE[status.variant]} icon label={t(status.label)} className="text-xs" />
      </div>

      {!editing && (
        <Facts
          className="mt-3"
          columns={2}
          items={[
            {
              label: t('providerAdmin.instances.endpoint'),
              value: (
                <span className="break-all">
                  {instance.origin ?? (builtin ? t('providerAdmin.instances.localProgram') : t('providerAdmin.instances.unknown'))}
                </span>
              ),
            },
            // Only the lines that say something: the list carries no default model, an unknown cost or version says nothing.
            { label: t('providerAdmin.instances.model'), value: instance.default_model, hidden: !instance.default_model },
            {
              label: t('providerAdmin.instances.cost'),
              value: t(COST_LABEL_KEYS[instance.cost_source ?? 'unknown']),
              hidden: !instance.cost_source || instance.cost_source === 'unknown',
            },
            {
              label: t('providerAdmin.instances.key'),
              value: builtin ? (
                t('providerAdmin.instances.keyManaged')
              ) : (
                <span title={credentialLabel(instance.credential_ref)}>
                  {credentialLabelFr(t, instance.credential_ref)}
                </span>
              ),
            },
            { label: t('providerAdmin.instances.version'), value: health.version, hidden: !health.version },
            {
              label: t('providerAdmin.instances.fingerprint'),
              value: <code className="break-all font-mono">{instance.host_key_fingerprint}</code>,
              hidden: !instance.host_key_fingerprint,
            },
            {
              label: t('providerAdmin.instances.trustLabel'),
              value: instance.allow_trust ? t('providerAdmin.instances.trustAllowed') : t('providerAdmin.instances.trustDenied'),
              hidden: instance.kind !== 'claude_code_remote',
            },
          ]}
        />
      )}

      {status.key === 'unreachable' && health.error?.message && (
        <p
          role="alert"
          data-testid={`instance-reason-${instance.id}`}
          className="mt-3 break-words rounded-lg border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-xs text-red-200"
        >
          {t('providerAdmin.instances.unreachable', { message: health.error.message })}
        </p>
      )}
      {error && (
        <SettingsErrorCard
          error={error}
          className="mt-3"
          testId={`instance-error-${instance.id}`}
        />
      )}
      {checkError && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {checkError}
        </p>
      )}

      {confirmDelete && (
        <ConfirmPanel
          title={t('providerAdmin.instances.deleteTitle', { name: instance.label })}
          confirmLabel={t('providerAdmin.instances.deleteConfirm', { name: instance.label })}
          cancelLabel={t('providerAdmin.instances.keep')}
          tone="danger"
          onConfirm={async () => {
            await onDelete()
            setConfirmDelete(false)
          }}
          onCancel={() => setConfirmDelete(false)}
        >
          {t('providerAdmin.instances.deleteBody', { name: instance.label })}
        </ConfirmPanel>
      )}

      {editing ? (
        <div className="mt-4">
          <ProviderInstanceForm
            instance={instance}
            onSaved={async () => {
              onCloseEdit()
              await refresh()
            }}
            onCancel={onCloseEdit}
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] pt-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={recheck}
            loading={checking}
            aria-label={t('providerAdmin.instances.testAria', { name: instance.label })}
          >
            {t('providerAdmin.ui.test')}
          </Button>
          {!builtin && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={onEdit}
                aria-label={t('providerAdmin.instances.editAria', { name: instance.label })}
              >
                {t('providerAdmin.ui.edit')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDelete(true)}
                aria-label={t('providerAdmin.instances.deleteAria', { name: instance.label })}
              >
                {t('providerAdmin.ui.delete')}
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

/** Instances of this server as cards: state, credential reference, test / edit / delete. */
/**
 * The last entry of the list: connecting another provider is offered where the providers
 * are, not only by a button above them. It opens the same wizard.
 */
function AddProviderCard({ onAdd }: { onAdd: () => void }) {
  const { t } = useT()
  return (
    <li
      className={`${surface} flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-dashed p-4`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-100">{t('providerAdmin.instances.another')}</p>
        <p className="text-xs text-gray-500">
          {t('providerAdmin.instances.anotherHint')}
        </p>
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={onAdd}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {t('providerAdmin.instances.connect')}
      </Button>
    </li>
  )
}

/** The health of an instance is a state: dot + word (DESIGN.md § 4). */
const STATUS_TONE: Readonly<Record<'success' | 'warning' | 'error' | 'default', StatusTone>> = {
  success: 'success',
  warning: 'warning',
  error: 'danger',
  default: 'neutral',
}

export function ProviderInstances({ onAdd }: { onAdd?: () => void } = {}) {
  const { t } = useT()
  const { providers, refresh } = useProviders()
  const [params] = useSearchParams()
  const focus = params.get('instance')
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (focus) document.getElementById(`instance-${focus}`)?.scrollIntoView?.({ block: 'center' })
  }, [focus, providers.length])

  const remove = useCallback(
    async (instance: ProviderInstance) => {
      setError(null)
      try {
        await providersApi.remove(instance.id)
        await refresh()
      } catch (err) {
        setError(wizardErrorMessage(err, t))
      }
    },
    [refresh, t]
  )

  const thirdParty = providers.filter((p) => !(p.builtin || isClaudeCodeProvider(p.id, p.kind)))

  return (
    <div className="space-y-3">
      {thirdParty.length === 0 && (
        <p className="text-sm text-gray-500">
          {t('providerAdmin.instances.none')}
        </p>
      )}
      <ul className="grid gap-3" aria-label={t('providerAdmin.instances.listAria')}>
        {providers.map((p) => (
          <InstanceCard
            key={p.id}
            instance={p}
            highlighted={focus === p.id}
            editing={editing === p.id}
            onEdit={() => setEditing(p.id)}
            onCloseEdit={() => setEditing(null)}
            onDelete={() => remove(p)}
          />
        ))}
        {onAdd && <AddProviderCard onAdd={onAdd} />}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
