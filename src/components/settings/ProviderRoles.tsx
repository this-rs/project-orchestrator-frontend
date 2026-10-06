import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, SearchableSelect, type SearchableOption } from '@/components/ui'
import { useRefreshProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { ROLE_LABELS_FR, routedByFr, wizardErrorMessage } from '@/constants/providerWizard'
import { providerConsentPath } from '@/constants/providerErrors'
import type { ProviderInstance, ProvidersResponse } from '@/types/provider'
import {
  PROVIDER_ROLES,
  type ProviderRole,
  type RoleAssignments,
  type RoleTarget,
} from '@/types/providerSettings'
import { FieldNote, FIELD_LABEL } from './FormField'
import { ErrorLine, Loading, Panel, ProjectPicker, SaveStatus } from './SettingsPanel'
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

function describeTarget(
  t: { provider: string; model?: string | null; alias?: string | null },
  instances: readonly ProviderInstance[]
): string {
  const label = instances.find((p) => p.id === t.provider)?.label ?? t.provider
  return `${label} · ${t.alias ? `alias ${t.alias}` : (t.model ?? 'modèle par défaut')}`
}

/** The current target stays visible when the catalog no longer lists it. */
const withCurrent = (options: SearchableOption[], current: RoleTarget | undefined, instances: readonly ProviderInstance[]) => {
  const value = encode(current)
  return !current || options.some((o) => o.value === value)
    ? options
    : [{ value, label: describeTarget(current, instances) }, ...options]
}

const same = (a: RoleAssignments | null, b: RoleAssignments) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b)

/**
 * Pilot and executor roles: which instance and model each one uses, for every
 * project (global) or for one project. A role left empty inherits — a project
 * role from the global role, the global role from the server default.
 */
export function ProviderRoles({
  collapsible,
  defaultOpen,
}: { collapsible?: boolean; defaultOpen?: boolean } = {}) {
  const refreshChat = useRefreshProviders()
  const projects = useProjectOptions()
  const [params, setParams] = useSearchParams()
  const slug = params.get('project') ?? ''
  const project = projects?.find((p) => p.slug === slug)

  const [list, setList] = useState<ProvidersResponse | null>(null)
  const [saved, setSaved] = useState<RoleAssignments | null>(null)
  const [draft, setDraft] = useState<RoleAssignments>({})
  const [loadError, setLoadError] = useState<string | null>(null)
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
      setLoadError(null)
    } else {
      setLoadError(wizardErrorMessage(roles.reason))
    }
    if (providers.status === 'fulfilled' && Array.isArray(providers.value?.providers))
      setList(providers.value)
  }, [slug])

  useEffect(() => {
    setSaved(null)
    setList(null)
    setDone(false)
    setError(null)
    void load()
  }, [load])

  const instances = list?.providers ?? []
  const aliases = list?.aliases ?? []
  const disallowed = (providerId: string) =>
    !!slug && instances.find((p) => p.id === providerId)?.allowed_for_project === false
  const anyDisallowed = !!slug && instances.some((p) => p.allowed_for_project === false)
  const dirty = saved !== null && !same(saved, draft)

  /** Every instance, its default model, its models and its aliases, searchable by instance name too. */
  const targetOptions: SearchableOption[] = instances.flatMap((p) => {
    const blocked = disallowed(p.id)
    const note = blocked ? 'non autorisé pour ce projet' : undefined
    const own = aliases.filter((a) => a.provider === p.id)
    return [
      { value: `d|${p.id}|`, label: `${p.label} · modèle par défaut`, description: note, disabled: blocked },
      ...p.models.map((m) => ({
        value: `m|${p.id}|${m.id}`,
        label: `${p.label} · ${m.label ?? m.id}`,
        description: note,
        keywords: [m.id],
        disabled: blocked,
      })),
      ...own.map((a) => ({
        value: `a|${p.id}|${a.alias}`,
        label: `${p.label} · alias ${a.alias}`,
        description: note,
        disabled: blocked,
      })),
    ]
  })

  const save = async () => {
    setError(null)
    setDone(false)
    const blocked = PROVIDER_ROLES.find((r) => draft[r] && disallowed(draft[r]!.provider))
    if (blocked) {
      setError(
        `${ROLE_LABELS_FR[blocked]} : ce projet n’a pas autorisé l’envoi de son contenu à ce provider.`
      )
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
      setError(wizardErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const choose = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('project', value)
    else next.delete('project')
    setParams(next, { replace: true })
  }

  const effective = list?.default
  const scopeId = slug || 'global'

  return (
    <Panel
      testId={`roles-${scopeId}`}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      title="Rôles"
      description={
        <>
          <strong className="font-medium text-gray-300">Pilote</strong> : le modèle qui décide et
          planifie (conversations ouvertes par une personne).{' '}
          <strong className="font-medium text-gray-300">Exécutant</strong> : celui qui exécute les
          tâches. Un rôle vide hérite du rôle global, puis du provider par défaut du serveur.
        </>
      }
      aside={
        <ProjectPicker
          id="roles-project"
          label="Pour"
          projects={projects}
          value={slug}
          onChange={choose}
          allLabel="Tous les projets (rôles globaux)"
        />
      }
      status={<SaveStatus error={error} done={done} doneText="Rôles enregistrés." />}
      actions={
        saved === null && loadError ? (
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Réessayer
          </Button>
        ) : (
          saved !== null && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDraft(saved)}
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
      {saved === null && !loadError && <Loading>Chargement des rôles…</Loading>}
      {loadError && <ErrorLine>{loadError}</ErrorLine>}
      {saved !== null && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {PROVIDER_ROLES.map((role: ProviderRole) => {
              const id = `role-${scopeId}-${role}`
              const current = draft[role]
              return (
                <div key={role} className="min-w-0">
                  <label htmlFor={id} className={FIELD_LABEL}>
                    {ROLE_LABELS_FR[role]}
                  </label>
                  <SearchableSelect
                    id={id}
                    value={encode(current)}
                    options={withCurrent(targetOptions, current, instances)}
                    noneLabel={
                      slug ? 'Hériter du rôle global' : 'Non réglé : provider par défaut du serveur'
                    }
                    noun={{ one: 'modèle', other: 'modèles' }}
                    aria-describedby={`${id}-help`}
                    onChange={(v) => {
                      const target = decode(v)
                      setDraft((d) => {
                        const next = { ...d }
                        if (target) next[role] = target
                        else delete next[role]
                        return next
                      })
                      setDone(false)
                    }}
                  />
                  <FieldNote
                    id={id}
                    help={
                      current
                        ? `Réglé : ${describeTarget(current, instances)}.`
                        : slug
                          ? 'Hérite du rôle global.'
                          : 'Non réglé : le provider par défaut du serveur.'
                    }
                  />
                </div>
              )
            })}
          </div>

          {anyDisallowed && (
            <p className="text-xs text-amber-300">
              Certains providers ne sont pas autorisés pour ce projet et ne peuvent pas être
              choisis.{' '}
              <Link to={providerConsentPath(slug)} className="underline">
                Voir les autorisations du projet
              </Link>
            </p>
          )}

          <p
            className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-gray-400"
            data-testid="effective-default"
          >
            Utilisé maintenant{project ? ` pour ${project.name}` : ''} :{' '}
            {effective ? (
              <>
                <strong className="font-medium text-gray-200">
                  {describeTarget(effective, instances)}
                </strong>
                , choisi par {routedByFr(effective.routed_by)}.
              </>
            ) : (
              'aucun provider utilisable.'
            )}
          </p>
        </>
      )}
    </Panel>
  )
}
