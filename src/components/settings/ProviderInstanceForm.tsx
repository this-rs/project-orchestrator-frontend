import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, Select } from '@/components/ui'
import { ProviderStateCard } from '@/components/chat/ProviderStateCard'
import type { CredentialKind } from '@/constants/providerPresets'
import {
  COST_LABELS_FR,
  isProcessKind,
  validateBaseUrlFr,
  validateEnvName,
  wizardErrorMessage,
} from '@/constants/providerWizard'
import { VAULT_PATH } from '@/constants/providerErrors'
import { normalizeProviderHealth, providersApi, toProviderError } from '@/services/providers'
import { vaultApi } from '@/services/vault'
import { COST_BASES, type CostBasis, type CredentialRef, type ProviderErrorInfo, type ProviderInstance } from '@/types/provider'
import type { ProviderPatch, ProviderTestResult } from '@/types/providerSettings'
import { ConfirmPanel } from './ConfirmPanel'
import { FieldNote, FormField } from './FormField'

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
 * Edit an instance: label, URL, model, cost and the credential REFERENCE.
 *
 * There is deliberately NO field for a key here: the instance stores a
 * reference (`vault:<name>`, `env:<VAR>`, `none`). A new key is typed in the
 * "Ajouter un provider" wizard or in the vault, never in this form.
 */
