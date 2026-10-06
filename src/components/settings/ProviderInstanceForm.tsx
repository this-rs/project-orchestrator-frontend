import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, Select } from '@/components/ui'
import type { CredentialKind } from '@/constants/providerPresets'
import {
  COST_LABELS_FR,
  isProcessKind,
  validateBaseUrlFr,
  validateEnvName,
  wizardErrorMessage,
} from '@/constants/providerWizard'
import { VAULT_PATH } from '@/constants/providerErrors'
import {
  normalizeProviderHealth,
  providersApi,
  toProviderError,
  type StoredInstance,
} from '@/services/providers'
import { ApiError } from '@/services/api'
import { vaultApi } from '@/services/vault'
import {
  COST_BASES,
  type CostBasis,
  type CredentialRef,
  type ProviderErrorInfo,
  type ProviderInstance,
} from '@/types/provider'
import type { ProviderPatch, ProviderTestResult } from '@/types/providerSettings'
import { REMOTE_KEY_HINT_FR, REMOTE_KIND, validateVaultKeyName } from '@/constants/remoteClaudeCode'
import { ConfirmPanel } from './ConfirmPanel'
import { RemoteHostFields, remoteErrors, type RemoteField, type RemoteState } from './RemoteHostFields'
import { FieldNote, FormField } from './FormField'
import { ModelField } from './ModelField'
import { SettingsErrorCard } from './SettingsErrorCard'
import { ErrorLine, Loading } from './SettingsPanel'
import { useModelCatalog } from './useModelCatalog'

interface ProviderInstanceFormProps {
  /** The instance edited: its id and kind never change. Adding goes through `ProviderWizard`. */
  instance: ProviderInstance
  onSaved: () => void | Promise<void>
  onCancel: () => void
}

function splitRef(ref: CredentialRef | null | undefined): { kind: CredentialKind; name: string } {
  if (ref && ref.startsWith('vault:')) return { kind: 'vault', name: ref.slice(6) }
  if (ref && ref.startsWith('env:')) return { kind: 'env', name: ref.slice(4) }
  return { kind: 'none', name: '' }
}

const COST_OPTIONS = COST_BASES.map((c) => ({ value: c, label: COST_LABELS_FR[c] }))
const CRED_OPTIONS = [
  { value: 'vault', label: 'Clé du coffre' },
  { value: 'env', label: 'Variable d’environnement du serveur' },
  { value: 'none', label: 'Aucune' },
]

/**
 * The list (`GET /chat/providers`) carries neither `base_url` nor
 * `default_model`: the form loads the stored instance first
 * (`GET /chat/providers/{id}`). A backend without that route (404) or a
 * refusal falls back to the list entry and SAYS what is unknown.
 */
export function ProviderInstanceForm(props: ProviderInstanceFormProps) {
  const { instance } = props
  const [stored, setStored] = useState<StoredInstance | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let live = true
    providersApi
      .get(instance.id)
      .then((s) => {
        if (!live) return
        setStored(s)
        setLoaded(true)
      })
      .catch((err) => {
        if (!live) return
        setLoadError(
          err instanceof ApiError && (err.status === 404 || err.status === 405)
            ? 'Ce serveur ne sait pas encore relire une instance enregistrée (GET /api/chat/providers/{id} absent) : l’URL complète et le modèle par défaut ne sont pas disponibles.'
            : `Impossible de relire l’instance enregistrée : ${wizardErrorMessage(err)}`
        )
        setLoaded(true)
      })
    return () => {
      live = false
    }
  }, [instance.id])

  if (!loaded) {
    return (
      <div className="border-t border-white/[0.06] pt-4">
        <Loading>Chargement de l’instance enregistrée…</Loading>
      </div>
    )
  }
  return <EditForm {...props} stored={stored} loadError={loadError} />
}

/**
 * Edit an instance: label, URL, model, cost and the credential REFERENCE.
 *
 * There is deliberately NO field for a key here: the instance stores a
 * reference (`vault:<name>`, `env:<VAR>`, `none`). A new key is typed in the
 * "Ajouter un provider" wizard or in the vault, never in this form.
 */
