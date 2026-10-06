/**
 * SecretRequestTray — the secure input the agent asked for (vault `request_secret`).
 *
 * Sits above the chat input, one card per pending request. The value typed
 * here goes straight to the vault API: it never becomes a chat message, so it
 * is never in the transcript, the model's context or the search index.
 *
 * One card covers every case, so the user never has to leave the chat:
 * - vault locked   → passphrase field on the same card (unlock + answer in one call);
 * - secret exists  → "Allow" grants it without typing it again;
 * - otherwise      → masked value field.
 * The grant defaults to this conversation; the user can widen it to the
 * project and pick a duration, so the next request does not ask again.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { KeyRound, Eye, EyeOff, Lock, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { panelGlass } from '@/components/ui/panelGlass'
import { chatSecretRequestsAtom, type PendingSecretRequest } from '@/atoms'
import {
  vaultApi,
  vaultErrorMessage,
  hasUnlockProof,
  GRANT_DURATION_CHOICES,
  DURATION_CHOICES,
  type GrantScope,
  type VaultOverview,
} from '@/services/vault'

interface SecretRequestTrayProps {
  sessionId: string | null
}

export function SecretRequestTray({ sessionId }: SecretRequestTrayProps) {
  const [requests, setRequests] = useAtom(chatSecretRequestsAtom)
  const [overview, setOverview] = useState<VaultOverview | null>(null)

  const refresh = useCallback(async () => {
    if (!sessionId) return
    try {
      const o = await vaultApi.overview()
      setOverview(o)
      // The server holds the list (WS events are ephemeral): replace, so a
      // request answered elsewhere (another tab) disappears here too. The
      // server registers a request before announcing it, so a live event is
      // never lost by this.
      setRequests(
        o.requests
          .filter((r) => r.session_id === sessionId)
          .map(({ id, name, reason, exists }) => ({ id, name, reason, exists })),
      )
    } catch {
      // Vault API unreachable: the cards still render, answering shows the error.
    }
  }, [sessionId, setRequests])

  useEffect(() => {
    void refresh()
  }, [refresh, requests.length])

  if (!sessionId || requests.length === 0) return null

  const projectSlug = overview?.requests.find((r) => r.session_id === sessionId)?.project_slug ?? null

  return (
    <div className="mx-3 mb-2 space-y-2" aria-live="polite">
      {requests.map((req) => (
        <SecretRequestCard
          key={req.id}
          request={req}
          sessionId={sessionId}
          projectSlug={projectSlug}
          overview={overview}
          onDone={() => {
            setRequests((current) => current.filter((r) => r.id !== req.id))
            void refresh()
          }}
        />
      ))}
    </div>
  )
}

interface CardProps {
  request: PendingSecretRequest
  sessionId: string
  projectSlug: string | null
  overview: VaultOverview | null
  onDone: () => void
}

export function SecretRequestCard({ request, sessionId, projectSlug, overview, onDone }: CardProps) {
  const [value, setValue] = useState('')
  const [reveal, setReveal] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [unlockMinutes, setUnlockMinutes] = useState(60)
  const [scopeKind, setScopeKind] = useState<'session' | 'project'>('session')
  const [grantMinutes, setGrantMinutes] = useState(60)
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initialized = overview?.initialized ?? true
  const locked = overview ? !overview.unlocked_until : false
  // Open but unlocked from elsewhere (or before a reload): this tab must still
  // prove it knows the passphrase — agents can forge a login, not that.
  const needsPass = locked || !hasUnlockProof()
  const offerGrant = request.exists && !replace

  const scope: GrantScope =
    scopeKind === 'project' && projectSlug
      ? { kind: 'project', value: projectSlug }
      : { kind: 'session', value: sessionId }

  const submit = async (action: 'provide' | 'grant' | 'decline') => {
    setBusy(true)
    setError(null)
    try {
      await vaultApi.answer(request.id, {
        action,
        value: action === 'provide' ? value : undefined,
        scope: action === 'decline' ? undefined : scope,
        minutes: grantMinutes,
        passphrase: needsPass && action !== 'decline' ? passphrase : undefined,
        unlock_minutes: unlockMinutes,
      })
      setValue('')
      setPassphrase('')
      onDone()
    } catch (e) {
      setError(vaultErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const canSubmit =
    !busy && (!needsPass || passphrase.length > 0) && (offerGrant || value.length > 0)

  return (
    <form
      className={`rounded-lg border border-amber-500/30 ${panelGlass.warning} p-3 text-sm`}
      onSubmit={(e) => {
        e.preventDefault()
        if (canSubmit) void submit(offerGrant ? 'grant' : 'provide')
      }}
    >
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-gray-200">
            The agent asks for the secret <code className="text-amber-300">{request.name}</code>
          </p>
          {request.reason && <p className="mt-0.5 text-xs text-gray-400">« {request.reason} »</p>}
        </div>
        <button
          type="button"
          className="rounded p-1 text-gray-500 hover:bg-white/5 hover:text-gray-300"
          onClick={() => void submit('decline')}
          disabled={busy}
          aria-label="Decline the request"
          title="Decline"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!initialized ? (
        <p className="mt-2 text-xs text-gray-400">
          No vault exists yet.{' '}
          <Link to="/vault" className="text-amber-300 underline">
            Create the vault
          </Link>{' '}
          then come back here.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {needsPass && (
            <label className="flex flex-wrap items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-gray-500" aria-hidden />
              <span className="text-xs text-gray-400">{locked ? 'Vault locked' : 'Confirm with'}</span>
              <input
                type="password"
                autoComplete="current-password"
                className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-100"
                placeholder="Vault passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                aria-label="Vault passphrase"
              />
              <select
                className="rounded border border-gray-700 bg-gray-900 px-1 py-1 text-xs text-gray-300"
                value={unlockMinutes}
                onChange={(e) => setUnlockMinutes(Number(e.target.value))}
                aria-label="Unlock duration"
              >
                {DURATION_CHOICES.map((d) => (
                  <option key={d.minutes} value={d.minutes}>
                    open {d.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {offerGrant ? (
            <p className="text-xs text-gray-400">
              This secret is already in the vault.{' '}
              <button type="button" className="text-amber-300 underline" onClick={() => setReplace(true)}>
                Replace its value
              </button>
            </p>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type={reveal ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 font-mono text-gray-100"
                placeholder="Value (8 characters minimum)"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-label={`Value of secret ${request.name}`}
              />
              <button
                type="button"
                className="rounded p-1 text-gray-500 hover:text-gray-300"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? 'Hide value' : 'Show value'}
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span>Access for</span>
            <select
              className="rounded border border-gray-700 bg-gray-900 px-1 py-1 text-gray-300"
              value={scopeKind}
              onChange={(e) => setScopeKind(e.target.value as 'session' | 'project')}
              aria-label="Access scope"
            >
              <option value="session">this conversation</option>
              {projectSlug && <option value="project">project {projectSlug}</option>}
            </select>
            <select
              className="rounded border border-gray-700 bg-gray-900 px-1 py-1 text-gray-300"
              value={grantMinutes}
              onChange={(e) => setGrantMinutes(Number(e.target.value))}
              aria-label="Access duration"
            >
              {GRANT_DURATION_CHOICES.map((d) => (
                <option key={d.minutes} value={d.minutes}>
                  {d.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!canSubmit}
              className="ml-auto rounded bg-amber-500/80 px-3 py-1 font-medium text-gray-950 hover:bg-amber-400 disabled:opacity-40"
            >
              {busy ? '…' : offerGrant ? 'Allow' : 'Provide'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
