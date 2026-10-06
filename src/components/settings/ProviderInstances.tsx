import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, Facts, surface } from '@/components/ui'
import { useProviders, useRefreshProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import {
  COST_LABELS_FR,
  credentialLabelFr,
  formatWhenFr,
  instanceStatus,
  kindLabelFr,
  wizardErrorMessage,
} from '@/constants/providerWizard'
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
 * and the useful actions in one click — Tester, Modifier, Supprimer (with a
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
      setCheckError(wizardErrorMessage(err))
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
            {kindLabelFr(instance.kind)}
            {instance.id.toLowerCase() !== instance.label.toLowerCase() &&
              instance.id.replace(/-/g, ' ') !== instance.label.toLowerCase() && (
                <>
                  {' '}
                  · <span className="font-mono">{instance.id}</span>
                </>
              )}
            {health.checked_at && (
              <span className="text-gray-600"> · vérifié {formatWhenFr(health.checked_at)}</span>
            )}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {!editing && (
        <Facts
          className="mt-3"
          columns={2}
          items={[
            {
              label: 'Point d’accès',
              value: (
                <span className="break-all">
                  {instance.origin ?? (builtin ? 'programme local' : 'inconnu')}
                </span>
              ),
            },
            // Only the lines that say something: the list carries no default model, an unknown cost or version says nothing.
            { label: 'Modèle', value: instance.default_model, hidden: !instance.default_model },
            {
              label: 'Coût',
              value: COST_LABELS_FR[instance.cost_source ?? 'unknown'],
              hidden: !instance.cost_source || instance.cost_source === 'unknown',
            },
            {
              label: 'Clé',
              value: builtin ? (
                'gérée par le programme'
              ) : (
                <span title={credentialLabel(instance.credential_ref)}>
                  {credentialLabelFr(instance.credential_ref)}
                </span>
              ),
            },
            { label: 'Version', value: health.version, hidden: !health.version },
            {
              label: 'Empreinte de la machine',
              value: <code className="break-all font-mono">{instance.host_key_fingerprint}</code>,
              hidden: !instance.host_key_fingerprint,
            },
            {
              label: 'Rock’n roll',
              value: instance.allow_trust ? 'autorisé sur cette machine' : 'non autorisé',
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
          Injoignable : {health.error.message}
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
          title={`Supprimer ${instance.label} ?`}
          confirmLabel={`Supprimer ${instance.label}`}
          cancelLabel="Garder"
          tone="danger"
          onConfirm={async () => {
            await onDelete()
            setConfirmDelete(false)
          }}
          onCancel={() => setConfirmDelete(false)}
        >
          Les conversations existantes sur {instance.label} ne pourront plus être reprises. La clé
          reste dans le coffre.
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
            aria-label={`Tester ${instance.label}`}
          >
            Tester
          </Button>
          {!builtin && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={onEdit}
                aria-label={`Modifier ${instance.label}`}
              >
                Modifier
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setConfirmDelete(true)}
                aria-label={`Supprimer ${instance.label}`}
              >
                Supprimer
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
  return (
    <li
      className={`${surface} flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-dashed p-4`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-100">Un autre provider ?</p>
        <p className="text-xs text-gray-500">
          Une clé d’API, un serveur local ou une autre machine : l’assistant vous guide.
        </p>
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={onAdd}>
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Connecter un provider
      </Button>
    </li>
  )
}

export function ProviderInstances({ onAdd }: { onAdd?: () => void } = {}) {
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
        setError(wizardErrorMessage(err))
      }
    },
    [refresh]
  )

  const thirdParty = providers.filter((p) => !(p.builtin || isClaudeCodeProvider(p.id, p.kind)))

  return (
    <div className="space-y-3">
      {thirdParty.length === 0 && (
        <p className="text-sm text-gray-500">
          Aucun provider tiers pour l’instant : seul Claude Code est disponible. « Ajouter un
          provider » vous guide.
        </p>
      )}
      <ul className="grid gap-3" aria-label="Providers">
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
