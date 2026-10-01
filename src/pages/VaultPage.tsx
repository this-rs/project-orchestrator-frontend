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
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, LockOpen, Trash2 } from 'lucide-react'
import { Button, PageContainer, PageHeader, Section, surface } from '@/components/ui'
import {
  vaultApi,
  vaultErrorMessage,
  hasUnlockProof,
  DURATION_CHOICES,
  GRANT_DURATION_CHOICES,
  type GrantScope,
  type SecretSelector,
  type VaultGrant,
  type VaultOverview,
} from '@/services/vault'

const input =
  'min-w-0 rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 placeholder:text-gray-600'
const select = 'rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-gray-300'

function formatUntil(iso: string): string {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function describeScope(scope: GrantScope): string {
  switch (scope.kind) {
    case 'anywhere':
      return 'every agent'
    case 'project':
      return `project ${scope.value}`
    case 'session':
      return `conversation ${scope.value.slice(0, 8)}`
  }
}

function describeSecrets(s: SecretSelector): string {
  return s.kind === 'all' ? 'all secrets' : s.names.join(', ')
}

export function VaultPage() {
  const navigate = useNavigate()
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
    <div className="h-dvh overflow-y-auto bg-[var(--bg-primary)]">
      <div className="px-4 md:px-6">
        <PageContainer width="narrow" className="space-y-6">
          <div className="space-y-1">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-3 text-gray-400">
              <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Back
            </Button>
            <PageHeader
              title="Vault"
              description="Secrets agents can use without ever seeing them. Values are encrypted with your passphrase and are never displayed again."
            />
          </div>

          {loadError && (
            <p className="text-sm text-red-400" role="alert">
              {loadError}
            </p>
          )}
          {overview?.unavailable && (
            <p className="text-sm text-red-400" role="alert">
              The vault file cannot be read: {overview.unavailable}. Nothing can be stored or read until it is repaired.
            </p>
          )}

          {overview && !overview.unavailable && !overview.initialized && <CreateVault onDone={refresh} />}

          {overview?.initialized && (
            <>
              <LockPanel overview={overview} onChange={refresh} />
              <SecretsPanel overview={overview} unlocked={canChange} onChange={refresh} />
              <GrantsPanel overview={overview} canChange={canChange} onChange={refresh} />
            </>
          )}
        </PageContainer>
      </div>
    </div>
  )
}

