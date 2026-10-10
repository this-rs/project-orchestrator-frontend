import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Button, Switch, ToneText, focusRing, hitArea } from '@/components/ui'
import { VaultUnlock } from '@/components/chat/VaultUnlock'
import { VAULT_PATH } from '@/constants/providerErrors'
import { formatWhenFr } from '@/constants/providerWizard'
import { useT } from '@/i18n'
import {
  networkToolsApi,
  readNetworkToolsError,
  type NetworkToolsError,
} from '@/services/networkTools'
import { hasUnlockProof, vaultApi } from '@/services/vault'
import type {
  BrowserSetting,
  SearchEngine,
  SearchEngineKind,
  ToolOriginConsent,
} from '@/types/networkTools'
import { ConfirmPanel } from './ConfirmPanel'
import { FormField, NativeSelect } from './FormField'
import { Loading, Panel, ProjectPicker } from './SettingsPanel'
import { useProjectOptions } from './useProjectOptions'

type Where = 'origins' | 'engines' | 'browser'

/** Same as the provider wizard: a key grant lasts 30 days, then the vault asks again. */
const GRANT_MINUTES = 43200

/** `[a-z0-9-]`, 1 to 48 characters, starting with a letter or a digit (the server's rule). */
const ENGINE_ID = /^[a-z0-9][a-z0-9-]{0,47}$/
/** A vault secret NAME (never a value). */
const SECRET_NAME = /^[A-Za-z0-9_.-]{1,64}$/

const INPUT =
  'w-full min-h-9 rounded-lg border border-border-default bg-surface-base px-3 py-2 text-base text-gray-100 placeholder-gray-500 input-focus-glow focus:outline-none md:text-sm'

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname
  } catch {
    return false
  }
}

/** `vault:<name>` → `<name>`; `none` (or anything else) → null. */
function secretNameOf(ref: string): string | null {
  return ref.startsWith('vault:') && ref.length > 'vault:'.length ? ref.slice('vault:'.length) : null
}

