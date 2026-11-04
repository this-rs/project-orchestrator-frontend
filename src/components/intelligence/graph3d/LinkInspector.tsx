// LinkInspector — what a clicked link carries: its two ends, how many real
// relations, by family, and the relations themselves (bounded, the rest counted).
// « Je dois pouvoir cliquer sur un lien et voir les relations » (04/11/2026).

import { X } from 'lucide-react'
import { useT } from '@/i18n'
import { graphFloat } from '../graphSurface'

export interface LinkInspectorRelation {
  from: string
  to: string
  relation: string
}

export interface LinkInspectorProps {
  /** Names of the two ends of the corridor. */
  from: string
  to: string
  /** Exact number of real relations. */
  total: bigint
  families: ReadonlyArray<{ relation: string; exactCount: bigint; share: number }>
  /** The first relations, already bounded by the caller. */
  relations: readonly LinkInspectorRelation[]
  /** Relations not listed. */
  more: number
  onClose: () => void
}

const count = (n: bigint) => n.toLocaleString()

export function LinkInspector({ from, to, total, families, relations, more, onClose }: LinkInspectorProps) {
  const { t } = useT()
  return (
    <aside
      data-testid="link-inspector"
      aria-label={t('intelGraph.linkInspector.aria')}
      className={`${graphFloat} shadow-[var(--shadow-md)] absolute z-40 flex flex-col gap-2 p-3 text-[12px] text-[var(--text-secondary)] left-3 right-3 bottom-20 max-h-[45%] sm:left-auto sm:right-3 sm:top-3 sm:bottom-auto sm:w-80 sm:max-h-[70%]`}
    >
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{t('intelGraph.linkInspector.title')}</p>
          <h3 className="truncate text-[13px] font-medium text-[var(--text-primary)]" title={`${from} ↔ ${to}`}>
            {from} <span className="text-[var(--text-tertiary)]">↔</span> {to}
          </h3>
          <p data-testid="link-inspector-total" className="tabular-nums">
            {t('intelGraph.linkInspector.relations', { count: count(total) })}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('intelGraph.linkInspector.close')}
          title={t('intelGraph.linkInspector.close')}
          className="rounded-md p-1 text-[var(--text-tertiary)] hover:bg-surface-highlight hover:text-[var(--text-primary)]"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      {families.length > 0 && (
        <section>
          <h4 className="mb-1 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{t('intelGraph.linkInspector.families')}</h4>
          <ul className="flex flex-col gap-1">
            {families.map((f) => (
              <li key={f.relation} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate font-mono text-[11px]" title={f.relation}>{f.relation}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded bg-surface-highlight" aria-hidden="true">
                  <span className="block h-full bg-[var(--color-primary-light)]" style={{ width: `${Math.max(2, Math.round(f.share * 100))}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right tabular-nums">{count(f.exactCount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {relations.length > 0 && (
        <section className="min-h-0 overflow-auto">
          <h4 className="mb-1 text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{t('intelGraph.linkInspector.real')}</h4>
          <ul className="flex flex-col gap-0.5">
            {relations.map((r, i) => (
              <li key={i} data-testid="link-inspector-relation" className="truncate" title={`${r.from} → ${r.to} (${r.relation})`}>
                <span className="text-[var(--text-primary)]">{r.from}</span>
                <span className="text-[var(--text-tertiary)]"> → </span>
                <span className="text-[var(--text-primary)]">{r.to}</span>
                <span className="ml-1 font-mono text-[10px] text-[var(--text-tertiary)]">{r.relation}</span>
              </li>
            ))}
          </ul>
          {more > 0 && <p className="mt-1 text-[var(--text-tertiary)]">{t('intelGraph.linkInspector.more', { count: more.toLocaleString() })}</p>}
        </section>
      )}
    </aside>
  )
}