function EditForm({
  instance,
  stored,
  loadError,
  onSaved,
  onCancel,
}: ProviderInstanceFormProps & { stored: StoredInstance | null; loadError: string | null }) {
  const uid = useId().replace(/:/g, '')
  const savedRef = (stored?.credential_ref ?? instance.credential_ref ?? 'none') as CredentialRef
  const savedUrl = stored?.base_url ?? instance.base_url ?? ''
  const savedOrigin = stored?.origin ?? instance.origin ?? null
  const initialRef = splitRef(savedRef)
  const kind = stored?.kind ?? instance.kind
  const process = isProcessKind(kind)
  const acp = kind === 'acp'
  const isRemote = kind === REMOTE_KIND
  /** The full URL is unknown (no read route): an empty field then means "unchanged", not "none". */
  const urlUnknown = !process && !savedUrl
  const [label, setLabel] = useState(stored?.label ?? instance.label ?? '')
  const [baseUrl, setBaseUrl] = useState(savedUrl)
  const [model, setModel] = useState(stored?.default_model ?? instance.default_model ?? '')
  const [cost, setCost] = useState<CostBasis>(
    stored?.cost_source ?? instance.cost_source ?? 'unknown'
  )
  const savedRemote: RemoteState = {
    host: stored?.host ?? instance.host ?? '',
    sshUser: stored?.ssh_user ?? instance.ssh_user ?? '',
    sshPort:
      stored?.ssh_port != null
        ? String(stored.ssh_port)
        : instance.ssh_port != null
          ? String(instance.ssh_port)
          : '',
    remoteCwd: stored?.remote_cwd ?? instance.remote_cwd ?? '',
    allowTrust: stored?.allow_trust ?? instance.allow_trust ?? false,
    hostKey: '',
    hostKeyFingerprint: stored?.host_key_fingerprint ?? instance.host_key_fingerprint ?? '',
    hostKeyConfirmed: false,
    // The server holds a pinned key: kept as is until the machine or the port changes.
    hostKeyKept: !!(stored?.host_key_fingerprint ?? instance.host_key_fingerprint),
  }
  const [remote, setRemote] = useState<RemoteState>(savedRemote)
  const [remoteTouched, setRemoteTouched] = useState<Partial<Record<RemoteField, boolean>>>({})
  const remoteErrs = useMemo(() => (isRemote ? remoteErrors(remote) : {}), [isRemote, remote])
  /** Anything about the machine differs from what is saved: a test needs the saved instance first. */
  const remoteDirty =
    isRemote &&
    (remote.host !== savedRemote.host ||
      remote.sshUser !== savedRemote.sshUser ||
      remote.sshPort !== savedRemote.sshPort ||
      remote.remoteCwd !== savedRemote.remoteCwd ||
      remote.allowTrust !== savedRemote.allowTrust ||
      !remote.hostKeyKept)
  /** Host, port or user changed: the consent of every project is revoked. */
  const originMoved =
    isRemote &&
    (remote.host !== savedRemote.host ||
      remote.sshUser !== savedRemote.sshUser ||
      remote.sshPort !== savedRemote.sshPort)
  const catalog = useModelCatalog(instance.id)
  const testingRef = useRef(false)
  const [testBlocked, setTestBlocked] = useState<string | null>(null)
  const [credKind, setCredKind] = useState<CredentialKind>(initialRef.kind)
  const [credName, setCredName] = useState(initialRef.name)
  const [vaultNames, setVaultNames] = useState<string[] | null>(null)
  const [touched, setTouched] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{
    result?: ProviderTestResult
    error?: ProviderErrorInfo | null
    message?: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Names of the secrets already in the vault (never values). Locked, empty or
  // unavailable → the name is typed instead.
  useEffect(() => {
    let cancelled = false
    vaultApi
      .overview()
      .then((o) => {
        if (!cancelled) setVaultNames(o.secrets.map((s) => s.name))
      })
      .catch(() => {
        if (!cancelled) setVaultNames(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const errors = useMemo(() => {
    const e: Partial<Record<'url' | 'cred', string>> = {}
    if (!process && !(urlUnknown && !baseUrl.trim())) {
      const url = validateBaseUrlFr(baseUrl)
      if (url) e.url = url
    }
    if (credKind === 'vault' && isRemote) {
      const bad = validateVaultKeyName(credName)
      if (bad) e.cred = bad
    } else if (credKind === 'vault' && !credName.trim())
      e.cred = 'Choisissez la clé du coffre utilisée.'
    if (credKind === 'env') {
      const env = validateEnvName(credName)
      if (env) e.cred = env
    }
    return e
  }, [baseUrl, credKind, credName, process, urlUnknown, isRemote])
  const valid = Object.keys(errors).length === 0 && Object.keys(remoteErrs).length === 0

  const patch = (): ProviderPatch => {
    const p: ProviderPatch = {
      preset: (stored?.preset ?? instance.preset ?? null) as ProviderPatch['preset'],
      label: label.trim() || instance.id,
      default_model: model.trim() || null,
      cost_source: cost,
      credential_ref: (credKind === 'none'
        ? 'none'
        : `${credKind}:${credName.trim()}`) as CredentialRef,
    }
    // A codex / acp instance has no URL: the backend refuses one in a patch.
    // An unknown URL left empty is not sent: the stored one stays.
    if (!process && baseUrl.trim()) p.base_url = baseUrl.trim()
    if (isRemote) {
      p.host = remote.host.trim()
      p.ssh_user = remote.sshUser.trim()
      if (remote.sshPort.trim()) p.ssh_port = Number(remote.sshPort)
      p.remote_cwd = remote.remoteCwd.trim()
      p.allow_trust = remote.allowTrust
      // The pinned key is only sent when a human just confirmed a new one.
      if (!remote.hostKeyKept) p.host_key = remote.hostKey.trim()
    }
    return p
  }

  const credentialRef = (
    credKind === 'none' ? 'none' : `${credKind}:${credName.trim()}`
  ) as CredentialRef
  const originNow =
    !process && baseUrl.trim()
      ? (() => {
          try {
            return new URL(baseUrl.trim()).origin
          } catch {
            return null
          }
        })()
      : savedOrigin

  /** Why the server would refuse to test this draft, or null. */
  const whyNoTest = (): string | null => {
    if (urlUnknown && !baseUrl.trim()) {
      return 'L’URL complète de cette instance n’est pas connue : saisissez-la pour tester.'
    }
    // A test that sends a key runs only on the SAVED instance, same origin and same key reference.
    if (
      credentialRef !== 'none' &&
      (credentialRef !== savedRef || remoteDirty || (!process && originNow !== savedOrigin))
    ) {
      return 'Enregistrez d’abord l’instance : un test qui envoie une clé exige une instance enregistrée, avec la même URL et la même référence de clé.'
    }
    return null
  }

  const runTest = async () => {
    setTouched(true)
    if (!valid || testingRef.current) return
    const blocked = whyNoTest()
    setTestBlocked(blocked)
    if (blocked) return
    testingRef.current = true
    setTesting(true)
    setTest(null)
    try {
      setTest({
        result: await providersApi.test({
          id: instance.id,
          kind,
          ...patch(),
          base_url: process ? '' : baseUrl.trim(),
        } as ProviderPatch),
      })
    } catch (err) {
      setTest({ error: toProviderError(err), message: wizardErrorMessage(err) })
    } finally {
      testingRef.current = false
      setTesting(false)
    }
  }

  /** Any edit makes the last verdict obsolete. */
  const edited = () => {
    setTest(null)
    setTestBlocked(null)
  }

  const testFailed = !!test && (!!test.error || !!test.message || test.result?.ok === false)

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await providersApi.update(instance.id, patch())
      await onSaved()
    } catch (err) {
      setSaveError(wizardErrorMessage(err))
    } finally {
      setSaving(false)
      setConfirmSave(false)
    }
  }

  const onSave = () => {
    setTouched(true)
    if (!valid) return
    if (testFailed) setConfirmSave(true)
    else void save()
  }

  const shown = (key: 'url' | 'cred') => (touched ? errors[key] : undefined)
  const resultHealth = test?.result
    ? normalizeProviderHealth(test.result.health, instance.id)
    : null
  const cardError: ProviderErrorInfo | null | undefined = test?.error ?? resultHealth?.error

  return (
    <form
      aria-label={`Modifier ${instance.label}`}
      className="space-y-6 border-t border-white/[0.06] pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      {loadError && <ErrorLine>{loadError}</ErrorLine>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${uid}-id`} label="Identifiant" help="Ne change jamais.">
          <Input
            id={`${uid}-id`}
            value={instance.id}
            disabled
            aria-describedby={`${uid}-id-help`}
          />
        </FormField>
        <FormField
          id={`${uid}-label`}
          label="Nom affiché"
          help="Ce que l’on voit dans le sélecteur de provider."
        >
          <Input
            id={`${uid}-label`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-describedby={`${uid}-label-help`}
          />
        </FormField>
        {!process && (
          <FormField
            id={`${uid}-url`}
            className="sm:col-span-2"
            label="URL de base"
            help={
              urlUnknown
                ? `URL enregistrée : ${savedOrigin ?? 'inconnue'} (le chemin n’est pas disponible). Laissez vide pour la garder, ou saisissez l’URL complète.`
                : 'Changer l’URL invalide les autorisations des projets : il faudra les redonner.'
            }
            error={shown('url')}
          >
            <Input
              id={`${uid}-url`}
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value)
                edited()
              }}
              placeholder={
                urlUnknown && savedOrigin ? `${savedOrigin}/…` : 'https://api.example.com/v1'
              }
              aria-invalid={!!shown('url')}
              aria-describedby={shown('url') ? `${uid}-url-error` : `${uid}-url-help`}
              autoComplete="off"
              spellCheck={false}
            />
          </FormField>
        )}
        {isRemote && (
          <RemoteHostFields
            uid={uid}
            value={remote}
            errors={remoteErrs}
            touched={remoteTouched}
            onChange={(patch) => {
              setRemote((r) => ({ ...r, ...patch }))
              edited()
            }}
            onTouch={(f) => setRemoteTouched((t) => ({ ...t, [f]: true }))}
          />
        )}
        {originMoved && (
          <p role="note" data-testid="remote-origin-moved" className="text-xs text-amber-300 sm:col-span-2">
            Changer la machine, le port ou l’utilisateur révoque l’autorisation de chaque projet : il
            faudra la redonner.
          </p>
        )}
        <ModelField
          id={`${uid}-model`}
          label="Modèle par défaut"
          value={model}
          onChange={(m) => {
            setModel(m)
            edited()
          }}
          models={catalog.models}
          loading={catalog.loading}
          error={catalog.error}
          onRefresh={catalog.refresh}
          noneLabel="Aucun (le serveur choisit le premier listé)"
          help="Facultatif. Le test d’appel d’outil porte sur ce modèle."
        />
        <div className="min-w-0">
          <Select
            label="Source du coût"
            options={COST_OPTIONS}
            value={cost}
            onChange={(v) => setCost(v as CostBasis)}
          />
          <FieldNote id={`${uid}-cost`} help="Comment le coût des sessions sera compté." />
        </div>
        <div className="min-w-0">
          <Select
            label="Référence de la clé"
            options={
              acp
                ? CRED_OPTIONS.filter((o) => o.value === 'none')
                : isRemote
                  ? CRED_OPTIONS.filter((o) => o.value === 'vault')
                  : CRED_OPTIONS
            }
            value={credKind}
            onChange={(v) => {
              setCredKind(v as CredentialKind)
              setCredName('')
              edited()
            }}
          />
          <FieldNote
            id={`${uid}-ckind`}
            help={
              acp
                ? 'Un agent ACP gère sa propre connexion.'
                : isRemote
                  ? 'La clé privée SSH, par son nom dans le coffre.'
                  : 'Changer la référence invalide les autorisations des projets.'
            }
          />
        </div>
        {credKind === 'vault' &&
          (vaultNames && vaultNames.length > 0 ? (
            <div className="min-w-0">
              <Select
                label="Clé du coffre"
                placeholder="Choisir une clé…"
                options={vaultNames.map((n) => ({ value: n, label: n }))}
                value={credName}
                onChange={(v) => {
                  setCredName(v)
                  edited()
                }}
              />
              <FieldNote
                id={`${uid}-cname`}
                error={shown('cred')}
                help="Seuls les noms sont affichés, jamais les valeurs."
              />
            </div>
          ) : (
            <FormField
              id={`${uid}-cname`}
              label="Nom de la clé dans le coffre"
              help="Le nom seulement."
              error={shown('cred')}
            >
              <Input
                id={`${uid}-cname`}
                value={credName}
                onChange={(e) => setCredName(e.target.value)}
                placeholder="deepseek"
                aria-describedby={shown('cred') ? `${uid}-cname-error` : `${uid}-cname-help`}
                autoComplete="off"
              />
            </FormField>
          ))}
        {credKind === 'env' && (
          <FormField
            id={`${uid}-cname`}
            label="Nom de la variable"
            help="Doit être déclarée dans CHAT_PROVIDER_ENV_CREDENTIALS."
            error={shown('cred')}
          >
            <Input
              id={`${uid}-cname`}
              value={credName}
              onChange={(e) => setCredName(e.target.value)}
              placeholder="DEEPSEEK_API_KEY"
              aria-describedby={shown('cred') ? `${uid}-cname-error` : `${uid}-cname-help`}
              autoComplete="off"
            />
          </FormField>
        )}
      </div>

      {isRemote && (
        <p data-testid="remote-key-hint" className="text-xs text-amber-300">
          {REMOTE_KEY_HINT_FR}
        </p>
      )}
      <p className="text-xs text-gray-500">
        La clé elle-même ne se saisit pas ici : seule sa référence est enregistrée.{' '}
        <Link to={VAULT_PATH} className="text-indigo-400 underline hover:text-indigo-300">
          Ajouter ou remplacer la clé dans le coffre
        </Link>
      </p>

      {test?.result && (
        <div role="status" data-testid="provider-test-result" className="text-sm text-gray-300">
          <p className="font-medium">
            {test.result.ok ? 'La connexion fonctionne.' : 'La connexion a échoué.'}
          </p>
          {test.result.models && (
            <p className="text-xs text-gray-400">
              {test.result.models.length} modèle{test.result.models.length > 1 ? 's' : ''} trouvé
              {test.result.models.length > 1 ? 's' : ''}
              {test.result.models.length > 0 &&
                ` : ${test.result.models
                  .slice(0, 8)
                  .map((m) => m.id)
                  .join(', ')}`}
              {test.result.models.length > 8 && '…'}
            </p>
          )}
          {test.result.probe && (
            <p className="text-xs text-gray-400">
              Appel d’outil :{' '}
              {test.result.probe.tools
                ? 'oui'
                : 'non — ce modèle n’a pas appelé l’outil de test ; essayez un autre modèle listé'}
              {model ? ` (modèle testé : ${model})` : ''}
            </p>
          )}
          {test.result.probe?.context_window != null && (
            <p className="text-xs text-gray-400">
              Fenêtre de contexte : {test.result.probe.context_window.toLocaleString('fr-FR')}{' '}
              tokens
            </p>
          )}
        </div>
      )}
      {testBlocked && (
        <p role="alert" data-testid="provider-test-blocked" className="text-xs text-amber-300">
          {testBlocked}
        </p>
      )}
      {cardError && <SettingsErrorCard error={cardError} testId="provider-test-error" />}
      {test?.message && !cardError && (
        <p role="alert" className="text-xs text-red-400">
          {test.message}
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-xs text-red-400">
          {saveError}
        </p>
      )}
      {confirmSave && (
        <ConfirmPanel
          title="Le test de connexion a échoué. Enregistrer quand même ?"
          confirmLabel="Enregistrer quand même"
          cancelLabel="Annuler"
          onConfirm={save}
          onCancel={() => setConfirmSave(false)}
        >
          Les conversations sur cette instance échoueront tant que le problème n’est pas réglé.
        </ConfirmPanel>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={runTest} loading={testing}>
          Tester
        </Button>
        <Button type="submit" size="sm" variant="primary" loading={saving}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
