import { useId } from 'react'
import { useT } from '@/i18n'
import { formatTokenCount, costSumPartialHelp } from '@/utils/cost'
import { modelBreakdown, subtreeCost, treeLimits } from '@/utils/discussionTree'
import type { DiscussionNode } from '@/services/discussions'
import { providerKindLabel } from '@/types/provider'
import { useAtomValue } from 'jotai'
import { providersAtom } from '@/atoms'

interface SubtreeBreakdownProps {
  root: DiscussionNode
}

/**
 * What a tree cost, in total and by (provider, model), plus the tree's limits
 * when the server states them. Shown only when the tree has several sessions.
 * A total with an unknown part reads "≥": it is a floor, not a figure.
 */
export function SubtreeBreakdown({ root }: SubtreeBreakdownProps) {
  const { t } = useT()
  const captionId = useId()
  const providers = useAtomValue(providersAtom)?.providers
  if ((root.children ?? []).length === 0) return null

  const total = subtreeCost(root)
  const rows = modelBreakdown(root)
  const limits = treeLimits(root)

  return (
    <section data-testid="subtree-breakdown" aria-labelledby={captionId} className="mb-3 rounded-lg border border-border-subtle bg-white/[0.02] p-3 text-xs text-gray-400">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={captionId} className="font-medium text-gray-300">
          {t('siteChat.discussions.treeCost')}{' '}
          <span data-testid="subtree-total" title={total.partial ? costSumPartialHelp() : undefined} className="font-mono tabular-nums">
            {total.text ?? t('siteChat.discussions.unknown')}
          </span>
          {total.partial && <span className="sr-only"> ({costSumPartialHelp()})</span>}
        </h3>
      </div>

      {limits && (
        <p data-testid="subtree-limits" className="mt-1">
          {limits.maxDepth !== null && <span>{t('siteChat.discussions.depth', { depth: limits.depth, max: limits.maxDepth })}</span>}
          {limits.maxDepth !== null && limits.maxChildren !== null && ' · '}
          {limits.maxChildren !== null && <span>{t('siteChat.discussions.children', { live: limits.live, max: limits.maxChildren })}</span>}
        </p>
      )}

      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">{t('siteChat.discussions.tableCaption')}</caption>
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-500">
              <th scope="col" className="py-1 pr-3 font-medium">{t('siteChat.discussions.colProvider')}</th>
              <th scope="col" className="py-1 pr-3 font-medium">{t('siteChat.discussions.colSessions')}</th>
              <th scope="col" className="py-1 pr-3 font-medium">{t('siteChat.discussions.colCost')}</th>
              <th scope="col" className="py-1 font-medium">{t('siteChat.discussions.colTokens')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const instance = providers?.find((p) => p.id === r.provider)
              const label = instance?.label || (r.provider === 'claude-code' ? providerKindLabel('claude_code') : r.provider)
              const cost = r.costText
              const tokens = [
                r.inputTokens !== undefined ? t('siteChat.discussions.tokensIn', { count: formatTokenCount(r.inputTokens) }) : null,
                r.outputTokens !== undefined ? t('siteChat.discussions.tokensOut', { count: formatTokenCount(r.outputTokens) }) : null,
              ].filter(Boolean)
              return (
                <tr key={`${r.provider}/${r.model ?? ''}`} className="border-t border-white/[0.04]">
                  <th scope="row" className="py-1 pr-3 font-normal text-gray-300">
                    {label}
                    {r.model && <span className="text-gray-500"> / {r.model}</span>}
                  </th>
                  <td className="py-1 pr-3 tabular-nums">{r.sessions}</td>
                  <td className="py-1 pr-3 font-mono tabular-nums">{cost ?? t('siteChat.discussions.unknown')}</td>
                  <td className="py-1 font-mono tabular-nums">{tokens.length > 0 ? tokens.join(' · ') : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
