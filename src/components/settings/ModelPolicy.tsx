import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { useProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import {
  POLICY_FALLBACK_RULES_TEXT,
  POLICY_ROLE_LABELS,
  POLICY_SHADOW_TEXT,
  POLICY_USD_CAP_HELP,
  hasUsdPrice,
  settingsErrorMessage,
} from '@/constants/providerSettings'
import { capabilitiesFor, type ModelAlias, type ProviderInstance } from '@/types/provider'
import { POLICY_RULE_ROLES, type ModelPolicy as Policy, type ModelPolicyMode } from '@/types/providerSettings'
import { ConfirmPanel, FIELD, LABEL } from './ConfirmPanel'

const FIXED_ALIASES = ['fast', 'default', 'deep', 'utility'] as const
const OFF_POLICY: Policy = { mode: 'off', rules: {}, fallback: [], caps: {} }

const MODES: { value: ModelPolicyMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'shadow', label: 'Shadow' },
  { value: 'enforce', label: 'Enforce' },
]

function costOf(instance: ProviderInstance | undefined, model: string | undefined) {
  if (!instance) return 'unknown' as const
  return instance.cost_source ?? capabilitiesFor(instance, model).cost
}

/** Rows of the alias table: the four fixed aliases first (even when unset), then the free ones. */
function withFixedRows(aliases: ModelAlias[]): ModelAlias[] {
  const fixed = FIXED_ALIASES.map((a) => aliases.find((x) => x.alias === a) ?? { alias: a, provider: '', model: '' })
  return [...fixed, ...aliases.filter((a) => !(FIXED_ALIASES as readonly string[]).includes(a.alias))]
}

