import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button, Input, ToneText } from '@/components/ui'
import { useProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { hasUsdPrice } from '@/constants/providerSettings'
import {
  POLICY_MODES_FR,
  POLICY_ROLE_LABELS_FR,
  modelCapabilities,
  wizardErrorMessage,
} from '@/constants/providerWizard'
import {
  capabilitiesFor,
  type ModelAlias,
  type ProviderInstance,
  type ProviderModel,
} from '@/types/provider'
import {
  POLICY_RULE_ROLES,
  type ModelPolicy as Policy,
  type ModelPolicyMode,
} from '@/types/providerSettings'
import { ConfirmPanel } from './ConfirmPanel'
import { ChoiceRow, FieldNote, FIELD_LABEL, FormField, NativeSelect } from './FormField'
import { ErrorLine, Loading, Panel, SaveStatus } from './SettingsPanel'
import { useModelCatalog } from './useModelCatalog'

const FIXED_ALIASES = ['fast', 'default', 'deep', 'utility'] as const
const OFF_POLICY: Policy = { mode: 'off', rules: {}, fallback: [], caps: {} }

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

function costOf(instance: ProviderInstance | undefined, model: string | undefined) {
  if (!instance) return 'unknown' as const
  return instance.cost_source ?? capabilitiesFor(instance, model).cost
}

/** Rows of the alias table: the four fixed aliases first (even when unset), then the free ones. */
function withFixedRows(aliases: ModelAlias[]): ModelAlias[] {
  const fixed = FIXED_ALIASES.map(
    (a) => aliases.find((x) => x.alias === a) ?? { alias: a, provider: '', model: '' }
  )
  return [
    ...fixed,
    ...aliases.filter((a) => !(FIXED_ALIASES as readonly string[]).includes(a.alias)),
  ]
}

/**
 * The model of one alias, from the instance's catalog (loaded on demand,
 * cached for the session), with capabilities when known; free typing when the
 * catalog is empty or unavailable. A model outside the catalog stays visible.
 */
function AliasModelSelect({
  id,
  provider,
  fallback,
  value,
  onChange,
}: {
  id: string
  provider: string
  fallback: ProviderModel[]
  value: string
  onChange: (model: string) => void
}) {
  const catalog = useModelCatalog(provider || null, !!provider)
  const models = catalog.models && catalog.models.length > 0 ? catalog.models : fallback
  if (!provider || models.length === 0) {
    return (
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!provider}
        title={catalog.error ? `Catalogue indisponible : ${catalog.error}` : undefined}
        placeholder={
          !provider ? '—' : catalog.loading ? 'Chargement des modèles…' : 'nom du modèle'
        }
      />
    )
  }
  const listed = models.some((m) => m.id === value)
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choisir un modèle…</option>
      {value && !listed && <option value={value}>{value} (hors catalogue)</option>}
      {models.map((m) => {
        const caps = modelCapabilities(m)
        return (
          <option key={m.id} value={m.id}>
            {m.label ?? m.id}
            {caps ? ` — ${caps}` : ''}
          </option>
        )
      })}
    </NativeSelect>
  )
}

const ALIAS_GRID = 'grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_6rem] sm:items-center'

