import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { Button, Input, SearchableSelect, ToneText } from '@/components/ui'
import { useProviders, useRefreshProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { hasUsdPrice } from '@/constants/providerSettings'
import { POLICY_MODES, policyRoleLabel, wizardErrorMessage } from '@/constants/providerWizard'
import { useT } from '@/i18n'
import { capabilitiesFor, type ModelAlias, type ProviderInstance } from '@/types/provider'
import {
  POLICY_RULE_ROLES,
  type ModelPolicy as Policy,
  type ModelPolicyMode,
} from '@/types/providerSettings'
import { ConfirmPanel } from './ConfirmPanel'
import { ChoiceRow, FieldNote, FIELD_LABEL, FormField, NativeSelect } from './FormField'
import { CatalogStateNote, TargetVaultUnlock } from './ModelTargets'
import {
  decodeTarget,
  encodeTarget,
  useModelTargets,
  withCurrentTarget,
} from './useModelTargets'
import { ErrorLine, Loading, Panel, SaveStatus } from './SettingsPanel'

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

const ALIAS_GRID = 'grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)_6rem] sm:items-center'

function AliasTable({
  instances,
  collapsible,
  defaultOpen,
}: {
  instances: ProviderInstance[]
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const { t } = useT()
  const [saved, setSaved] = useState<ModelAlias[] | null>(null)
  const [rows, setRows] = useState<ModelAlias[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const refreshProviders = useRefreshProviders()
  // One list for every row: every instance and its models, grouped by provider
  // (the live Claude catalog, by family, for Claude Code). Picking a model sets
  // the provider with it.
  const targets = useModelTargets({ instances })

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
      .catch((err) => setLoadError(wizardErrorMessage(err, t)))
  }, [tick, t])

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
      setError(wizardErrorMessage(err, t))
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
      title={t('providerAdmin.policy.aliasesTitle')}
      description={t('providerAdmin.policy.aliasesDescription')}
      status={<SaveStatus error={error} done={done} doneText={t('providerAdmin.policy.aliasesSaved')} />}
      actions={
        loadError && !rows ? (
          <Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>
            {t('providerAdmin.ui.retry')}
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
                {t('providerAdmin.policy.addAlias')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRows(saved)}
                disabled={!dirty || busy}
              >
                {t('providerAdmin.ui.cancel')}
              </Button>
              <Button size="sm" variant="primary" onClick={save} loading={busy}>
                {t('providerAdmin.ui.save')}
              </Button>
            </>
          )
        )
      }
    >
      {!rows && !loadError && <Loading>{t('providerAdmin.policy.loadingAliases')}</Loading>}
      {loadError && <ErrorLine>{loadError}</ErrorLine>}
      {rows && (
        <div>
          <div
            className={`${ALIAS_GRID} hidden border-b border-white/[0.06] pb-2 text-xs font-medium text-gray-500 sm:grid`}
            aria-hidden="true"
          >
            <span>{t('providerAdmin.policy.aliasCol')}</span>
            <span>{t('providerAdmin.policy.modelCol')}</span>
            <span />
          </div>
          <ul className="divide-y divide-white/[0.05]" aria-label={t('providerAdmin.policy.aliasesAria')}>
            {rows.map((row, i) => {
              const instance = instances.find((p) => p.id === row.provider)
              const unhealthy =
                !!instance &&
                instance.health.status !== 'healthy' &&
                instance.health.status !== 'unknown'
              const fixed = (FIXED_ALIASES as readonly string[]).includes(row.alias)
              const name = row.alias || t('providerAdmin.policy.newAlias')
              // A row with a provider and no model is not a target yet: it reads as unset.
              const current = row.provider && row.model ? { provider: row.provider, model: row.model } : undefined
              return (
                <li
                  key={i}
                  data-testid={`alias-${row.alias || i}`}
                  className={`${ALIAS_GRID} py-3`}
                >
                  <div className="min-w-0">
                    <label htmlFor={`alias-name-${i}`} className={`${FIELD_LABEL} sm:sr-only`}>
                      {t('providerAdmin.policy.aliasCol')}
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
                        placeholder={t('providerAdmin.policy.aliasPlaceholder')}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`alias-model-${i}`} className={`${FIELD_LABEL} sm:sr-only`}>
                      {t('providerAdmin.policy.modelOf', { name })}
                    </label>
                    <SearchableSelect
                      id={`alias-model-${i}`}
                      value={current ? encodeTarget(current) : ''}
                      options={withCurrentTarget(t, targets.options, current, instances)}
                      noneLabel={t('providerAdmin.policy.unset')}
                      noun={{ one: t('providerAdmin.models.nounOne'), other: t('providerAdmin.models.nounOther') }}
                      loading={targets.catalog === 'loading'}
                      onChange={(v) => {
                        const target = decodeTarget(v)
                        set(i, { provider: target?.provider ?? '', model: target?.model ?? '' })
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {unhealthy && (
                      <span data-testid={`alias-unhealthy-${row.alias}`}>
                        <ToneText tone="warning" icon label={t('providerAdmin.policy.unreachable')} className="text-xs" />
                      </span>
                    )}
                    {!fixed && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRows((r) => r && r.filter((_, j) => j !== i))}
                        aria-label={t('providerAdmin.policy.removeAlias', { name })}
                      >
                        {t('providerAdmin.ui.remove')}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="mt-3 space-y-2">
            <CatalogStateNote state={targets.catalog} onRetry={targets.refresh} />
            <TargetVaultUnlock
              providers={rows.map((r) => r.provider)}
              instances={instances}
              onUnlocked={() => {
                // The providers that depend on the vault answer now: re-read them and their catalogs.
                void refreshProviders()
                targets.refresh()
              }}
            />
          </div>
        </div>
      )}
    </Panel>
  )
}

function PolicyForm({
  instances,
  collapsible,
  defaultOpen,
}: {
  instances: ProviderInstance[]
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const { t } = useT()
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
        setLoadError(wizardErrorMessage(p.reason, t))
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
  }, [tick, t])

  const aliasNames = useMemo(() => withFixedRows(aliases).map((a) => a.alias), [aliases])
  const modelOfAlias = useCallback(
    (alias: string | undefined) => {
      const a = aliases.find((x) => x.alias === alias)
      if (!a) return t('providerAdmin.policy.noModel')
      return `${instances.find((p) => p.id === a.provider)?.label ?? a.provider} / ${a.model}`
    },
    [aliases, instances, t]
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
      setError(wizardErrorMessage(err, t))
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
          placeholder={locked ? t('providerAdmin.policy.capUnavailable') : t('providerAdmin.policy.capNone')}
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
      title={t('providerAdmin.policy.title')}
      description={t('providerAdmin.policy.description')}
      status={<SaveStatus error={error} done={done} doneText={t('providerAdmin.policy.saved')} />}
      actions={
        loadError && !saved ? (
          <Button size="sm" variant="secondary" onClick={() => setTick((n) => n + 1)}>
            {t('providerAdmin.ui.retry')}
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
                {t('providerAdmin.ui.cancel')}
              </Button>
              <Button size="sm" variant="primary" onClick={onSave} loading={busy}>
                {t('providerAdmin.ui.save')}
              </Button>
            </>
          )
        )
      }
    >
      {!saved && !loadError && <Loading>{t('providerAdmin.policy.loading')}</Loading>}
      {loadError && <ErrorLine>{loadError}</ErrorLine>}
      {saved && (
        <>
          <fieldset>
            <legend className={FIELD_LABEL}>{t('providerAdmin.policy.mode')}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {POLICY_MODES.map((m) => (
                <ChoiceRow
                  key={m.value}
                  name="policy-mode"
                  value={m.value}
                  checked={draft.mode === m.value}
                  onChange={(v) => update({ mode: v as ModelPolicyMode })}
                  title={t(m.label)}
                  description={t(m.help)}
                />
              ))}
            </div>
          </fieldset>
          {draft.mode === 'shadow' && (
            <p
              role="status"
              className="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2 text-xs text-sky-200"
            >
              {t('providerAdmin.policy.shadowNote')}
            </p>
          )}

          <fieldset className="space-y-2">
            <legend className={FIELD_LABEL}>{t('providerAdmin.policy.rulesLegend')}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {POLICY_RULE_ROLES.map((role) => (
                <FormField
                  key={role}
                  id={`rule-${role}`}
                  label={
                    <span className="font-normal text-gray-400">{policyRoleLabel(t, role)}</span>
                  }
                >
                  <NativeSelect
                    id={`rule-${role}`}
                    value={draft.rules[role] ?? ''}
                    onChange={(e) => update({ rules: { ...draft.rules, [role]: e.target.value } })}
                  >
                    <option value="">{t('providerAdmin.policy.noRule')}</option>
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
            <legend className={FIELD_LABEL}>{t('providerAdmin.policy.fallbackLegend')}</legend>
            {draft.fallback.length === 0 && (
              <p className="text-xs text-gray-500">
                {t('providerAdmin.policy.noFallback')}
              </p>
            )}
            {draft.fallback.length > 0 && (
              <ol
                className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]"
                aria-label={t('providerAdmin.policy.fallbackAria')}
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
                      aria-label={t('providerAdmin.policy.moveUp', { alias })}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('providerAdmin.policy.moveDown', { alias })}
                      disabled={i === draft.fallback.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('providerAdmin.policy.removeFromChain', { alias })}
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
                  label={<span className="font-normal text-gray-400">{t('providerAdmin.policy.addToChain')}</span>}
                  className="flex-1"
                >
                  <NativeSelect
                    id="fallback-add"
                    value={pendingAlias}
                    onChange={(e) => setPendingAlias(e.target.value)}
                  >
                    <option value="">{t('providerAdmin.policy.chooseAlias')}</option>
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
                  {t('providerAdmin.ui.add')}
                </Button>
              </div>
            </div>
            <FieldNote
              id="fallback-rules"
              help={t('providerAdmin.policy.fallbackRules')}
            />
          </fieldset>

          <fieldset className="space-y-2">
            <legend className={FIELD_LABEL}>{t('providerAdmin.policy.capsLegend')}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {capInput('per_task_usd', t('providerAdmin.policy.perTaskUsd'), true)}
              {capInput('per_run_usd', t('providerAdmin.policy.perRunUsd'), true)}
              {capInput('per_task_tokens', t('providerAdmin.policy.perTaskTokens'), false)}
              {capInput('per_run_tokens', t('providerAdmin.policy.perRunTokens'), false)}
            </div>
            <p id="cap-usd-help" className="text-xs text-gray-500">
              {t('providerAdmin.policy.usdHelp')}
              {!usdAllowed && t('providerAdmin.policy.usdUnavailable')}
            </p>
          </fieldset>

          {confirm && (
            <ConfirmPanel
              title={t('providerAdmin.policy.applyTitle')}
              confirmLabel={t('providerAdmin.policy.apply')}
              onConfirm={doSave}
              onCancel={() => setConfirm(null)}
            >
              {confirm.length === 0 ? (
                <p>{t('providerAdmin.policy.noChange')}</p>
              ) : (
                <>
                  <p>{t('providerAdmin.policy.willChange')}</p>
                  <ul className="mt-1 list-disc pl-4">
                    {confirm.map((c) => (
                      <li key={c.role}>
                        {t('providerAdmin.policy.changeLine', { role: policyRoleLabel(t, c.role), from: c.from, to: c.to })}
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