function AliasTable({ instances }: { instances: ProviderInstance[] }) {
  const [rows, setRows] = useState<ModelAlias[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    providersApi
      .aliases()
      .then((a) => setRows(withFixedRows(Array.isArray(a) ? a : [])))
      .catch((err) => {
        setRows(withFixedRows([]))
        setError(settingsErrorMessage(err))
      })
  }, [])

  const set = (i: number, patch: Partial<ModelAlias>) => {
    setRows((r) => r && r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
    setDone(false)
  }

  const save = async () => {
    if (!rows) return
    setBusy(true)
    setError(null)
    try {
      const cleaned = rows.filter((r) => r.alias.trim() && r.provider && r.model.trim()).map((r) => ({ ...r, alias: r.alias.trim(), model: r.model.trim() }))
      await providersApi.setAliases(cleaned)
      setDone(true)
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!rows) return <p className="text-sm text-gray-500">Loading aliases…</p>

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">An alias is a logical model name (fast, default, deep, utility…) that points at one model of one instance.</p>
      <ul className="space-y-2" aria-label="Model aliases">
        {rows.map((row, i) => {
          const instance = instances.find((p) => p.id === row.provider)
          const unhealthy = !!instance && instance.health.status !== 'healthy' && instance.health.status !== 'unknown'
          const fixed = (FIXED_ALIASES as readonly string[]).includes(row.alias)
          const models = instance?.models ?? []
          return (
            <li key={i} data-testid={`alias-${row.alias || i}`} className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_1fr_auto]">
              <div>
                <label htmlFor={`alias-name-${i}`} className={LABEL}>
                  Alias
                </label>
                <input id={`alias-name-${i}`} className={FIELD} value={row.alias} readOnly={fixed} onChange={(e) => set(i, { alias: e.target.value })} />
              </div>
              <div>
                <label htmlFor={`alias-inst-${i}`} className={LABEL}>
                  Instance for {row.alias || 'new alias'}
                </label>
                <select id={`alias-inst-${i}`} className={FIELD} value={row.provider} onChange={(e) => set(i, { provider: e.target.value, model: '' })}>
                  <option value="">Not set</option>
                  {instances.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`alias-model-${i}`} className={LABEL}>
                  Model for {row.alias || 'new alias'}
                </label>
                {models.length > 0 ? (
                  <select id={`alias-model-${i}`} className={FIELD} value={row.model} onChange={(e) => set(i, { model: e.target.value })}>
                    <option value="">Choose a model…</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label ?? m.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input id={`alias-model-${i}`} className={FIELD} value={row.model} onChange={(e) => set(i, { model: e.target.value })} />
                )}
              </div>
              <div className="flex items-center gap-2">
                {unhealthy && (
                  <span data-testid={`alias-unhealthy-${row.alias}`} className="text-xs text-amber-300">
                    Instance not healthy
                  </span>
                )}
                {!fixed && (
                  <Button size="sm" variant="ghost" aria-label={`Remove alias ${row.alias || 'new'}`} onClick={() => setRows((r) => r && r.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setRows((r) => [...(r ?? []), { alias: '', provider: '', model: '' }])}>
          Add an alias
        </Button>
        <Button size="sm" onClick={save} loading={busy}>
          Save aliases
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-xs text-emerald-300">
          Aliases saved.
        </p>
      )}
    </div>
  )
}

function PolicyForm({ instances }: { instances: ProviderInstance[] }) {
  const [saved, setSaved] = useState<Policy | null>(null)
  const [draft, setDraft] = useState<Policy>(OFF_POLICY)
  const [aliases, setAliases] = useState<ModelAlias[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ role: string; from: string; to: string }[] | null>(null)
  const [pendingAlias, setPendingAlias] = useState('')

  useEffect(() => {
    Promise.allSettled([providersApi.policy(), providersApi.aliases()]).then(([p, a]) => {
      const policy: Policy = p.status === 'fulfilled' && p.value ? { ...OFF_POLICY, ...p.value, caps: p.value.caps ?? {}, rules: p.value.rules ?? {}, fallback: p.value.fallback ?? [] } : OFF_POLICY
      setSaved(policy)
      setDraft(policy)
      if (p.status === 'rejected') setError(settingsErrorMessage(p.reason))
      if (a.status === 'fulfilled' && Array.isArray(a.value)) setAliases(a.value)
    })
  }, [])

  const aliasNames = useMemo(() => withFixedRows(aliases).map((a) => a.alias), [aliases])
  const modelOfAlias = useCallback(
    (alias: string | undefined) => {
      const a = aliases.find((x) => x.alias === alias)
      if (!a) return 'no model'
      return `${instances.find((p) => p.id === a.provider)?.label ?? a.provider} / ${a.model}`
    },
    [aliases, instances],
  )

  // USD caps need a price on EVERY alias the policy can reach.
  const usedAliases = useMemo(() => [...new Set([...Object.values(draft.rules), ...draft.fallback].filter(Boolean))], [draft.rules, draft.fallback])
  const usdAllowed =
    usedAliases.length > 0 &&
    usedAliases.every((name) => {
      const a = aliases.find((x) => x.alias === name)
      return !!a && hasUsdPrice(costOf(instances.find((p) => p.id === a.provider), a.model))
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
      const body: Policy = { ...draft, rules: Object.fromEntries(Object.entries(draft.rules).filter(([, v]) => v)) }
      if (!usdAllowed) body.caps = { ...body.caps, per_task_usd: null, per_run_usd: null }
      const res = await providersApi.setPolicy(body)
      const next = res && typeof res === 'object' && 'mode' in res ? res : body
      setSaved(next)
      setDraft(next)
      setDone(true)
    } catch (err) {
      setError(settingsErrorMessage(err))
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

  if (!saved) return <p className="text-sm text-gray-500">Loading policy…</p>

  const capInput = (key: keyof Policy['caps'], label: string, usd: boolean) => {
    const locked = usd && !usdAllowed
    const id = `cap-${key}`
    return (
      <div key={key}>
        <label htmlFor={id} className={LABEL}>
          {label}
        </label>
        <input
          id={id}
          type="number"
          min={0}
          className={FIELD}
          value={locked ? '' : (draft.caps[key] ?? '')}
          readOnly={locked}
          aria-disabled={locked || undefined}
          aria-describedby={locked ? 'cap-usd-help' : undefined}
          onChange={(e) => !locked && setCap(key, e.target.value)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className={LABEL}>Policy mode</legend>
        <div className="flex flex-wrap gap-4">
          {MODES.map((m) => (
            <label key={m.value} className="inline-flex items-center gap-1.5 text-sm text-gray-200">
              <input type="radio" name="policy-mode" value={m.value} checked={draft.mode === m.value} onChange={() => update({ mode: m.value })} />
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>
      {draft.mode === 'shadow' && (
        <p role="status" className="rounded border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200">
          {POLICY_SHADOW_TEXT}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {POLICY_RULE_ROLES.map((role) => (
          <div key={role}>
            <label htmlFor={`rule-${role}`} className={LABEL}>
              {POLICY_ROLE_LABELS[role]}
            </label>
            <select
              id={`rule-${role}`}
              className={FIELD}
              value={draft.rules[role] ?? ''}
              onChange={(e) => update({ rules: { ...draft.rules, [role]: e.target.value } })}
            >
              <option value="">No rule</option>
              {aliasNames.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div>
        <p className={LABEL}>Fallback chain (tried in this order)</p>
        {draft.fallback.length === 0 && <p className="text-xs text-gray-500">No fallback.</p>}
        <ol className="space-y-1" aria-label="Fallback chain">
          {draft.fallback.map((alias, i) => (
            <li key={`${alias}-${i}`} className="flex items-center gap-2 text-sm text-gray-200">
              <span className="w-5 text-xs text-gray-500">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">
                {alias} <span className="text-xs text-gray-500">({modelOfAlias(alias)})</span>
              </span>
              <Button size="sm" variant="ghost" aria-label={`Move ${alias} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Move ${alias} down`} disabled={i === draft.fallback.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button size="sm" variant="ghost" aria-label={`Remove ${alias} from the chain`} onClick={() => update({ fallback: draft.fallback.filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
        <div className="mt-2 flex max-w-sm items-end gap-2">
          <div className="flex-1">
            <label htmlFor="fallback-add" className={LABEL}>
              Add to the chain
            </label>
            <select id="fallback-add" className={FIELD} value={pendingAlias} onChange={(e) => setPendingAlias(e.target.value)}>
              <option value="">Choose an alias…</option>
              {aliasNames.filter((a) => !draft.fallback.includes(a)).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!pendingAlias}
            onClick={() => {
              update({ fallback: [...draft.fallback, pendingAlias] })
              setPendingAlias('')
            }}
          >
            Add
          </Button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{POLICY_FALLBACK_RULES_TEXT}</p>
      </div>

      <div>
        <p className={LABEL}>Caps</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {capInput('per_task_usd', 'Per task (USD)', true)}
          {capInput('per_run_usd', 'Per run (USD)', true)}
          {capInput('per_task_tokens', 'Per task (tokens)', false)}
          {capInput('per_run_tokens', 'Per run (tokens)', false)}
        </div>
        <p id="cap-usd-help" className="mt-1 text-xs text-gray-500">
          {POLICY_USD_CAP_HELP}
          {!usdAllowed && ' Dollar caps are unavailable until every alias used above has a priced instance.'}
        </p>
      </div>

      {confirm && (
        <ConfirmPanel title="Enforce this policy?" confirmLabel="Enforce" onConfirm={doSave} onCancel={() => setConfirm(null)}>
          {confirm.length === 0 ? (
            <p>No role changes model.</p>
          ) : (
            <>
              <p>These roles will change model:</p>
              <ul className="mt-1 list-disc pl-4">
                {confirm.map((c) => (
                  <li key={c.role}>
                    {POLICY_ROLE_LABELS[c.role] ?? c.role}: {c.from} → {c.to}
                  </li>
                ))}
              </ul>
            </>
          )}
        </ConfirmPanel>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-xs text-emerald-300">
          Policy saved.
        </p>
      )}
      <Button size="sm" onClick={onSave} loading={busy}>
        Save policy
      </Button>
    </div>
  )
}

/** Model aliases and the routing policy (delivered `off`). */
export function ModelPolicy() {
  const { providers } = useProviders()
  return (
    <div className="space-y-6">
      <AliasTable instances={providers} />
      <PolicyForm instances={providers} />
    </div>
  )
}
