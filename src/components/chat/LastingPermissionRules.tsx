import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { chatApi } from '@/services/chat'
import { useT } from '@/i18n'
import type { LastingPermissionRule } from '@/types'

type Load =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'disabled' }
  | { state: 'ready'; rules: LastingPermissionRule[] }

/**
 * The person's lasting approvals (`always`, P11b): what each covers (the identical call, on one
 * project) and a way to revoke it. Kept and enforced by the backend: a revoked call is asked again
 * from the next request, in every conversation.
 */
export function LastingPermissionRules() {
  const { t } = useT()
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [revoking, setRevoking] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'revoked' | 'failed'; at: number } | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await chatApi.listPermissionRules()
      setLoad(res.enabled ? { state: 'ready', rules: res.rules } : { state: 'disabled' })
    } catch {
      setLoad({ state: 'failed' })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const revoke = async (id: string) => {
    setRevoking(id)
    try {
      await chatApi.revokePermissionRule(id)
      setLoad((prev) =>
        prev.state === 'ready' ? { state: 'ready', rules: prev.rules.filter((r) => r.id !== id) } : prev,
      )
      setNotice({ kind: 'revoked', at: Date.now() })
    } catch {
      setNotice({ kind: 'failed', at: Date.now() })
    } finally {
      setRevoking(null)
    }
  }

  return (
    <section data-testid="lasting-permission-rules">
      <h3 className="text-xs font-semibold text-gray-400 mb-1">{t('chatA-tools.lastingRules.title')}</h3>
      <p className="text-[10px] text-gray-500 leading-snug mb-2">{t('chatA-tools.lastingRules.description')}</p>
      {load.state === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-gray-500" aria-hidden="true" />}
      {load.state === 'failed' && (
        <p role="alert" className="text-[11px] text-red-400">
          {t('chatA-tools.lastingRules.loadFailed')}
        </p>
      )}
      {load.state === 'disabled' && <p className="text-[11px] text-gray-500">{t('chatA-tools.lastingRules.disabled')}</p>}
      {load.state === 'ready' && load.rules.length === 0 && (
        <p className="text-[11px] text-gray-500">{t('chatA-tools.lastingRules.empty')}</p>
      )}
      {load.state === 'ready' && load.rules.length > 0 && (
        <ul className="space-y-1.5">
          {load.rules.map((rule) => (
            <li
              key={rule.id}
              className="flex items-center gap-2 rounded border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 min-w-0"
            >
              <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-gray-400">
                {rule.project}
              </span>
              <code
                className={`font-mono text-[11px] truncate flex-1 min-w-0 ${rule.holds ? 'text-gray-300' : 'text-gray-500 line-through'}`}
                title={rule.rule}
              >
                {rule.rule}
              </code>
              {!rule.holds && (
                <span className="shrink-0 text-[10px] text-amber-400/80">{t('chatA-tools.lastingRules.notHeld')}</span>
              )}
              <button
                type="button"
                onClick={() => void revoke(rule.id)}
                disabled={revoking !== null}
                aria-label={`${t('chatA-tools.lastingRules.revoke')}: ${rule.rule}`}
                className="shrink-0 px-2 py-0.5 text-[11px] font-medium rounded bg-red-600/15 text-red-400 hover:bg-red-600/25 transition-colors disabled:opacity-50"
              >
                {revoking === rule.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                ) : (
                  t('chatA-tools.lastingRules.revoke')
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <p
          key={notice.at}
          role={notice.kind === 'failed' ? 'alert' : 'status'}
          className={`mt-1.5 text-[10px] ${notice.kind === 'failed' ? 'text-red-400' : 'text-gray-400'}`}
        >
          {notice.kind === 'failed' ? t('chatA-tools.lastingRules.revokeFailed') : t('chatA-tools.lastingRules.revoked')}
        </p>
      )}
    </section>
  )
}