/** A failure of a network-tools call, by its stable code: never the server's sentence (it may quote the input). */
function NetworkToolsErrorCard({ error }: { error: NetworkToolsError }) {
  const { t } = useT()
  const message =
    error.code === 'request_failed'
      ? error.status
        ? t('networkTools.errors.request_failed_status', { status: error.status })
        : t('networkTools.errors.request_failed')
      : t(`networkTools.errors.${error.code}`)
  return (
    <div
      role="alert"
      data-testid="network-tools-error"
      data-error-code={error.code}
      className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {error.code === 'forbidden' ? t('networkTools.errorCard.forbiddenTitle') : t('networkTools.errorCard.title')}
        </p>
        <p className="mt-0.5 break-words text-amber-100/80">{message}</p>
        {error.code === 'vault_locked' && (
          <Link to={VAULT_PATH} className={`mt-1 inline-flex min-h-6 items-center rounded text-indigo-300 underline hover:text-indigo-200 ${focusRing}`}>
            {t('networkTools.errorCard.openVault')}
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * Network tools of native agent sessions, per project: the origins WebFetch may
 * reach, the search engines (global) with their key grant and origin consent,
 * and whether the browser is allowed.
 */
export function NetworkTools() {
  const tr = useT()
  const { t } = tr
  const projects = useProjectOptions()
  const [params, setParams] = useSearchParams()
  const slug = params.get('project') ?? ''
  const projectName = projects?.find((p) => p.slug === slug)?.name ?? slug

  const [origins, setOrigins] = useState<ToolOriginConsent[] | null>(null)
  const [browser, setBrowser] = useState<BrowserSetting | null>(null)
  const [engines, setEngines] = useState<SearchEngine[] | null>(null)
  const [loadError, setLoadError] = useState<NetworkToolsError | null>(null)
  const [error, setError] = useState<NetworkToolsError | null>(null)
  const [notice, setNotice] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  /** The panel whose action produced the current notice or error: they show there. */
  const [where, setWhere] = useState<Where>('origins')

  const [revoking, setRevoking] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [granting, setGranting] = useState<string | null>(null)
  const [, setUnlockTick] = useState(0)

  const ids = {
    origin: useId(),
    engineId: useId(),
    engineKind: useId(),
    secret: useId(),
    baseUrl: useId(),
    browserNote: useId(),
  }

  useEffect(() => {
    let live = true
    const load = slug
      ? networkToolsApi.overview(slug).then((o) => {
          if (!live) return
          setOrigins(o.origins)
          setBrowser(o.browser)
          setEngines(o.search_engines)
        })
      : networkToolsApi.searchEngines().then((list) => {
          if (!live) return
          setOrigins(null)
          setBrowser(null)
          setEngines(list)
        })
    load
      .then(() => live && setLoadError(null))
      .catch((err) => {
        if (!live) return
        setLoadError(readNetworkToolsError(err))
      })
    return () => {
      live = false
    }
  }, [slug, reloadTick])

  /** Run one mutation: its failure goes to the error card, its success to the status line. */
  const act = async (at: Where, key: string, fn: () => Promise<string>): Promise<boolean> => {
    setWhere(at)
    setBusy(key)
    setError(null)
    setNotice('')
    let ok = false
    try {
      setNotice(await fn())
      ok = true
    } catch (err) {
      setError(readNetworkToolsError(err))
    }
    setBusy(null)
    setRevoking(null)
    setDeleting(null)
    setGranting(null)
    setReloadTick((n) => n + 1)
    return ok
  }

  const choose = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('project', value)
    else next.delete('project')
    setOrigins(null)
    setBrowser(null)
    setRevoking(null)
    setError(null)
    setNotice('')
    setParams(next, { replace: true })
  }

  // ---- Origins ---------------------------------------------------------------

  const [originInput, setOriginInput] = useState('')
  const [originError, setOriginError] = useState<string | null>(null)

  const addOrigin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const value = originInput.trim()
    if (!isHttpUrl(value)) {
      setOriginError(t('networkTools.origins.inputInvalid'))
      return
    }
    setOriginError(null)
    const ok = await act('origins', 'origin-add', async () => {
      const saved = await networkToolsApi.allowOrigin(slug, value)
      return t('networkTools.origins.added', { origin: saved.origin })
    })
    if (ok) setOriginInput('')
  }

  // ---- Search engines --------------------------------------------------------

  const [engineId, setEngineId] = useState('')
  const [engineKind, setEngineKind] = useState<SearchEngineKind>('brave')
  const [secretName, setSecretName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [formErrors, setFormErrors] = useState<{ id?: string; secret?: string; baseUrl?: string }>({})

  const addEngine = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const id = engineId.trim()
    const name = secretName.trim()
    const url = baseUrl.trim()
    const errors: typeof formErrors = {}
    if (!ENGINE_ID.test(id)) errors.id = t('networkTools.engines.idInvalid')
    if (engineKind === 'brave' && !SECRET_NAME.test(name)) errors.secret = t('networkTools.engines.secretInvalid')
    if (engineKind === 'searxng' && !isHttpUrl(url)) errors.baseUrl = t('networkTools.engines.baseUrlInvalid')
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return
    const ok = await act('engines', 'engine-add', async () => {
      const saved = await networkToolsApi.createSearchEngine(
        engineKind === 'brave'
          ? { id, engine: 'brave', credential_ref: `vault:${name}` }
          : { id, engine: 'searxng', base_url: url, credential_ref: 'none' },
      )
      return t('networkTools.engines.added', { id: saved.id })
    })
    if (ok) {
      setEngineId('')
      setSecretName('')
      setBaseUrl('')
    }
  }

  const grantKey = async (engine: SearchEngine, name: string) => {
    // The grant carries this tab's unlock proof: without one, the vault is locked for this tab.
    if (!hasUnlockProof()) {
      setWhere('engines')
      setNotice('')
      setError({ code: 'vault_locked' })
      return
    }
    await act('engines', `grant-${engine.id}`, async () => {
      await vaultApi.createGrant({
        secrets: { kind: 'names', names: [name] },
        scope: { kind: 'provider', value: engine.grant_id },
        minutes: GRANT_MINUTES,
        note: t('networkTools.engines.grantNote', { id: engine.id }),
      })
      return t('networkTools.engines.granted', { id: engine.id })
    })
  }

  // ---- Render ----------------------------------------------------------------

  /** Status line (always mounted, so screen readers hear it change) and error card of one panel. */
  const feedback = (at: Where) => {
    const shown = where === at ? error : null
    const failedLoad = at === (slug ? 'origins' : 'engines') ? loadError : null
    return (
      <>
        <p role="status" aria-live="polite" data-testid={`network-tools-status-${at}`} className="text-xs text-emerald-300 empty:hidden">
          {where === at ? notice : ''}
        </p>
        {(shown ?? failedLoad) && <NetworkToolsErrorCard error={(shown ?? failedLoad)!} />}
      </>
    )
  }

  let originsBody
  if (!slug) {
    originsBody = <p className="text-sm text-gray-400">{t('networkTools.chooseProject')}</p>
  } else if (!origins && !loadError) {
    originsBody = <Loading>{t('networkTools.loading')}</Loading>
  } else if (origins) {
    originsBody = (
      <>
        {origins.length === 0 ? (
          <p className="text-sm text-gray-400">{t('networkTools.origins.empty')}</p>
        ) : (
          <ul className="-mx-4 divide-y divide-white/[0.05]" aria-label={t('networkTools.origins.listAria', { project: projectName })}>
            {origins.map((o) => (
              <li key={o.origin} data-testid={`tool-origin-${o.origin}`} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm text-gray-100">{o.origin}</p>
                    <p className="text-xs text-gray-500">
                      {t('networkTools.origins.allowedBy', { by: o.consented_by, when: formatWhenFr(tr, o.consented_at) })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setRevoking(o.origin)}
                    aria-label={t('networkTools.origins.revokeAria', { origin: o.origin })}
                  >
                    {t('networkTools.origins.revoke')}
                  </Button>
                </div>
                {revoking === o.origin && (
                  <ConfirmPanel
                    title={t('networkTools.origins.revokeTitle', { origin: o.origin, project: projectName })}
                    confirmLabel={t('networkTools.origins.revokeConfirm')}
                    tone="danger"
                    onConfirm={() =>
                      act('origins', `revoke-${o.origin}`, async () => {
                        await networkToolsApi.revokeOrigin(slug, o.origin)
                        return t('networkTools.origins.revoked', { origin: o.origin })
                      }).then(() => undefined)
                    }
                    onCancel={() => setRevoking(null)}
                  >
                    {t('networkTools.origins.revokeBody')}
                  </ConfirmPanel>
                )}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={addOrigin} noValidate className="flex flex-wrap items-start gap-3">
          <FormField
            id={ids.origin}
            className="flex-[1_1_16rem]"
            label={t('networkTools.origins.inputLabel')}
            help={t('networkTools.origins.inputHelp')}
            error={originError}
          >
            <input
              id={ids.origin}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={originInput}
              onChange={(e) => setOriginInput(e.target.value)}
              placeholder="https://docs.rs"
              aria-invalid={originError ? true : undefined}
              aria-describedby={originError ? `${ids.origin}-error` : `${ids.origin}-help`}
              className={INPUT}
            />
          </FormField>
          <Button type="submit" size="sm" variant="primary" className="sm:mt-6" loading={busy === 'origin-add'}>
            {t('networkTools.origins.add')}
          </Button>
        </form>
      </>
    )
  }

  let enginesBody
  if (!engines && !loadError) {
    enginesBody = <Loading>{t('networkTools.loading')}</Loading>
  } else {
    enginesBody = (
      <>
        {engines && engines.length === 0 && <p className="text-sm text-gray-400">{t('networkTools.engines.empty')}</p>}
        {engines && engines.length > 0 && (
          <ul className="-mx-4 divide-y divide-white/[0.05]" aria-label={t('networkTools.engines.listAria')}>
            {engines.map((engine) => {
              const name = secretNameOf(engine.credential_ref)
              return (
                <li
                  key={engine.id}
                  data-testid={`search-engine-${engine.id}`}
                  data-key-granted={engine.key_granted}
                  data-origin-consented={engine.origin_consented ?? undefined}
                  className="px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-[1_1_16rem] space-y-1">
                      <p className="text-sm font-medium text-gray-100">
                        {engine.id}{' '}
                        <span className="font-normal text-gray-500">· {t(`networkTools.engines.kind.${engine.engine}`)}</span>
                      </p>
                      <p className="break-all font-mono text-xs text-gray-400">
                        {engine.origin ?? t('networkTools.engines.noOrigin')}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {name ? (
                          <ToneText
                            tone={engine.key_granted ? 'success' : 'warning'}
                            label={t(engine.key_granted ? 'networkTools.engines.keyGranted' : 'networkTools.engines.keyNotGranted', { name })}
                          />
                        ) : (
                          <ToneText tone="muted" label={t('networkTools.engines.noKey')} />
                        )}
                        {slug && engine.origin_consented !== undefined && (
                          <ToneText
                            tone={engine.origin_consented ? 'success' : 'muted'}
                            label={t(engine.origin_consented ? 'networkTools.engines.originConsented' : 'networkTools.engines.originNotConsented', { project: projectName })}
                          />
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {name && !engine.key_granted && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setGranting(engine.id)}
                          aria-label={t('networkTools.engines.grantAria', { id: engine.id })}
                        >
                          {t('networkTools.engines.grant')}
                        </Button>
                      )}
                      {slug && engine.origin && engine.origin_consented === false && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy === `consent-${engine.id}`}
                          aria-label={t('networkTools.engines.consentAria', { id: engine.id, project: projectName })}
                          onClick={() =>
                            void act('engines', `consent-${engine.id}`, async () => {
                              const saved = await networkToolsApi.allowOrigin(slug, engine.origin!)
                              return t('networkTools.origins.added', { origin: saved.origin })
                            })
                          }
                        >
                          {t('networkTools.engines.consent')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setDeleting(engine.id)}
                        aria-label={t('networkTools.engines.deleteAria', { id: engine.id })}
                      >
                        {t('networkTools.engines.delete')}
                      </Button>
                    </div>
                  </div>
                  {granting === engine.id && name && (
                    <ConfirmPanel
                      title={t('networkTools.engines.grantTitle', { name, id: engine.id })}
                      confirmLabel={t('networkTools.engines.grantConfirm')}
                      onConfirm={() => grantKey(engine, name)}
                      onCancel={() => setGranting(null)}
                    >
                      <p>{t('networkTools.engines.grantBody', { name, scope: engine.grant_id })}</p>
                      {!hasUnlockProof() && (
                        <div className="mt-2">
                          <VaultUnlock onUnlocked={() => setUnlockTick((n) => n + 1)} />
                        </div>
                      )}
                      <p className="mt-2">
                        <Link to={VAULT_PATH} className={`inline-flex min-h-6 items-center rounded text-indigo-300 underline hover:text-indigo-200 ${focusRing}`}>
                          {t('networkTools.engines.grantInVault')}
                        </Link>
                      </p>
                    </ConfirmPanel>
                  )}
                  {deleting === engine.id && (
                    <ConfirmPanel
                      title={t('networkTools.engines.deleteTitle', { id: engine.id })}
                      confirmLabel={t('networkTools.engines.deleteConfirm')}
                      tone="danger"
                      onConfirm={() =>
                        act('engines', `delete-${engine.id}`, async () => {
                          await networkToolsApi.deleteSearchEngine(engine.id)
                          return t('networkTools.engines.deleted', { id: engine.id })
                        }).then(() => undefined)
                      }
                      onCancel={() => setDeleting(null)}
                    >
                      {t('networkTools.engines.deleteBody')}
                    </ConfirmPanel>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <form onSubmit={addEngine} noValidate aria-label={t('networkTools.engines.formAria')} className="space-y-3 border-t border-white/[0.06] pt-4">
          <p className="text-sm font-medium text-gray-200">{t('networkTools.engines.addTitle')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id={ids.engineId} label={t('networkTools.engines.idLabel')} help={t('networkTools.engines.idHelp')} error={formErrors.id}>
              <input
                id={ids.engineId}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={engineId}
                onChange={(e) => setEngineId(e.target.value)}
                placeholder="brave"
                aria-invalid={formErrors.id ? true : undefined}
                aria-describedby={formErrors.id ? `${ids.engineId}-error` : `${ids.engineId}-help`}
                className={INPUT}
              />
            </FormField>
            <FormField id={ids.engineKind} label={t('networkTools.engines.kindLabel')}>
              <NativeSelect id={ids.engineKind} value={engineKind} onChange={(e) => setEngineKind(e.target.value as SearchEngineKind)}>
                <option value="brave">{t('networkTools.engines.kind.brave')}</option>
                <option value="searxng">{t('networkTools.engines.kind.searxng')}</option>
              </NativeSelect>
            </FormField>
            {engineKind === 'brave' ? (
              <FormField
                id={ids.secret}
                className="sm:col-span-2"
                label={t('networkTools.engines.secretLabel')}
                help={t('networkTools.engines.secretHelp')}
                error={formErrors.secret}
              >
                <div className="flex items-stretch">
                  <span aria-hidden="true" className="inline-flex items-center rounded-l-lg border border-r-0 border-border-default bg-white/[0.03] px-2 font-mono text-xs text-gray-400">
                    vault:
                  </span>
                  <input
                    id={ids.secret}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={64}
                    value={secretName}
                    onChange={(e) => setSecretName(e.target.value)}
                    placeholder="brave-key"
                    aria-invalid={formErrors.secret ? true : undefined}
                    aria-describedby={formErrors.secret ? `${ids.secret}-error` : `${ids.secret}-help`}
                    className={`${INPUT} rounded-l-none font-mono`}
                  />
                </div>
              </FormField>
            ) : (
              <FormField
                id={ids.baseUrl}
                className="sm:col-span-2"
                label={t('networkTools.engines.baseUrlLabel')}
                help={t('networkTools.engines.baseUrlHelp')}
                error={formErrors.baseUrl}
              >
                <input
                  id={ids.baseUrl}
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://search.example.org"
                  aria-invalid={formErrors.baseUrl ? true : undefined}
                  aria-describedby={formErrors.baseUrl ? `${ids.baseUrl}-error` : `${ids.baseUrl}-help`}
                  className={INPUT}
                />
              </FormField>
            )}
          </div>
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="primary" loading={busy === 'engine-add'}>
              {t('networkTools.engines.add')}
            </Button>
          </div>
        </form>
      </>
    )
  }

  let browserBody
  if (!slug) {
    browserBody = <p className="text-sm text-gray-400">{t('networkTools.chooseProject')}</p>
  } else if (!browser && !loadError) {
    browserBody = <Loading>{t('networkTools.loading')}</Loading>
  } else if (browser) {
    browserBody = (
      <div className="space-y-2">
        <Switch
          label={t('networkTools.browser.label', { project: projectName })}
          checked={browser.allowed}
          disabled={busy === 'browser'}
          ariaDescribedBy={ids.browserNote}
          controlClassName={hitArea}
          onChange={(allowed) =>
            void act('browser', 'browser', async () => {
              const saved = await networkToolsApi.setBrowser(slug, allowed)
              return t(saved.allowed ? 'networkTools.browser.nowAllowed' : 'networkTools.browser.nowDenied')
            })
          }
        />
        {browser.allowed && browser.authorized_by && (
          <p className="text-xs text-gray-500">
            {t('networkTools.browser.allowedBy', { by: browser.authorized_by, when: formatWhenFr(tr, browser.authorized_at) })}
          </p>
        )}
        <p id={ids.browserNote} className="text-xs text-gray-500">
          {t('networkTools.browser.note')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="network-tools">
      <Panel
        testId="network-origins-panel"
        aside={<ProjectPicker id="network-tools-project" projects={projects} value={slug} onChange={choose} />}
        title={slug ? t('networkTools.origins.titleFor', { project: projectName }) : t('networkTools.origins.title')}
        description={t('networkTools.origins.description')}
      >
        {feedback('origins')}
        {originsBody}
      </Panel>
      <Panel
        testId="network-engines-panel"
        title={t('networkTools.engines.title')}
        description={t('networkTools.engines.description')}
      >
        {feedback('engines')}
        {enginesBody}
      </Panel>
      <Panel
        testId="network-browser-panel"
        title={t('networkTools.browser.title')}
        description={t('networkTools.browser.description')}
      >
        {feedback('browser')}
        {browserBody}
      </Panel>
    </div>
  )
}
