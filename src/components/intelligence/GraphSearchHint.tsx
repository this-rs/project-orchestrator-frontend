import { Search } from 'lucide-react'
import { useT } from '@/i18n'
import { graphFloat, graphControl } from './graphSurface'

/** The ⌘K entry (bottom-centre): one quiet pill on the graph surface recipe, not a call to action. */
export function GraphSearchHint({ onOpen }: { onOpen: () => void }) {
  const { t } = useT()
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 ${graphFloat} px-3 py-1.5 text-[var(--text-secondary)] shadow-[var(--shadow-md)] ${graphControl}`}
      aria-label={t('intelPage.graph.spreadingActivation')}
      aria-keyshortcuts="Meta+K Control+K"
    >
      <Search size={13} aria-hidden="true" />
      <span className="text-[11px] font-medium">{t('intelPage.graph.spreadingActivation')}</span>
      <kbd className="rounded border border-border-subtle px-1 font-mono text-[10px] text-[var(--text-tertiary)]">⌘K</kbd>
    </button>
  )
}