export function ProviderInstanceForm({ instance, onSaved, onCancel }: ProviderInstanceFormProps) {
  const uid = useId().replace(/:/g, '')
  const initialRef = splitRef(instance.credential_ref)
  const process = isProcessKind(instance.kind)
  const acp = instance.kind === 'acp'
  const [label, setLabel] = useState(instance.label ?? '')
  const [baseUrl, setBaseUrl] = useState(instance.base_url ?? '')
  const [model, setModel] = useState(instance.default_model ?? '')
  const [cost, setCost] = useState<CostBasis>(instance.cost_source ?? 'unknown')
  const [credKind, setCredKind] = useState<CredentialKind>(initialRef.kind)
  const [credName, setCredName] = useState(initialRef.name)
  const [vaultNames, setVaultNames] = useState<string[] | null>(null)
  const [touched, setTouched] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ result?: ProviderTestResult; error?: ProviderErrorInfo | null; message?: string } | null>(null)
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
    if (!process) {
      const url = validateBaseUrlFr(baseUrl)
      if (url) e.url = url
    }
    if (credKind === 'vault' && !credName.trim()) e.cred = 'Choisissez la clé du coffre utilisée.'
    if (credKind === 'env') {
      const env = validateEnvName(credName)
      if (env) e.cred = env
    }
    return e
  }, [baseUrl, credKind, credName, process])
  const valid = Object.keys(errors).length === 0

  const patch = (): ProviderPatch => {
    const p: ProviderPatch = {
      preset: instance.preset ?? null,
      label: label.trim() || instance.id,
      default_model: model.trim() || null,
      cost_source: cost,
      credential_ref: (credKind === 'none' ? 'none' : `${credKind}:${credName.trim()}`) as CredentialRef,
    }
    // A codex / acp instance has no URL: the backend refuses one in a patch.
    if (!process) p.base_url = baseUrl.trim()
    return p
  }

  const runTest = async () => {
    setTouched(true)
    if (!valid) return
    setTesting(true)
    setTest(null)
    try {
      setTest({ result: await providersApi.test({ id: instance.id, kind: instance.kind, ...patch() } as ProviderPatch) })
    } catch (err) {
      setTest({ error: toProviderError(err), message: wizardErrorMessage(err) })
    } finally {
      setTesting(false)
    }
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
  const resultHealth = test?.result ? normalizeProviderHealth(test.result.health, instance.id) : null
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
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${uid}-id`} label="Identifiant" help="Ne change jamais.">
          <Input id={`${uid}-id`} value={instance.id} disabled aria-describedby={`${uid}-id-help`} />
        </FormField>
        <FormField id={`${uid}-label`} label="Nom affiché" help="Ce que l’on voit dans le sélecteur de provider.">
          <Input id={`${uid}-label`} value={label} onChange={(e) => setLabel(e.target.value)} aria-describedby={`${uid}-label-help`} />
        </FormField>
        {!process && (
          <FormField
            id={`${uid}-url`}
            className="sm:col-span-2"
            label="URL de base"
            help="Changer l’URL invalide les autorisations des projets : il faudra les redonner."
            error={shown('url')}
          >
            <Input
              id={`${uid}-url`}
              value={baseUrl}
              onChange={(e) => {
                setBaseUrl(e.target.value)
                setTest(null)
              }}
              placeholder="https://api.example.com/v1"
              aria-invalid={!!shown('url')}
              aria-describedby={shown('url') ? `${uid}-url-error` : `${uid}-url-help`}
              autoComplete="off"
              spellCheck={false}
            />
          </FormField>
        )}
        <FormField id={`${uid}-model`} label="Modèle par défaut" help="Facultatif.">
          <Input id={`${uid}-model`} value={model} onChange={(e) => setModel(e.target.value)} aria-describedby={`${uid}-model-help`} />
        </FormField>
        <div className="min-w-0">
          <Select label="Source du coût" options={COST_OPTIONS} value={cost} onChange={(v) => setCost(v as CostBasis)} />
          <FieldNote id={`${uid}-cost`} help="Comment le coût des sessions sera compté." />
        </div>
        <div className="min-w-0">
          <Select
            label="Référence de la clé"
            options={acp ? CRED_OPTIONS.filter((o) => o.value === 'none') : CRED_OPTIONS}
            value={credKind}
            onChange={(v) => {
              setCredKind(v as CredentialKind)
              setCredName('')
            }}
          />
          <FieldNote
            id={`${uid}-ckind`}
            help={acp ? 'Un agent ACP gère sa propre connexion.' : 'Changer la référence invalide les autorisations des projets.'}
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
                onChange={setCredName}
              />
              <FieldNote id={`${uid}-cname`} error={shown('cred')} help="Seuls les noms sont affichés, jamais les valeurs." />
            </div>
          ) : (
            <FormField id={`${uid}-cname`} label="Nom de la clé dans le coffre" help="Le nom seulement." error={shown('cred')}>
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
          <FormField id={`${uid}-cname`} label="Nom de la variable" help="Doit être déclarée dans CHAT_PROVIDER_ENV_CREDENTIALS." error={shown('cred')}>
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

      <p className="text-xs text-gray-500">
        La clé elle-même ne se saisit pas ici : seule sa référence est enregistrée.{' '}
        <Link to={VAULT_PATH} className="text-indigo-400 underline hover:text-indigo-300">
          Ajouter ou remplacer la clé dans le coffre
        </Link>
      </p>

      {test?.result && (
        <div role="status" data-testid="provider-test-result" className="text-sm text-gray-300">
          <p className="font-medium">{test.result.ok ? 'La connexion fonctionne.' : 'La connexion a échoué.'}</p>
          {test.result.models && (
            <p className="text-xs text-gray-400">
              {test.result.models.length} modèle{test.result.models.length > 1 ? 's' : ''} trouvé{test.result.models.length > 1 ? 's' : ''}
              {test.result.models.length > 0 && ` : ${test.result.models.slice(0, 8).map((m) => m.id).join(', ')}`}
              {test.result.models.length > 8 && '…'}
            </p>
          )}
          {test.result.probe && (
            <p className="text-xs text-gray-400">Appel d’outil : {test.result.probe.tools ? 'oui' : 'non (ce modèle ne peut pas appeler d’outils)'}</p>
          )}
          {test.result.probe?.context_window != null && (
            <p className="text-xs text-gray-400">Fenêtre de contexte : {test.result.probe.context_window.toLocaleString('fr-FR')} tokens</p>
          )}
        </div>
      )}
      {cardError && <ProviderStateCard error={cardError} testId="provider-test-error" />}
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