function CreateVault({ onDone }: { onDone: () => void }) {
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mismatch = confirm.length > 0 && pass !== confirm

  return (
    <Section
      title="Create the vault"
      description="Choose a passphrase of at least 12 characters. It is never stored: if you lose it, the secrets cannot be recovered."
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
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          aria-label="Passphrase"
        />
        <input
          type="password"
          autoComplete="new-password"
          className={`${input} w-full`}
          placeholder="Confirm passphrase"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-label="Confirm passphrase"
        />
        {mismatch && <p className="text-xs text-red-400">The two passphrases differ.</p>}
        {error && (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || pass.length < 12 || pass !== confirm}>
          Create vault
        </Button>
      </form>
    </Section>
  )
}

function LockPanel({ overview, onChange }: { overview: VaultOverview; onChange: () => void }) {
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
          Open until <strong>{formatUntil(until)}</strong> — granted agents can use their secrets without asking you.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            await vaultApi.lock()
            onChange()
          }}
        >
          <Lock className="mr-1.5 h-4 w-4" aria-hidden /> Lock now
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
        {until ? `Open until ${formatUntil(until)} — enter the passphrase to make changes` : 'Locked'}
      </span>
      <input
        type="password"
        autoComplete="current-password"
        className={`${input} flex-1`}
        placeholder="Passphrase"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        aria-label="Vault passphrase"
      />
      <select className={select} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Unlock duration">
        {DURATION_CHOICES.map((d) => (
          <option key={d.minutes} value={d.minutes}>
            for {d.label}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={busy || !pass}>
        {until ? 'Confirm' : 'Unlock'}
      </Button>
      {error && (
        <p className="w-full text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </form>
  )
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
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [reveal, setReveal] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  return (
    <Section
      title="Secrets"
      count={overview.secrets.length}
      description={unlocked ? 'Names only — values are never shown.' : 'Unlock the vault to add or replace a secret.'}
    >
      <div className={`${surface} divide-y divide-white/[0.06]`}>
        {overview.secrets.length === 0 && <p className="p-4 text-sm text-gray-500">No secrets yet.</p>}
        {overview.secrets.map((s) => (
          <div key={s.name} className="flex items-center gap-3 px-4 py-2.5">
            <KeyRound className="h-4 w-4 text-amber-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <code className="text-sm text-gray-200">{s.name}</code>
              {s.description && <p className="truncate text-xs text-gray-500">{s.description}</p>}
            </div>
            <span className="text-xs text-gray-600">updated {formatUntil(s.updated_at)}</span>
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
                      setError(vaultErrorMessage(e))
                    }
                  }}
                >
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                  Cancel
                </Button>
              </span>
            ) : (
              <button
                className="rounded p-1 text-gray-500 hover:text-red-400"
                onClick={() => setConfirmDelete(s.name)}
                aria-label={`Delete secret ${s.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        {unlocked && (
          <form
            className="flex flex-wrap items-center gap-2 p-4"
            onSubmit={async (e) => {
              e.preventDefault()
              setError(null)
              try {
                await vaultApi.putSecret(name.trim(), value, description.trim() || undefined)
                setName('')
                setValue('')
                setDescription('')
                onChange()
              } catch (err) {
                setError(vaultErrorMessage(err))
              }
            }}
          >
            <input
              className={`${input} w-40 font-mono`}
              placeholder="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Secret name"
            />
            <span className="flex flex-1 items-center gap-1">
              <input
                type={reveal ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                className={`${input} flex-1 font-mono`}
                placeholder="value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label="Secret value"
              />
              <button
                type="button"
                className="rounded p-1 text-gray-500 hover:text-gray-300"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? 'Hide value' : 'Show value'}
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
            <input
              className={`${input} w-full`}
              placeholder="What it is for (optional — shown to agents)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="Secret description"
            />
            <Button type="submit" size="sm" disabled={!name.trim() || value.length < 8}>
              Save secret
            </Button>
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

function GrantsPanel({
  overview,
  canChange,
  onChange,
}: {
  overview: VaultOverview
  canChange: boolean
  onChange: () => void
}) {
  const [which, setWhich] = useState<string>('__all__')
  const [scopeKind, setScopeKind] = useState<'anywhere' | 'project'>('project')
  const [project, setProject] = useState('')
  const [minutes, setMinutes] = useState(1440)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setError(null)
    const secrets: SecretSelector = which === '__all__' ? { kind: 'all' } : { kind: 'names', names: [which] }
    const scope: GrantScope = scopeKind === 'anywhere' ? { kind: 'anywhere' } : { kind: 'project', value: project.trim() }
    try {
      await vaultApi.createGrant({ secrets, scope, minutes })
      onChange()
    } catch (e) {
      setError(vaultErrorMessage(e))
    }
  }

  return (
    <Section
      title="Access"
      count={overview.grants.length}
      description="Who may use what, until when. Grants also work while you are away — as long as the vault is unlocked."
    >
      <div className={`${surface} divide-y divide-white/[0.06]`}>
        {overview.grants.length === 0 && (
          <p className="p-4 text-sm text-gray-500">No access granted. Agents will ask you in the chat when they need a secret.</p>
        )}
        {overview.grants.map((g: VaultGrant) => (
          <div key={g.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1 text-gray-300">
              <span className="text-gray-100">{describeSecrets(g.secrets)}</span> → {describeScope(g.scope)}
              {g.note && <p className="truncate text-xs text-gray-500">{g.note}</p>}
            </div>
            <span className="text-xs text-gray-500">until {formatUntil(g.expires_at)}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await vaultApi.revokeGrant(g.id)
                onChange()
              }}
            >
              Revoke
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2 p-4 text-sm text-gray-400">
          <span>Allow</span>
          <select className={select} value={which} onChange={(e) => setWhich(e.target.value)} aria-label="Secrets">
            <option value="__all__">all secrets</option>
            {overview.secrets.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <span>to</span>
          <select
            className={select}
            value={scopeKind}
            onChange={(e) => setScopeKind(e.target.value as 'anywhere' | 'project')}
            aria-label="Scope"
          >
            <option value="project">project…</option>
            <option value="anywhere">every agent</option>
          </select>
          {scopeKind === 'project' && (
            <input
              className={`${input} w-40 font-mono`}
              placeholder="project-slug"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              aria-label="Project slug"
            />
          )}
          <select className={select} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Duration">
            {GRANT_DURATION_CHOICES.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                for {d.label}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={create} disabled={!canChange || (scopeKind === 'project' && !project.trim())}>
            Grant
          </Button>
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </Section>
  )
}
