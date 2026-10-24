/**
 * ApiTokensPage — manage long-lived MCP tokens for programmatic API access.
 *
 * Accessible from the user menu ("API Tokens"). Lists the caller's tokens,
 * lets them create new ones (with a one-time reveal), revoke active ones,
 * and purge dead records.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Plus, Trash2 } from 'lucide-react'
import {
  Button,
  ConceptIntro,
  ConfirmDialog,
  EmptyState,
  Input,
  PageContainer,
  PageHeader,
  Section,
  Spinner,
  Badge,
  surface,
} from '@/components/ui'
import type { ConceptExplain } from '@/constants/nomenclature'
import { useT } from '@/i18n'
import { useToast } from '@/hooks/useToast'
import {
  mcpTokensApi,
  type McpToken,
  type CreateMcpTokenResponse,
} from '@/services/mcpTokens'
import { apiErrorMessage } from '@/services/api'

// ── Concept intro ────────────────────────────────────────────────────────

function useApiTokensExplain(): ConceptExplain {
  const { t } = useT()
  return {
    what: t('apiTokens.explain.what'),
    why: t('apiTokens.explain.why'),
    different: t('apiTokens.explain.different'),
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function tokenStatus(token: McpToken): 'active' | 'revoked' | 'expired' {
  if (token.revoked) return 'revoked'
  if (new Date(token.expires_at) < new Date()) return 'expired'
  return 'active'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Token reveal (shown once after creation) ─────────────────────────────

function TokenReveal({
  response,
  onDone,
}: {
  response: CreateMcpTokenResponse
  onDone: () => void
}) {
  const { t } = useT()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(response.token)
      setCopied(true)
      toast.success(t('apiTokens.reveal.copied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be blocked — select the text so the user can copy manually
      inputRef.current?.select()
    }
  }, [response.token, toast, t])

  return (
    <div className={`${surface} p-4 space-y-3 border-amber-500/30`}>
      <h3 className="text-sm font-medium text-amber-300">{t('apiTokens.reveal.title')}</h3>
      <p className="text-xs text-amber-400/80">{t('apiTokens.reveal.warning')}</p>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          readOnly
          value={response.token}
          className="min-h-9 flex-1 min-w-0 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs font-mono text-amber-200 select-all"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <Button size="sm" variant="secondary" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          <span className="ml-1.5">{t('apiTokens.reveal.copy')}</span>
        </Button>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t('apiTokens.reveal.done')}
        </Button>
      </div>
    </div>
  )
}

// ── Create form ──────────────────────────────────────────────────────────

function CreateTokenForm({ onCreated }: { onCreated: (r: CreateMcpTokenResponse) => void }) {
  const { t } = useT()
  const toast = useToast()
  const [label, setLabel] = useState('')
  const [expiryDays, setExpiryDays] = useState('90')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = label.trim()
      if (!trimmed) {
        setError(t('apiTokens.create.labelRequired'))
        return
      }
      setError(null)
      setCreating(true)
      try {
        const days = Math.max(1, Math.min(365, parseInt(expiryDays, 10) || 90))
        const response = await mcpTokensApi.create({ label: trimmed, expiry_days: days })
        setLabel('')
        setExpiryDays('90')
        onCreated(response)
      } catch (err) {
        toast.error(apiErrorMessage(err, t('apiTokens.errors.createFailed')))
      } finally {
        setCreating(false)
      }
    },
    [label, expiryDays, onCreated, toast, t],
  )

  return (
    <form onSubmit={handleSubmit} className={`${surface} p-4 space-y-3`}>
      <h3 className="text-sm font-medium text-gray-200">{t('apiTokens.create.title')}</h3>
      <div className="space-y-1.5">
        <label htmlFor="token-label" className="text-xs text-gray-400">
          {t('apiTokens.create.label')}
        </label>
        <Input
          id="token-label"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value)
            if (error) setError(null)
          }}
          placeholder={t('apiTokens.create.labelPlaceholder')}
          aria-invalid={!!error}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="token-expiry" className="text-xs text-gray-400">
          {t('apiTokens.create.expiryDays')}
        </label>
        <Input
          id="token-expiry"
          type="number"
          min={1}
          max={365}
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value)}
        />
        <p className="text-xs text-gray-500">{t('apiTokens.create.expiryHelp')}</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={creating}>
          {creating ? (
            <>
              <Spinner className="h-3.5 w-3.5" /> {t('apiTokens.create.creating')}
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" /> {t('apiTokens.create.submit')}
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

// ── Token row ────────────────────────────────────────────────────────────

function TokenRow({
  token,
  onRevoke,
}: {
  token: McpToken
  onRevoke: (jti: string) => void
}) {
  const { t } = useT()
  const status = tokenStatus(token)
  const dead = status !== 'active'

  return (
    <tr className={dead ? 'opacity-50' : ''}>
      <td className="px-4 py-3 text-sm text-gray-200">{token.label}</td>
      <td className="px-4 py-3 text-xs font-mono text-gray-400">{token.scope}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(token.created_at)}</td>
      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(token.expires_at)}</td>
      <td className="px-4 py-3">
        <Badge
          variant={status === 'active' ? 'success' : status === 'revoked' ? 'error' : 'default'}
        >
          {t(`apiTokens.status.${status}`)}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {status === 'active' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRevoke(token.jti)}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="ml-1">{t('apiTokens.revoke.button')}</span>
          </Button>
        )}
      </td>
    </tr>
  )
}

// ── Main page ────────────────────────────────────────────────────────────

export function ApiTokensPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const toast = useToast()
  const explain = useApiTokensExplain()

  const [tokens, setTokens] = useState<McpToken[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<CreateMcpTokenResponse | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const list = await mcpTokensApi.list()
      setTokens(list)
      setError(null)
    } catch (err) {
      setError(apiErrorMessage(err, t('apiTokens.errors.loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
  }, [load])

  // ── Revoke ────────────────────────────────────────────────────────────
  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return
    try {
      await mcpTokensApi.revoke(revokeTarget)
      toast.success(t('apiTokens.revoke.success'))
      setRevokeTarget(null)
      load()
    } catch (err) {
      toast.error(apiErrorMessage(err, t('apiTokens.errors.revokeFailed')))
    }
  }, [revokeTarget, toast, t, load])

  // ── Purge ─────────────────────────────────────────────────────────────
  const handlePurge = useCallback(async () => {
    try {
      const { purged } = await mcpTokensApi.purge()
      if (purged > 0) {
        toast.success(t('apiTokens.purge.success', { count: purged }))
        load()
      } else {
        toast.info(t('apiTokens.purge.none'))
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, t('apiTokens.errors.purgeFailed')))
    }
  }, [toast, t, load])

  // ── Created ───────────────────────────────────────────────────────────
  const handleCreated = useCallback(
    (response: CreateMcpTokenResponse) => {
      setRevealed(response)
      load()
    },
    [load],
  )

  const hasDeadTokens = tokens.some((tk) => tokenStatus(tk) !== 'active')

  return (
    <div className="h-dvh overflow-y-auto bg-[var(--bg-primary)]">
      <div className="px-4 md:px-6">
        <PageContainer width="narrow" className="space-y-6">
          <div className="space-y-1">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-3 text-gray-400">
              <ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {t('apiTokens.title')}
            </Button>
            <PageHeader
              title={t('apiTokens.title')}
              description={t('apiTokens.description')}
            />
            <ConceptIntro concept={explain} storageKey="api-tokens" />
          </div>

          {/* Token reveal (after creation) */}
          {revealed && (
            <TokenReveal response={revealed} onDone={() => setRevealed(null)} />
          )}

          {/* Create form */}
          <CreateTokenForm onCreated={handleCreated} />

          {/* Token list */}
          <Section
            title={t('apiTokens.title')}
            count={tokens.length}
            action={
              hasDeadTokens ? (
                <Button size="sm" variant="ghost" onClick={handlePurge}>
                  {t('apiTokens.purge.button')}
                </Button>
              ) : undefined
            }
          >
            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-6 w-6" />
              </div>
            ) : error ? (
              <div className={`${surface} p-4 text-sm text-red-400`}>{error}</div>
            ) : tokens.length === 0 ? (
              <EmptyState
                title={t('apiTokens.empty')}
                description={t('apiTokens.emptyHint')}
              />
            ) : (
              <div className={`${surface} overflow-hidden`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-2 text-xs font-medium text-gray-500">{t('apiTokens.table.label')}</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500">{t('apiTokens.table.scope')}</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500">{t('apiTokens.table.created')}</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500">{t('apiTokens.table.expires')}</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500">{t('apiTokens.table.status')}</th>
                        <th className="px-4 py-2 text-xs font-medium text-gray-500">{t('apiTokens.table.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {tokens.map((tk) => (
                        <TokenRow key={tk.jti} token={tk} onRevoke={setRevokeTarget} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>

          {/* Revoke confirmation */}
          <ConfirmDialog
            open={!!revokeTarget}
            onClose={() => setRevokeTarget(null)}
            onConfirm={handleRevoke}
            title={t('apiTokens.revoke.title')}
            description={t('apiTokens.revoke.confirm')}
            variant="danger"
          />
        </PageContainer>
      </div>
    </div>
  )
}
