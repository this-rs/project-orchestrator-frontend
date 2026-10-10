/**
 * VaultPage — the user's secrets vault: create it, unlock it for a while,
 * store secrets, and decide which agents may use them.
 *
 * What this page never shows: a secret's value. Values only go up (typed
 * here or in a chat card); agents read them server-side inside their shell.
 *
 * The two ways to avoid being asked again and again:
 * - unlock for a period (the vault stays open, grants work without prompting);
 * - grant ahead of time: which secrets, to which conversation / project /
 *   everywhere, until when.
 */

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/i18n'
import { useProviders } from '@/hooks/useProviders'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, LockOpen, Trash2 } from 'lucide-react'
import { SecretRequestCard } from '@/components/chat/SecretRequestTray'
import { Button, ConceptIntro, PageContainer, PageHeader, Section, surface } from '@/components/ui'
import { glassFlat, iconButton } from '@/components/ui/classes'
import type { ConceptExplain } from '@/constants/nomenclature'
import {
  vaultApi,
  vaultErrorMessage,
  isVaultLockedError,
  hasUnlockProof,
  DURATION_CHOICES,
  GRANT_DURATION_CHOICES,
  type GrantScope,
  type SecretSelector,
  type VaultGrant,
  type VaultOverview,
} from '@/services/vault'

/**
 * Native fields, styled like `ui/Input` (16px on phones so iOS does not zoom, 36px tall). They stay
 * native on purpose: the value field is a masked multi-line textarea (-webkit-text-security) and
 * the grant selects are plain <select>s a screen reader and a test can drive directly.
 */
const input =
  'min-h-9 min-w-0 rounded-lg border border-border-default bg-surface-base px-3 py-2 text-base md:text-sm text-gray-100 placeholder-gray-500 input-focus-glow'
const select = `${input} text-gray-300`

/** The vault is a screen, not a concept of the registry: its three lines live here (DESIGN.md § 5). */
function useVaultExplain(): ConceptExplain {
  const { t } = useT()
  return {
    what: t('vault.explain.what'),
    why: t('vault.explain.why'),
    different: t('vault.explain.different'),
  }
}

function formatUntil(iso: string): string {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

type T = ReturnType<typeof useT>['t']

function describeScope(t: T, scope: GrantScope): string {
  switch (scope.kind) {
    case 'anywhere':
      return t('vault.grants.scopeAnywhere')
    case 'project':
      return t('vault.grants.describeProject', { value: scope.value })
    case 'session':
      return t('vault.grants.describeSession', { id: scope.value.slice(0, 8) })
    case 'provider':
      return t('vault.grants.describeProvider', { value: scope.value })
  }
}

function describeSecrets(t: T, s: SecretSelector): string {
  return s.kind === 'all' ? t('vault.grants.allSecrets') : s.names.join(', ')
}

/** "15 min", "4 h", "7 days": the service gives the minutes, the words come from the catalog. */
function durationLabel(t: T, minutes: number): string {
  if (minutes < 60) return t('vault.duration.minutes', { n: minutes })
  if (minutes < 1440) return t('vault.duration.hours', { n: minutes / 60 })
  const n = minutes / 1440
  return t(n === 1 ? 'vault.duration.dayOne' : 'vault.duration.dayMany', { n })
}

/** Stand-alone page (`/vault`, linked from chat cards): page chrome + panel. */
export function VaultPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const explain = useVaultExplain()
  return (
    <div className="h-dvh overflow-y-auto bg-[var(--bg-primary)]">
      <div className="px-4 md:px-6">
        <PageContainer width="narrow" className="space-y-6">
          <div className="space-y-1">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-3 text-gray-400">
              <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t('settingsPage.back')}
            </Button>
            <PageHeader title={t('vault.title')} description={t('vault.description')} />
            <ConceptIntro concept={explain} storageKey="vault" />
          </div>
          <VaultPanel />
        </PageContainer>
      </div>
    </div>
  )
}

/**
 * The whole vault UI without page chrome — embedded in "Sharing & privacy"
 * (where users look for it) and in the stand-alone `/vault` page.
 */