function AliasTable({
  instances,
  collapsible,
  defaultOpen,
}: {
  instances: ProviderInstance[]
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const [saved, setSaved] = useState<ModelAlias[] | null>(null)
  const [rows, setRows] = useState<ModelAlias[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const [tick, setTick] = useState(0)
  useEffect(() => {
    providersApi
      .aliases()
      .then((a) => {
        const r = withFixedRows(Array.isArray(a) ? a : [])
        setSaved(r)
        setRows(r)
        setLoadError(null)
      })
      .catch((err) => setLoadError(wizardErrorMessage(err)))
  }, [tick])

  const set = (i: number, patch: Partial<ModelAlias>) => {
    setRows((r) => r && r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
    setDone(false)
  }

  const save = async () => {
    if (!rows) return
    setBusy(true)
    setError(null)
    try {
      const cleaned = rows
        .filter((r) => r.alias.trim() && r.provider && r.model.trim())
        .map((r) => ({ ...r, alias: r.alias.trim(), model: r.model.trim() }))
      await providersApi.setAliases(cleaned)
      setSaved(rows)
      setDone(true)
    } catch (err) {
      setError(wizardErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const dirty = !!rows && !same(rows, saved)

  return (
    <Panel
      testId="aliases-panel"
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      title="Alias de modèles"
      description="Un alias est un nom logique (fast, default, deep, utility…) qui pointe vers un modèle d’un provider ; la politique ci-dessous s’en sert. Un alias sans provider n’est simplement pas utilisable."
      status={<SaveStatus error={error} done={done} doneText="Alias enregistrés." />}
      actions={
        loadError && !rows ? (
          <Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>
            Réessayer
          </Button>
        ) : (
          rows && (
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRows((r) => [...(r ?? []), { alias: '', provider: '', model: '' }])
                  setDone(false)
                }}
              >
                Ajouter un alias
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRows(saved)}
                disabled={!dirty || busy}
              >
                Annuler
              </Button>
              <Button size="sm" variant="primary" onClick={save} loading={busy}>
                Enregistrer
              </Button>
            </>
          )
        )
      }
    >
      {!rows && !loadError && <Loading>Chargement des alias…</Loading>}
      {loadError && <ErrorLine>{loadError}</ErrorLine>}
      {rows && (
        <div>
          <div
            className={`${ALIAS_GRID} hidden border-b border-white/[0.06] pb-2 text-xs font-medium text-gray-500 sm:grid`}
            aria-hidden="true"
          >
            <span>Alias</span>
            <span>Provider</span>
            <span>Modèle</span>
            <span />
          </div>
          <ul className="divide-y divide-white/[0.05]" aria-label="Alias de modèles">
            {rows.map((row, i) => {
              const instance = instances.find((p) => p.id === row.provider)
              const unhealthy =
                !!instance &&
                instance.health.status !== 'healthy' &&
                instance.health.status !== 'unknown'
              const fixed = (FIXED_ALIASES as readonly string[]).includes(row.alias)
              const models = instance?.models ?? []
              const name = row.alias || 'nouvel alias'
              return (
                <li
                  key={i}
                  data-testid={`alias-${row.alias || i}`}
                  className={`${ALIAS_GRID} py-3`}
                >
                  <div className="min-w-0">
                    <label htmlFor={`alias-name-${i}`} className={`${FIELD_LABEL} sm:sr-only`}>
                      Alias
                    </label>
                    {fixed ? (
                      <p id={`alias-name-${i}`} className="py-2 font-mono text-sm text-gray-100">
                        {row.alias}
                      </p>
                    ) : (
                      <Input
                        id={`alias-name-${i}`}
                        value={row.alias}
                        onChange={(e) => set(i, { alias: e.target.value })}
                        placeholder="mon-alias"
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`alias-inst-${i}`} className={`${FIELD_LABEL} sm:sr-only`}>
                      Provider de {name}
                    </label>
                    <NativeSelect
                      id={`alias-inst-${i}`}
                      value={row.provider}
                      onChange={(e) => set(i, { provider: e.target.value, model: '' })}
                    >
                      <option value="">Non réglé</option>
                      {instances.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`alias-model-${i}`} className={`${FIELD_LABEL} sm:sr-only`}>
                      Modèle de {name}
                    </label>
                    <AliasModelSelect
                      id={`alias-model-${i}`}
                      provider={row.provider}
                      fallback={models}
                      value={row.model}
                      onChange={(model) => set(i, { model })}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {unhealthy && (
                      <span data-testid={`alias-unhealthy-${row.alias}`}>
                        <ToneText tone="warning" icon label="Injoignable" className="text-xs" />
                      </span>
                    )}
                    {!fixed && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRows((r) => r && r.filter((_, j) => j !== i))}
                        aria-label={`Retirer l’alias ${name}`}
                      >
                        Retirer
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Panel>
  )
}

const USD_CAP_HELP_FR =
  'Un plafond en dollars a besoin d’un prix : une exécution plafonnée en USD est refusée si son modèle n’en a pas. Les modèles sans prix se plafonnent en tokens.'

function PolicyForm({
  instances,
  collapsible,
  defaultOpen,
}: {
  instances: ProviderInstance[]
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const [saved, setSaved] = useState<Policy | null>(null)
  const [draft, setDraft] = useState<Policy>(OFF_POLICY)
  const [aliases, setAliases] = useState<ModelAlias[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ role: string; from: string; to: string }[] | null>(null)
  const [pendingAlias, setPendingAlias] = useState('')

  const [tick, setTick] = useState(0)
  useEffect(() => {
    Promise.allSettled([providersApi.policy(), providersApi.aliases()]).then(([p, a]) => {
      if (a.status === 'fulfilled' && Array.isArray(a.value)) setAliases(a.value)
      // A policy that could not be read is not shown as "off": saving it would overwrite the real one.
      if (p.status === 'rejected') {
        setLoadError(wizardErrorMessage(p.reason))
        return
      }
      const policy: Policy = p.value
        ? {
            ...OFF_POLICY,
            ...p.value,
            caps: p.value.caps ?? {},
            rules: p.value.rules ?? {},
            fallback: p.value.fallback ?? [],
          }
        : OFF_POLICY
      setSaved(policy)
      setDraft(policy)
      setLoadError(null)
    })
  }, [tick])

  const aliasNames = useMemo(() => withFixedRows(aliases).map((a) => a.alias), [aliases])
  const modelOfAlias = useCallback(
    (alias: string | undefined) => {
      const a = aliases.find((x) => x.alias === alias)
      if (!a) return 'aucun modèle'
      return `${instances.find((p) => p.id === a.provider)?.label ?? a.provider} / ${a.model}`
    },
    [aliases, instances]
  )

  // USD caps need a price on EVERY alias the policy can reach.
  const usedAliases = useMemo(
    () => [...new Set([...Object.values(draft.rules), ...draft.fallback].filter(Boolean))],
    [draft.rules, draft.fallback]
  )
  const usdAllowed =
    usedAliases.length > 0 &&
    usedAliases.every((name) => {
      const a = aliases.find((x) => x.alias === name)
      return (
        !!a &&
        hasUsdPrice(
          costOf(
            instances.find((p) => p.id === a.provider),
            a.model
          )
        )
      )
    })

  const update = (patch: Partial<Policy>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setDone(false)
  }
  const setCap = (key: keyof Policy['caps'], raw: string) => {
    const n = raw.trim() === '' ? null : Number(raw)
    update({ caps: { ...draft.caps, [key]: n !== null && Number.isFinite(n) && n > 0 ? n : null } })
  }
  const move = (i: number, by: -1 | 1) => {
    const next = [...draft.fallback]
    const j = i + by
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    update({ fallback: next })
  }

  const doSave = async () => {
    setBusy(true)
    setError(null)
    try {
      const body: Policy = {
        ...draft,
        rules: Object.fromEntries(Object.entries(draft.rules).filter(([, v]) => v)),
      }
      if (!usdAllowed) body.caps = { ...body.caps, per_task_usd: null, per_run_usd: null }
      const res = await providersApi.setPolicy(body)
      const next = res && typeof res === 'object' && 'mode' in res ? res : body
      setSaved(next)
      setDraft(next)
      setDone(true)
    } catch (err) {
      setError(wizardErrorMessage(err))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const onSave = () => {
    if (draft.mode === 'enforce' && saved?.mode !== 'enforce') {
      // Without a policy, everything runs on the `default` alias: that is the model that changes.
      const changes = POLICY_RULE_ROLES.flatMap((role) => {
        const alias = draft.rules[role]
        if (!alias) return []
        const from = modelOfAlias('default')
        const to = modelOfAlias(alias)
        return from === to ? [] : [{ role, from, to }]
      })
      setConfirm(changes)
      return
    }
    void doSave()
  }

  const capInput = (key: keyof Policy['caps'], label: string, usd: boolean) => {
    const locked = usd && !usdAllowed
    const id = `cap-${key}`
    return (
      <FormField key={key} id={id} label={label}>
        <Input
          id={id}
          type="number"
          min={0}
          inputMode="decimal"
          value={locked ? '' : (draft.caps[key] ?? '')}
          readOnly={locked}
          aria-disabled={locked || undefined}
          aria-describedby={usd ? 'cap-usd-help' : undefined}
          placeholder={locked ? 'indisponible' : 'aucun'}
          className={locked ? 'opacity-50' : ''}
          onChange={(e) => !locked && setCap(key, e.target.value)}
        />
      </FormField>
    )
  }

  const dirty = saved !== null && !same(saved, draft)

  return (
    <Panel
      testId="policy-panel"
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      title="Politique de modèle"
      description="Choisit le modèle de chaque usage (conversation, runner…) à partir des alias, avec une chaîne de repli et des plafonds. Désactivée, rien ne change : chaque rôle garde son modèle."
      status={<SaveStatus error={error} done={done} doneText="Politique enregistrée." />}
      actions={
        loadError && !saved ? (
          <Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>
            Réessayer
          </Button>
        ) : (
          saved && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(saved)}
                disabled={!dirty || busy}
              >
                Annuler
              </Button>
              <Button size="sm" variant="primary" onClick={onSave} loading={busy}>
                Enregistrer
              </Button>
            </>
          )
        )
      }
    >
      {!saved && !loadError && <Loading>Chargement de la politique…</Loading>}
      {loadError && <ErrorLine>{loadError}</ErrorLine>}
      {saved && (
        <>
          <fieldset>
            <legend className={FIELD_LABEL}>Mode</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {POLICY_MODES_FR.map((m) => (
                <ChoiceRow
                  key={m.value}
                  name="policy-mode"
                  value={m.value}
                  checked={draft.mode === m.value}
                  onChange={(v) => update({ mode: v as ModelPolicyMode })}
                  title={m.label}
                  description={m.help}
                />
              ))}
            </div>
          </fieldset>
          {draft.mode === 'shadow' && (
            <p
              role="status"
              className="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2 text-xs text-sky-200"
            >
              Observer seulement : la politique calcule et enregistre son choix, sans l’appliquer.
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className={FIELD_LABEL}>Règles : quel alias pour quel usage</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {POLICY_RULE_ROLES.map((role) => (
                <FormField
                  key={role}
                  id={`rule-${role}`}
                  label={
                    <span className="font-normal text-gray-400">{POLICY_ROLE_LABELS_FR[role]}</span>
                  }
                >
                  <NativeSelect
                    id={`rule-${role}`}
                    value={draft.rules[role] ?? ''}
                    onChange={(e) => update({ rules: { ...draft.rules, [role]: e.target.value } })}
                  >
                    <option value="">Aucune règle</option>
                    {aliasNames.map((a) => (
                      <option key={a} value={a}>
                        {a} ({modelOfAlias(a)})
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={FIELD_LABEL}>Chaîne de repli (essayée dans cet ordre)</legend>
            {draft.fallback.length === 0 && (
              <p className="text-xs text-gray-500">
                Aucun repli : un modèle en échec n’est pas remplacé.
              </p>
            )}
            {draft.fallback.length > 0 && (
              <ol
                className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]"
                aria-label="Chaîne de repli"
              >
                {draft.fallback.map((alias, i) => (
                  <li
                    key={`${alias}-${i}`}
                    className="flex items-center gap-3 px-3 py-1.5 text-sm text-gray-200"
                  >
                    <span className="w-5 text-xs tabular-nums text-gray-500">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-mono">{alias}</span>{' '}
                      <span className="text-xs text-gray-500">({modelOfAlias(alias)})</span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Monter ${alias}`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Descendre ${alias}`}
                      disabled={i === draft.fallback.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Retirer ${alias} de la chaîne`}
                      onClick={() => update({ fallback: draft.fallback.filter((_, j) => j !== i) })}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ol>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-end gap-2">
                <FormField
                  id="fallback-add"
                  label={<span className="font-normal text-gray-400">Ajouter à la chaîne</span>}
                  className="flex-1"
                >
                  <NativeSelect
                    id="fallback-add"
                    value={pendingAlias}
                    onChange={(e) => setPendingAlias(e.target.value)}
                  >
                    <option value="">Choisir un alias…</option>
                    {aliasNames
                      .filter((a) => !draft.fallback.includes(a))
                      .map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                  </NativeSelect>
                </FormField>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!pendingAlias}
                  onClick={() => {
                    update({ fallback: [...draft.fallback, pendingAlias] })
                    setPendingAlias('')
                  }}
                >
                  Ajouter
                </Button>
              </div>
            </div>
            <FieldNote
              id="fallback-rules"
              help="Un repli n’atteint jamais une origine que le projet n’a pas autorisée, et ne remplace jamais un modèle choisi explicitement."
            />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={FIELD_LABEL}>Plafonds (vide = pas de plafond)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {capInput('per_task_usd', 'Par tâche (USD)', true)}
              {capInput('per_run_usd', 'Par exécution (USD)', true)}
              {capInput('per_task_tokens', 'Par tâche (tokens)', false)}
              {capInput('per_run_tokens', 'Par exécution (tokens)', false)}
            </div>
            <p id="cap-usd-help" className="text-xs text-gray-500">
              {USD_CAP_HELP_FR}
              {!usdAllowed &&
                ' Plafonds en dollars indisponibles tant que chaque alias utilisé ci-dessus ne pointe pas vers un provider tarifé.'}
            </p>
          </fieldset>

          {confirm && (
            <ConfirmPanel
              title="Appliquer cette politique ?"
              confirmLabel="Appliquer"
              onConfirm={doSave}
              onCancel={() => setConfirm(null)}
            >
              {confirm.length === 0 ? (
                <p>Aucun usage ne change de modèle.</p>
              ) : (
                <>
                  <p>Ces usages changeront de modèle :</p>
                  <ul className="mt-1 list-disc pl-4">
                    {confirm.map((c) => (
                      <li key={c.role}>
                        {POLICY_ROLE_LABELS_FR[c.role] ?? c.role} : {c.from} → {c.to}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </ConfirmPanel>
          )}
        </>
      )}
    </Panel>
  )
}

/** Model aliases and the routing policy (delivered `off`). */
export function ModelPolicy({
  collapsible,
  defaultOpen,
}: { collapsible?: boolean; defaultOpen?: boolean } = {}) {
  const { providers } = useProviders()
  return (
    <div className="space-y-6">
      <AliasTable instances={providers} collapsible={collapsible} defaultOpen={defaultOpen} />
      <PolicyForm instances={providers} collapsible={collapsible} defaultOpen={defaultOpen} />
    </div>
  )
}
