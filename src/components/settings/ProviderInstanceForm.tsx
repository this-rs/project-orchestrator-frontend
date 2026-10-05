import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'
import { ProviderStateCard } from '@/components/chat/ProviderStateCard'
import { PROVIDER_PRESETS, presetInfo, type CredentialKind } from '@/constants/providerPresets'
import { COST_BASIS_LABELS, settingsErrorMessage, validateBaseUrl } from '@/constants/providerSettings'
import { VAULT_PATH } from '@/constants/providerErrors'
import { providersApi, toProviderError } from '@/services/providers'
import { vaultApi } from '@/services/vault'
import { COST_BASES, type CostBasis, type CredentialRef, type ProviderInstance, type ProviderPreset } from '@/types/provider'
import type { ProviderDraft, ProviderTestResult } from '@/types/providerSettings'
import type { ProviderErrorInfo } from '@/types/provider'
import { ConfirmPanel, FIELD, LABEL } from './ConfirmPanel'

interface ProviderInstanceFormProps {
  /** Present when editing: the id is then fixed. */
  instance?: ProviderInstance
  /** Ids already taken, for the uniqueness check. */
  existingIds: readonly string[]
  onSaved: () => void | Promise<void>
  onCancel: () => void
}

const SLUG = /^[a-z0-9][a-z0-9_-]*$/
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function splitRef(ref: CredentialRef | null | undefined): { kind: CredentialKind; name: string } {
  if (ref && ref.startsWith('vault:')) return { kind: 'vault', name: ref.slice(6) }
  if (ref && ref.startsWith('env:')) return { kind: 'env', name: ref.slice(4) }
  return { kind: 'none', name: '' }
}

/**
 * Add or edit an OpenAI-compatible instance.
 *
 * There is deliberately NO field for a key: the instance stores a REFERENCE
 * (`vault:<name>`, `env:<VAR>`, `none`), and the value is typed into the vault.
 */
