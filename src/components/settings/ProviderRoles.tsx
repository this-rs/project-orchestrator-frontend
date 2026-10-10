import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, SearchableSelect } from '@/components/ui'
import { useRefreshProviders } from '@/hooks/useProviders'
import { providersApi } from '@/services/providers'
import { ROLE_LABEL_KEYS, routedByFr, wizardErrorMessage } from '@/constants/providerWizard'
import { useT } from '@/i18n'
import { providerConsentPath } from '@/constants/providerErrors'
import type { ModelAlias, ProviderInstance, ProvidersResponse } from '@/types/provider'
import {
  PROVIDER_ROLES,
  type ProviderRole,
  type RoleAssignments,
} from '@/types/providerSettings'
import { FieldNote, FIELD_LABEL } from './FormField'
import { CatalogStateNote, TargetVaultUnlock } from './ModelTargets'
import {
  decodeTarget as decode,
  describeTarget,
  encodeTarget as encode,
  useModelTargets,
  withCurrentTarget as withCurrent,
} from './useModelTargets'
import { ErrorLine, Loading, Panel, ProjectPicker, SaveStatus } from './SettingsPanel'
import { useProjectOptions } from './useProjectOptions'

const NO_INSTANCES: ProviderInstance[] = []
const NO_ALIASES: ModelAlias[] = []

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
  const { t } = useT()
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
      setLoadError(wizardErrorMessage(roles.reason, t))
    }
    if (providers.status === 'fulfilled' && Array.isArray(providers.value?.providers))
      setList(providers.value)
  }, [slug, t])

  useEffect(() => {
    setSaved(null)
    setList(null)
    setDone(false)
    setError(null)
    void load()
  }, [load])

  const instances = list?.providers ?? NO_INSTANCES
  const aliases = list?.aliases ?? NO_ALIASES
  const disallowed = useCallback(
    (providerId: string) =>
      !!slug && instances.find((p) => p.id === providerId)?.allowed_for_project === false,
    [slug, instances]
  )
  const anyDisallowed = !!slug && instances.some((p) => p.allowed_for_project === false)
  const dirty = saved !== null && !same(saved, draft)

  // Every instance, its default model, its models (the live Claude catalog for
  // Claude Code, the instance's own catalog otherwise) and its aliases, grouped
  // by provider, searchable by instance name too.
  const disallowedNote = useCallback(
    (providerId: string) => (disallowed(providerId) ? t('providerAdmin.models.notAllowedForProject') : undefined),
    [disallowed, t]
  )
  const targets = useModelTargets({ instances, aliases, withDefault: true, withAliases: true, disallowed: disallowedNote })
  const targetOptions = targets.options

  const save = async () => {
    setError(null)
    setDone(false)
    const blocked = PROVIDER_ROLES.find((r) => draft[r] && disallowed(draft[r]!.provider))
    if (blocked) {
      setError(t('providerAdmin.roles.blocked', { role: t(ROLE_LABEL_KEYS[blocked]) }))
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
      setError(wizardErrorMessage(err, t))
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
      title={t('providerAdmin.roles.title')}
      description={
        <>
          <strong className="font-medium text-gray-300">{t('providerAdmin.common.roles.pilot')}</strong>
          {t('providerAdmin.roles.pilotDescription')}{' '}
          <strong className="font-medium text-gray-300">{t('providerAdmin.common.roles.executor')}</strong>
          {t('providerAdmin.roles.executorDescription')}
        </>
      }
      aside={
        <ProjectPicker
          id="roles-project"
          label={t('providerAdmin.roles.for')}
          projects={projects}
          value={slug}
          onChange={choose}
          allLabel={t('providerAdmin.roles.allProjects')}
        />
      }
      status={<SaveStatus error={error} done={done} doneText={t('providerAdmin.roles.saved')} />}
      actions={
        saved === null && loadError ? (
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            {t('providerAdmin.ui.retry')}
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
      {saved === null && !loadError && <Loading>{t('providerAdmin.roles.loading')}</Loading>}
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
                    {t(ROLE_LABEL_KEYS[role])}
                  </label>
                  <SearchableSelect
                    id={id}
                    value={encode(current)}
                    options={withCurrent(t, targetOptions, current, instances)}
                    noneLabel={slug ? t('providerAdmin.roles.inherit') : t('providerAdmin.roles.unset')}
                    noun={{ one: t('providerAdmin.models.nounOne'), other: t('providerAdmin.models.nounOther') }}
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
                        ? t('providerAdmin.roles.isSet', { target: describeTarget(t, current, instances) })
                        : slug
                          ? t('providerAdmin.roles.inheritsGlobal')
                          : t('providerAdmin.roles.unsetHelp')
                    }
                  />
                </div>
              )
            })}
          </div>

          <CatalogStateNote state={targets.catalog} onRetry={targets.refresh} />
          <TargetVaultUnlock
            providers={PROVIDER_ROLES.flatMap((r) => (draft[r] ? [draft[r]!.provider] : []))}
            instances={instances}
            onUnlocked={() => {
              // The providers that depend on the vault answer now: re-read them and their catalogs.
              void Promise.all([load(), refreshChat()])
              targets.refresh()
            }}
          />

          {anyDisallowed && (
            <p className="text-xs text-amber-300">
              {t('providerAdmin.roles.someDisallowed')}{' '}
              <Link to={providerConsentPath(slug)} className="underline">
                {t('providerAdmin.roles.seeConsent')}
              </Link>
            </p>
          )}

          <p
            className="rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-gray-400"
            data-testid="effective-default"
          >
            {project ? t('providerAdmin.roles.usedNowFor', { project: project.name }) : t('providerAdmin.roles.usedNow')}{' '}
            {effective ? (
              <>
                <strong className="font-medium text-gray-200">
                  {describeTarget(t, effective, instances)}
                </strong>
                {t('providerAdmin.roles.chosenBy', { by: routedByFr(t, effective.routed_by) })}
              </>
            ) : (
              t('providerAdmin.roles.noUsable')
            )}
          </p>
        </>
      )}
    </Panel>
  )
}
