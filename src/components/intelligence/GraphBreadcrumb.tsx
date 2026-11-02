import { useAtomValue, useSetAtom } from 'jotai'
import { useT } from '@/i18n'
import { graphScaleAtom, selectedNodeAtom, selectedNodeIdAtom } from '@/atoms/intelligence'

function text(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

/**
 * One quiet breadcrumb line that says where you are in the graph and gets you
 * back out with one click. Shown only when a node is selected or the view is
 * aggregated (scale ≥ 1); renders nothing at full detail without a selection.
 * Reads existing atoms only — no props, no layout work.
 */
export function GraphBreadcrumb() {
  const { t } = useT()
  const scale = useAtomValue(graphScaleAtom)
  const selected = useAtomValue(selectedNodeAtom)
  const setScale = useSetAtom(graphScaleAtom)
  const setSelectedNodeId = useSetAtom(selectedNodeIdAtom)

  if (scale < 1 && !selected) return null

  const data = (selected?.data ?? {}) as Record<string, unknown>
  const name = selected
    ? (text(data.label) ?? selected.id)
    : t('intelPage.breadcrumb.group', { id: scale })

  const reset = () => {
    setScale(0)
    setSelectedNodeId(null)
  }

  return (
    <nav
      aria-label={t('intelPage.breadcrumb.aria')}
      data-graph-breadcrumb=""
      className="absolute left-3 top-[5rem] z-30 flex min-w-0 max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--color-surface-raised)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]"
    >
      <button
        type="button"
        onClick={reset}
        title={t('intelPage.breadcrumb.all')}
        className="min-w-0 truncate whitespace-nowrap rounded text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-light)]"
      >
        {t('intelPage.breadcrumb.all')}
      </button>
      <span aria-hidden="true" className="shrink-0 text-[var(--text-tertiary)]">
        ›
      </span>
      <span className="min-w-0 truncate whitespace-nowrap text-[var(--text-primary)]">{name}</span>
    </nav>
  )
}