export function ProviderInstanceForm({ instance, existingIds, onSaved, onCancel }: ProviderInstanceFormProps) {
  const uid = useId()
  const editing = !!instance
  const initialRef = splitRef(instance?.credential_ref)
  const [preset, setPreset] = useState<string>(instance?.preset ?? 'custom')
  const [id, setId] = useState(instance?.id ?? '')
  const [label, setLabel] = useState(instance?.label ?? '')
  const [baseUrl, setBaseUrl] = useState(instance?.base_url ?? '')
  const [model, setModel] = useState(instance?.default_model ?? '')
  const [cost, setCost] = useState<CostBasis>(instance?.cost_source ?? 'unknown')
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

  const choosePreset = (value: string) => {
    setPreset(value)
    if (editing) return
    const info = presetInfo(value)
    setBaseUrl(info.base_url)
    setCost(info.cost_source)
    setCredKind(info.credential_kind)
    setCredName('')
    if (value !== 'custom') {
      if (!id) setId(value.replace(/_/g, '-'))
      if (!label) setLabel(info.label)
    }
    setTest(null)
  }

  const errors = useMemo(() => {
    const e: Partial<Record<'id' | 'url' | 'cred', string>> = {}
    const trimmed = id.trim()
    if (!trimmed) e.id = 'The id is required.'
    else if (!SLUG.test(trimmed)) e.id = 'Use lowercase letters, digits, "-" and "_".'
    else if (!editing && existingIds.includes(trimmed)) e.id = 'An instance with this id already exists.'
    const url = validateBaseUrl(baseUrl)
    if (url) e.url = url
    if (credKind === 'vault' && !credName.trim()) e.cred = 'Choose the secret this instance uses.'
    if (credKind === 'env' && !ENV_NAME.test(credName.trim())) e.cred = 'Enter an environment variable name.'
    return e
  }, [id, baseUrl, credKind, credName, editing, existingIds])
  const valid = Object.keys(errors).length === 0

  const draft = (): ProviderDraft => ({
    id: id.trim(),
    kind: 'openai_compatible',
    preset: preset === 'custom' ? null : (preset as ProviderPreset),
    label: label.trim() || id.trim(),
    base_url: baseUrl.trim(),
    default_model: model.trim() || null,
    cost_source: cost,
    credential_ref: (credKind === 'none' ? 'none' : `${credKind}:${credName.trim()}`) as CredentialRef,
  })

  const runTest = async () => {
    setTouched(true)
    if (!valid) return
    setTesting(true)
    setTest(null)
    try {
      setTest({ result: await providersApi.test(draft()) })
    } catch (err) {
      setTest({ error: toProviderError(err), message: settingsErrorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  const testFailed = !!test && (!!test.error || !!test.message || test.result?.ok === false)

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const d = draft()
      if (editing) {
        const { id: _id, kind: _kind, ...patch } = d
        void _id
        void _kind
        await providersApi.update(instance!.id, patch)
      } else {
        await providersApi.create(d)
      }
      await onSaved()
    } catch (err) {
      setSaveError(settingsErrorMessage(err))
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

  const shown = (key: 'id' | 'url' | 'cred') => (touched ? errors[key] : undefined)
  const cardError: ProviderErrorInfo | null | undefined = test?.error ?? test?.result?.health?.error

  return (
    <form
      aria-label={editing ? `Edit ${instance!.label}` : 'Add a provider instance'}
      className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/40 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        onSave()
      }}
    >
      {!editing && (
        <div>
          <label htmlFor={`${uid}-preset`} className={LABEL}>
            Preset
          </label>
          <select id={`${uid}-preset`} className={FIELD} value={preset} onChange={(e) => choosePreset(e.target.value)}>
            {PROVIDER_PRESETS.map((p) => (
              <option key={p.preset} value={p.preset}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-id`} className={LABEL}>
            Id
          </label>
          <input
            id={`${uid}-id`}
            className={FIELD}
            value={id}
            disabled={editing}
            onChange={(e) => setId(e.target.value)}
            aria-invalid={!!shown('id')}
            aria-describedby={shown('id') ? `${uid}-id-err` : undefined}
          />
          {shown('id') && (
            <p id={`${uid}-id-err`} role="alert" className="mt-1 text-xs text-red-400">
              {errors.id}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${uid}-label`} className={LABEL}>
            Label
          </label>
          <input id={`${uid}-label`} className={FIELD} value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${uid}-url`} className={LABEL}>
            Base URL
          </label>
          <input
            id={`${uid}-url`}
            className={FIELD}
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value)
              setTest(null)
            }}
            placeholder="https://api.example.com/v1"
            aria-invalid={!!shown('url')}
            aria-describedby={shown('url') ? `${uid}-url-err` : undefined}
          />
          {shown('url') && (
            <p id={`${uid}-url-err`} role="alert" className="mt-1 text-xs text-red-400">
              {errors.url}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${uid}-model`} className={LABEL}>
            Default model
          </label>
          <input id={`${uid}-model`} className={FIELD} value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${uid}-cost`} className={LABEL}>
            Cost basis
          </label>
          <select id={`${uid}-cost`} className={FIELD} value={cost} onChange={(e) => setCost(e.target.value as CostBasis)}>
            {COST_BASES.map((c) => (
              <option key={c} value={c}>
                {COST_BASIS_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className={LABEL}>Credential</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-ckind`} className={LABEL}>
              Credential type
            </label>
            <select
              id={`${uid}-ckind`}
              className={FIELD}
              value={credKind}
              onChange={(e) => {
                setCredKind(e.target.value as CredentialKind)
                setCredName('')
              }}
            >
              <option value="vault">Secret in the vault</option>
              <option value="env">Environment variable</option>
              <option value="none">None</option>
            </select>
          </div>
          {credKind === 'vault' && (
            <div>
              <label htmlFor={`${uid}-cname`} className={LABEL}>
                Secret name
              </label>
              {vaultNames && vaultNames.length > 0 ? (
                <select id={`${uid}-cname`} className={FIELD} value={credName} onChange={(e) => setCredName(e.target.value)}>
                  <option value="">Choose a secret…</option>
                  {vaultNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              ) : (
                <input id={`${uid}-cname`} className={FIELD} value={credName} onChange={(e) => setCredName(e.target.value)} placeholder="deepseek-api-key" />
              )}
            </div>
          )}
          {credKind === 'env' && (
            <div>
              <label htmlFor={`${uid}-cname`} className={LABEL}>
                Variable name
              </label>
              <input id={`${uid}-cname`} className={FIELD} value={credName} onChange={(e) => setCredName(e.target.value)} placeholder="DEEPSEEK_API_KEY" />
            </div>
          )}
        </div>
        {shown('cred') && (
          <p role="alert" className="text-xs text-red-400">
            {errors.cred}
          </p>
        )}
        <p className="text-xs text-gray-500">
          The key itself is never typed here: only the name of where it lives is stored.{' '}
          <Link to={VAULT_PATH} className="text-indigo-400 underline hover:text-indigo-300">
            Add the key in the vault
          </Link>
        </p>
      </fieldset>

      {testing && (
        <p role="status" className="text-xs text-gray-400">
          Testing the connection…
        </p>
      )}
      {test?.result && (
        <div role="status" data-testid="provider-test-result" className="rounded border border-gray-800 px-3 py-2 text-xs text-gray-300">
          <p className="font-medium">{test.result.ok ? 'Connection works.' : 'Connection failed.'}</p>
          {test.result.models && (
            <p>
              {test.result.models.length} model{test.result.models.length === 1 ? '' : 's'} found
              {test.result.models.length > 0 && `: ${test.result.models.slice(0, 8).map((m) => m.id).join(', ')}`}
              {test.result.models.length > 8 && '…'}
            </p>
          )}
          {test.result.probe && <p>Tool calls: {test.result.probe.tools ? 'OK' : 'KO (this model cannot call tools)'}</p>}
          {test.result.probe?.context_window != null && <p>Context window: {test.result.probe.context_window.toLocaleString('en-US')} tokens</p>}
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
          title="The connection test failed. Save this instance anyway?"
          confirmLabel="Save anyway"
          onConfirm={save}
          onCancel={() => setConfirmSave(false)}
        >
          Conversations on this instance will fail until the problem is fixed.
        </ConfirmPanel>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={runTest} loading={testing}>
          Test connection
        </Button>
        <Button type="submit" size="sm" loading={saving}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