export function VaultPanel() {
  const { t: tr } = useT()
  const [overview, setOverview] = useState<VaultOverview | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setOverview(await vaultApi.overview())
      setLoadError(null)
    } catch (e) {
      setLoadError(vaultErrorMessage(e))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Re-read when the auto-lock deadline passes, so the page never shows a
  // vault as open after it locked itself.
  useEffect(() => {
    if (!overview?.unlocked_until) return
    const ms = new Date(overview.unlocked_until).getTime() - Date.now()
    const t = window.setTimeout(() => void refresh(), Math.max(ms, 0) + 500)
    return () => window.clearTimeout(t)
  }, [overview?.unlocked_until, refresh])

  const unlocked = !!overview?.unlocked_until
  // Changes need proof that THIS tab typed the passphrase (agents can forge a
  // login, not that); after a reload the vault may be open without it.
  const canChange = unlocked && hasUnlockProof()

  return (
    <div className="space-y-6">
          {loadError && (
            <p className="text-sm text-red-400" role="alert">
              {loadError}
            </p>
          )}
          {overview?.unavailable && (
            <p className="text-sm text-red-400" role="alert">
              {tr('vault.unavailable', { reason: overview.unavailable })}
            </p>
          )}

          {overview && !overview.unavailable && !overview.initialized && <CreateVault onDone={refresh} />}

          {overview?.initialized && (
            <>
              <LockPanel overview={overview} onChange={refresh} />
              <SecretsPanel overview={overview} unlocked={canChange} onChange={refresh} />
              <RequestsPanel overview={overview} onChange={refresh} />
              <GrantsPanel overview={overview} canChange={canChange} onChange={refresh} />
            </>
          )}
    </div>
  )
}

