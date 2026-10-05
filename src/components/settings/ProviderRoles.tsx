import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useProviders, useRefreshProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import {
  RESOLUTION_ORDER_TEXT,
  ROLE_HELP,
  ROLE_LABELS,
  SINGLE_PROVIDER_ROLES_TEXT,
  settingsErrorMessage,
} from '@/constants/providerSettings'
import { providerConsentPath } from '@/constants/providerErrors'
import { routedByLabel } from '@/constants/providers'
import type { ProviderInstance, ProvidersResponse } from '@/types/provider'
import { PROVIDER_ROLES, type ProviderRole, type RoleAssignments, type RoleTarget } from '@/types/providerSettings'
import { FIELD, LABEL } from './ConfirmPanel'
import { useProjectOptions } from './useProjectOptions'

// A target is one <option>: `m|<provider>|<model>`, `a|<provider>|<alias>`, or `d|<provider>|` (the instance's default model).
const encode = (t: RoleTarget | undefined): string => {
  if (!t) return ''
  if (t.alias) return `a|${t.provider}|${t.alias}`
  if (t.model) return `m|${t.provider}|${t.model}`
  return `d|${t.provider}|`
}
const decode = (value: string): RoleTarget | undefined => {
  if (!value) return undefined
  const first = value.indexOf('|')
  const second = value.indexOf('|', first + 1)
  const kind = value.slice(0, first)
  const provider = value.slice(first + 1, second)
  const rest = value.slice(second + 1)
  if (kind === 'a') return { provider, alias: rest }
  if (kind === 'm') return { provider, model: rest }
  return { provider }
}

function describeTarget(t: RoleTarget | null | undefined, instances: readonly ProviderInstance[]): string {
  if (!t) return SINGLE_PROVIDER_ROLES_TEXT
  const label = instances.find((p) => p.id === t.provider)?.label ?? t.provider
  return `${label} / ${t.alias ?? t.model ?? 'default model'}`
}

interface ScopeProps {
  /** `null` = the global assignment. */
  slug: string | null
  projectName?: string
}