/** Exported for the provider wizard, which creates the vault in place. */
export function CreateVault({ onDone }: { onDone: () => void }) {
  const { t } = useT()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mismatch = confirm.length > 0 && pass !== confirm

  return (
    <Section
      title={t('vault.create.title')}
      description={t('vault.create.description')}
    >
      <form
        className={`${surface} space-y-3 p-4`}
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          try {
            await vaultApi.init(pass, 60)
            setPass('')
            setConfirm('')
            onDone()
          } catch (err) {
            setError(vaultErrorMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        <input
          type="password"
          autoComplete="new-password"
          className={`${input} w-full`}
          placeholder={t('vault.create.passphrase')}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          aria-label={t('vault.create.passphrase')}
        />
        <input
          type="password"
          autoComplete="new-password"
          className={`${input} w-full`}
          placeholder={t('vault.create.confirm')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-label={t('vault.create.confirm')}
        />
        {mismatch && <p className="text-xs text-red-400">{t('vault.create.mismatch')}</p>}
        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || pass.length < 12 || pass !== confirm}>
          {t('vault.create.submit')}
        </Button>
      </form>
    </Section>
  )
}

/** Exported for the provider wizard, which unlocks the vault in place (same flow, same proof). */
export function LockPanel({ overview, onChange }: { overview: VaultOverview; onChange: () => void }) {
  const { t } = useT()
  const [pass, setPass] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const until = overview.unlocked_until

  if (until && hasUnlockProof()) {
    return (
      <div className={`${surface} flex flex-wrap items-center gap-3 p-4`}>
        <LockOpen className="h-5 w-5 text-emerald-400" aria-hidden />
        <p className="flex-1 text-sm text-gray-300">
          {t('vault.lock.openUntil')} <strong>{formatUntil(until)}</strong> {t('vault.lock.openUntilTail')}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await vaultApi.lock()
            onChange()
          }}
        >
          <Lock className="mr-1.5 h-4 w-4" aria-hidden /> {t('vault.lock.lockNow')}
        </Button>
      </div>
    )
  }

  return (
    <form
      className={`${surface} flex flex-wrap items-center gap-3 p-4`}
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await vaultApi.unlock(pass, minutes)
          setPass('')
          onChange()
        } catch (err) {
          setError(vaultErrorMessage(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <Lock className="h-5 w-5 text-gray-500" aria-hidden />
      <span className="text-sm text-gray-300">
        {until ? t('vault.lock.changeNeedsPassphrase', { time: formatUntil(until) }) : t('vault.lock.locked')}
      </span>
      <input
        type="password"
        autoComplete="current-password"
        className={`${input} flex-1`}
        placeholder={t('vault.create.passphrase')}
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        aria-label={t('vault.lock.passphraseAria')}
      />
      <select className={select} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label={t('vault.lock.durationAria')}>
        {DURATION_CHOICES.map((d) => (
          <option key={d.minutes} value={d.minutes}>
            {t('vault.duration.for', { label: durationLabel(t, d.minutes) })}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={busy || !pass}>
        {until ? t('vault.lock.confirm') : t('vault.lock.unlock')}
      </Button>
      {error && (
        <p className="w-full text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}

/** Same rules as the backend (`validate_name`): 1-64 chars of [A-Za-z0-9_.-]. */
export const SECRET_NAME_RE = /^[A-Za-z0-9_.-]{1,64}$/

function secretError(t: T, e: unknown): string {
  return isVaultLockedError(e) ? t('vault.secrets.lockedError') : vaultErrorMessage(e)
}

function SecretsPanel({
  overview,
  unlocked,
  onChange,
}: {
  overview: VaultOverview
  unlocked: boolean
  onChange: () => void
}) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [reveal, setReveal] = useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const trimmed = name.trim()
  const nameInvalid = trimmed.length > 0 && !SECRET_NAME_RE.test(trimmed)
  const exists = overview.secrets.some((s) => s.name === trimmed)

  const save = async () => {
    setError(null)
    // The value leaves component state as soon as it is handed over, win or lose.
    const sent = value
    setValue('')
    setReveal(false)
    setConfirmOverwrite(false)
    try {
      await vaultApi.putSecret(trimmed, sent, description.trim() || undefined)
      setName('')
      setDescription('')
      onChange()
    } catch (err) {
      setError(secretError(t, err))
    }
  }

  return (
    <Section
      title={t('vault.secrets.title')}
      count={overview.secrets.length}
      description={
        unlocked ? t('vault.secrets.descriptionUnlocked') : t('vault.secrets.descriptionLocked')
      }
    >
      <div className={`${surface} divide-y divide-white/[0.06]`}>
        {overview.secrets.length === 0 && <p className="p-4 text-sm text-gray-500">{t('vault.secrets.none')}</p>}
        {overview.secrets.map((s) => (
          <div key={s.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <KeyRound className="h-4 w-4 text-gray-500" aria-hidden />
            <div className="min-w-0 flex-[1_1_10rem]">
              <code className="text-sm text-gray-200 break-all">{s.name}</code>
              {s.description && <p className="text-xs text-gray-500 break-words">{s.description}</p>}
            </div>
            <span className="text-[11px] leading-4 text-gray-500 tabular-nums">
              {t('vault.secrets.createdModified', { created: formatUntil(s.created_at), updated: formatUntil(s.updated_at) })}
            </span>
            {confirmDelete === s.name ? (
              <span className="flex items-center gap-1">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    try {
                      await vaultApi.deleteSecret(s.name)
                      setConfirmDelete(null)
                      onChange()
                    } catch (e) {
                      setConfirmDelete(null)
                      setError(secretError(t, e))
                    }
                  }}
                >
                  {t('vault.secrets.confirmDelete')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                  {t('vault.secrets.cancel')}
                </Button>
              </span>
            ) : (
              <button
                type="button"
                className={`${iconButton('ghost', 'size-9 md:size-8')} ${glassFlat} -mr-2`}
                onClick={() => setConfirmDelete(s.name)}
                aria-label={t('vault.secrets.deleteAria', { name: s.name })}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        ))}
        {unlocked && (
          <form
            className="space-y-2 p-4"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault()
              if (exists && !confirmOverwrite) {
                setConfirmOverwrite(true)
                return
              }
              void save()
            }}
          >
            <input
              className={`${input} w-full font-mono sm:w-72`}
              placeholder={t('vault.secrets.namePlaceholder')}
              value={name}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => {
                setName(e.target.value)
                setConfirmOverwrite(false)
              }}
              aria-label={t('vault.secrets.nameLabel')}
              aria-invalid={nameInvalid}
            />
            {nameInvalid && (
              <p className="text-xs text-red-400">
                {t('vault.secrets.nameInvalid')}
              </p>
            )}
            <textarea
              rows={6}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-masked={reveal ? 'false' : 'true'}
              className={`${input} w-full font-mono ${reveal ? '' : '[-webkit-text-security:disc]'}`}
              placeholder={t('vault.secrets.valuePlaceholder')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={t('vault.secrets.valueLabel')}
            />
            <Button type="button" variant="ghost" size="sm" flat className="-ml-3" onClick={() => setReveal((r) => !r)} aria-pressed={reveal}>
              {reveal ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              {reveal ? t('vault.secrets.hide') : t('vault.secrets.show')}
            </Button>
            <p className="text-xs text-gray-500">
              {t('vault.secrets.sshHint')}
            </p>
            <input
              className={`${input} w-full`}
              placeholder={t('vault.secrets.descPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label={t('vault.secrets.descLabel')}
            />
            {confirmOverwrite ? (
              <div className="flex flex-wrap items-center gap-2" role="alert">
                <span className="text-xs text-amber-300">
                  {t('vault.secrets.overwrite', { name: trimmed })}
                </span>
                <Button type="button" variant="danger" size="sm" onClick={() => void save()}>
                  {t('vault.secrets.replace')}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOverwrite(false)}>
                  {t('vault.secrets.cancel')}
                </Button>
              </div>
            ) : (
              <Button type="submit" size="sm" disabled={!trimmed || nameInvalid || value.length < 8}>
                {t('vault.secrets.save')}
              </Button>
            )}
          </form>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </Section>
  )
}

/** Secrets agents are waiting for (all conversations): same card as in the chat, so one answering path. */
function RequestsPanel({ overview, onChange }: { overview: VaultOverview; onChange: () => void }) {
  const { t } = useT()
  if (overview.requests.length === 0) return null
  return (
    <Section title={t('vault.requests.title')} count={overview.requests.length} description={t('vault.requests.description')}>
      <div className="space-y-2">
        {overview.requests.map((r) => (
          <SecretRequestCard
            key={r.id}
            request={{ id: r.id, name: r.name, reason: r.reason, exists: r.exists }}
            sessionId={r.session_id}
            projectSlug={r.project_slug ?? null}
            overview={overview}
            onDone={onChange}
          />
        ))}
      </div>
    </Section>
  )
}

function GrantsPanel({
  overview,
  canChange,
  onChange,
}: {
  overview: VaultOverview
  canChange: boolean
  onChange: () => void
}) {
  const { t } = useT()
  const [which, setWhich] = useState<string>('__all__')
  const [scopeKind, setScopeKind] = useState<'anywhere' | 'project' | 'provider'>('project')
  const [project, setProject] = useState('')
  const [instance, setInstance] = useState('')
  const { providers } = useProviders()
  const instances = providers.filter((p) => !p.builtin)
  const [minutes, setMinutes] = useState(1440)
  const [error, setError] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

  const create = async () => {
    setError(null)
    const secrets: SecretSelector = which === '__all__' ? { kind: 'all' } : { kind: 'names', names: [which] }
    const scope: GrantScope =
      scopeKind === 'anywhere'
        ? { kind: 'anywhere' }
        : scopeKind === 'provider'
          ? { kind: 'provider', value: instance.trim() }
          : { kind: 'project', value: project.trim() }
    try {
      await vaultApi.createGrant({ secrets, scope, minutes })
      onChange()
    } catch (e) {
      setError(vaultErrorMessage(e))
    }
  }

  return (
    <Section
      title={t('vault.grants.title')}
      count={overview.grants.length}
      description={t('vault.grants.description')}
    >
      <div className={`${surface} divide-y divide-white/[0.06]`}>
        {overview.grants.length === 0 && (
          <p className="p-4 text-sm text-gray-500">{t('vault.grants.none')}</p>
        )}
        {overview.grants.map((g: VaultGrant) => (
          <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-[1_1_12rem] text-gray-300 break-words">
              <span className="text-gray-100">{describeSecrets(t, g.secrets)}</span> → {describeScope(t, g.scope)}
              {g.note && <p className="text-xs text-gray-500 break-words">{g.note}</p>}
            </div>
            <span className="text-[11px] leading-4 text-gray-500 tabular-nums">{t('vault.grants.until', { time: formatUntil(g.expires_at) })}</span>
            {confirmRevoke === g.id ? (
              <span className="flex items-center gap-1">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    try {
                      await vaultApi.revokeGrant(g.id)
                      setConfirmRevoke(null)
                      onChange()
                    } catch (e) {
                      setConfirmRevoke(null)
                      setError(vaultErrorMessage(e))
                    }
                  }}
                >
                  {t('vault.grants.confirmRevoke')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRevoke(null)}>
                  {t('vault.grants.cancel')}
                </Button>
              </span>
            ) : (
              <Button variant="secondary" size="sm" flat onClick={() => setConfirmRevoke(g.id)}>
                {t('vault.grants.revoke')}
              </Button>
            )}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 p-4 text-sm text-gray-400">
          <span>{t('vault.grants.allow')}</span>
          <select className={select} value={which} onChange={(e) => setWhich(e.target.value)} aria-label={t('vault.grants.secretsAria')}>
            {scopeKind === 'provider' ? (
              <option value="">{t('vault.grants.chooseSecret')}</option>
            ) : (
              <option value="__all__">{t('vault.grants.allSecrets')}</option>
            )}
            {overview.secrets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <span>{t('vault.grants.to')}</span>
          <select
            className={select}
            value={scopeKind}
            onChange={(e) => {
              const kind = e.target.value as 'anywhere' | 'project' | 'provider'
              setScopeKind(kind)
              // A provider reads ONE named secret: "all secrets" cannot carry over to it.
              setWhich(kind === 'provider' ? '' : '__all__')
            }}
            aria-label={t('vault.grants.scopeAria')}
          >
            <option value="project">{t('vault.grants.scopeProject')}</option>
            <option value="anywhere">{t('vault.grants.scopeAnywhere')}</option>
            <option value="provider">{t('vault.grants.scopeProvider')}</option>
          </select>
          {scopeKind === 'provider' &&
            (instances.length > 0 ? (
              <select className={select} value={instance} onChange={(e) => setInstance(e.target.value)} aria-label={t('vault.grants.instanceAria')}>
                <option value="">{t('vault.grants.chooseInstance')}</option>
                {instances.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label || p.id}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={`${input} w-40 font-mono`}
                placeholder={t('vault.grants.instancePlaceholder')}
                value={instance}
                onChange={(e) => setInstance(e.target.value)}
                aria-label={t('vault.grants.instanceAria')}
              />
            ))}
          {scopeKind === 'project' && (
            <input
              className={`${input} w-40 font-mono`}
              placeholder={t('vault.grants.projectPlaceholder')}
              value={project}
              onChange={(e) => setProject(e.target.value)}
              aria-label={t('vault.grants.projectAria')}
            />
          )}
          <select className={select} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label={t('vault.grants.durationAria')}>
            {GRANT_DURATION_CHOICES.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                {t('vault.duration.for', { label: durationLabel(t, d.minutes) })}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={create} disabled={!canChange || (scopeKind === 'project' && !project.trim()) || (scopeKind === 'provider' && (!instance.trim() || !which))}>
            {t('vault.grants.grant')}
          </Button>
        </div>
      </div>
      {scopeKind === 'provider' && (
        <p className="mt-2 text-xs text-gray-500">
          {t('vault.grants.providerNote')}
          {(!instance.trim() || !which) && (
            <span data-testid="provider-grant-why" className="mt-1 block text-amber-300">
              {t(!instance.trim() && !which ? 'vault.grants.disabledBoth' : !instance.trim() ? 'vault.grants.disabledInstance' : 'vault.grants.disabledSecret')}
            </span>
          )}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </Section>
  )
}