/** One scope (global or one project): a target per role, the effective default and a Save. */
function RoleScope({ slug, projectName }: ScopeProps) {
  const refreshChat = useRefreshProviders()
  const [list, setList] = useState<ProvidersResponse | null>(null)
  const [saved, setSaved] = useState<RoleAssignments | null>(null)
  const [draft, setDraft] = useState<RoleAssignments>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [roles, providers] = await Promise.allSettled([
      slug ? providersApi.projectRoles(slug) : providersApi.roles(),
      providersApi.list(slug ? { project_slug: slug } : {}),
    ])
    if (roles.status === 'fulfilled') {
      setSaved(roles.value ?? {})
      setDraft(roles.value ?? {})
      setError(null)
    } else {
      setError(settingsErrorMessage(roles.reason))
    }
    if (providers.status === 'fulfilled' && Array.isArray(providers.value?.providers)) setList(providers.value)
  }, [slug])

  useEffect(() => {
    setSaved(null)
    setList(null)
    setDone(false)
    void load()
  }, [load])

  const instances = list?.providers ?? []
  const aliases = list?.aliases ?? []
  const disallowed = (providerId: string) => slug !== null && instances.find((p) => p.id === providerId)?.allowed_for_project === false

  const save = async () => {
    setError(null)
    setDone(false)
    const blocked = PROVIDER_ROLES.find((r) => draft[r] && disallowed(draft[r]!.provider))
    if (blocked) {
      setError(`${ROLE_LABELS[blocked]}: this project has not agreed to send its content to that instance.`)
      return
    }
    setBusy(true)
    try {
      if (slug) await providersApi.setProjectRoles(slug, draft)
      else await providersApi.setRoles(draft)
      setDone(true)
      // The new default is what the selector of a new conversation preselects.
      await Promise.all([load(), refreshChat()])
    } catch (err) {
      setError(settingsErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const effective = list?.default
  const effectiveInstance = effective ? instances.find((p) => p.id === effective.provider) : undefined
  const anyDisallowed = slug !== null && instances.some((p) => p.allowed_for_project === false)

  if (saved === null && !error) return <p className="text-sm text-gray-500">Loading roles…</p>

  return (
    <div className="space-y-3" data-testid={slug ? `roles-${slug}` : 'roles-global'}>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROVIDER_ROLES.map((role: ProviderRole) => {
          const id = `role-${slug ?? 'global'}-${role}`
          return (
            <div key={role}>
              <label htmlFor={id} className={LABEL}>
                {ROLE_LABELS[role]}
              </label>
              <select
                id={id}
                className={FIELD}
                value={encode(draft[role])}
                aria-describedby={`${id}-help`}
                onChange={(e) => {
                  const target = decode(e.target.value)
                  setDraft((d) => {
                    const next = { ...d }
                    if (target) next[role] = target
                    else delete next[role]
                    return next
                  })
                  setDone(false)
                }}
              >
                <option value="">{slug ? 'Inherit the global role' : `Not set — ${SINGLE_PROVIDER_ROLES_TEXT}`}</option>
                {instances.map((p) => {
                  const blocked = disallowed(p.id)
                  const own = aliases.filter((a) => a.provider === p.id)
                  return (
                    <optgroup key={p.id} label={blocked ? `${p.label} (not allowed for this project)` : p.label}>
                      <option value={`d|${p.id}|`} disabled={blocked}>
                        {p.label}, default model
                      </option>
                      {p.models.map((m) => (
                        <option key={m.id} value={`m|${p.id}|${m.id}`} disabled={blocked}>
                          {p.label} / {m.label ?? m.id}
                        </option>
                      ))}
                      {own.map((a) => (
                        <option key={a.alias} value={`a|${p.id}|${a.alias}`} disabled={blocked}>
                          {p.label} / alias {a.alias}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
              <p id={`${id}-help`} className="mt-1 text-xs text-gray-500">
                {ROLE_HELP[role]} Now: {describeTarget(draft[role], instances)}
              </p>
            </div>
          )
        })}
      </div>

      {anyDisallowed && slug && (
        <p className="text-xs text-amber-300">
          Some instances are not allowed for this project and cannot be chosen.{' '}
          <Link to={providerConsentPath(slug)} className="underline">
            Review the project&apos;s consent
          </Link>
        </p>
      )}

      <p className="text-xs text-gray-400" data-testid="effective-default">
        Effective default{projectName ? ` for ${projectName}` : ''}:{' '}
        {effective ? (
          <>
            <strong className="text-gray-200">{effectiveInstance?.label ?? effective.provider}</strong>
            {` / ${effective.alias ?? effective.model ?? 'default model'}`} ({routedByLabel(effective.routed_by)})
          </>
        ) : (
          'none resolved'
        )}
      </p>

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-xs text-emerald-300">
          Saved.
        </p>
      )}
      <Button size="sm" onClick={save} loading={busy}>
        Save roles
      </Button>
    </div>
  )
}

/** Pilot and executor roles, globally and per project. */
export function ProviderRoles() {
  const { providers } = useProviders()
  const projects = useProjectOptions()
  const [params, setParams] = useSearchParams()
  const slug = params.get('project') ?? ''
  const project = projects?.find((p) => p.slug === slug)

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-400">
        Two roles, no master instance. The pilot answers conversations opened by a person; the executor runs the runner, delegations, protocols and one-shot calls.{' '}
        {RESOLUTION_ORDER_TEXT}
      </p>
      {providers.length <= 1 && (
        <p className="text-xs text-gray-500">Only Claude Code is configured: add an instance to assign it a role.</p>
      )}
      <section aria-label="Global roles" className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Global</h3>
        <RoleScope slug={null} />
      </section>
      <section aria-label="Project override" className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Override for one project</h3>
        <div className="max-w-sm">
          <label htmlFor="roles-project" className={LABEL}>
            Project
          </label>
          <select
            id="roles-project"
            className={FIELD}
            value={slug}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set('project', e.target.value)
              else next.delete('project')
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
        {slug ? <RoleScope slug={slug} projectName={project?.name ?? slug} /> : <p className="text-xs text-gray-500">An unset role inherits the global one.</p>}
      </section>
    </div>
  )
}
