import { useSetAtom } from 'jotai'
import { entityColor } from '@/constants/graphPalette'
import { legendHoveredTypeAtom } from '@/atoms/intelligence'
import type { IntelligenceLayer } from '@/types/intelligence'
import { useT, type MessageKey } from '@/i18n'
import { GraphPanel } from './GraphPanel'
import { graphDot } from './graphSurface'

export const ENTITY_LEGEND: { layer: IntelligenceLayer; types: { key: string; label: MessageKey }[] }[] = [
  { layer: 'code', types: [
    { key: 'file', label: 'intelPage.graph.legend.file' },
    { key: 'function', label: 'intelPage.graph.legend.function' },
    { key: 'struct', label: 'intelPage.graph.legend.struct' },
    { key: 'trait', label: 'intelPage.graph.legend.trait' },
    { key: 'enum', label: 'intelPage.graph.legend.enum' },
    { key: 'feature_graph', label: 'intelPage.graph.legend.featureGraph' },
  ]},
  { layer: 'knowledge', types: [
    { key: 'note', label: 'intelPage.graph.legend.note' },
    { key: 'decision', label: 'intelPage.graph.legend.decision' },
    { key: 'constraint', label: 'intelPage.graph.legend.constraint' },
  ]},
  { layer: 'skills', types: [
    { key: 'skill', label: 'intelPage.graph.legend.skill' },
  ]},
  { layer: 'behavioral', types: [
    { key: 'protocol', label: 'intelPage.graph.legend.protocol' },
    { key: 'protocol_state', label: 'intelPage.graph.legend.state' },
  ]},
  { layer: 'pm', types: [
    { key: 'plan', label: 'intelPage.graph.legend.plan' },
    { key: 'task', label: 'intelPage.graph.legend.task' },
    { key: 'step', label: 'intelPage.graph.legend.step' },
    { key: 'milestone', label: 'intelPage.graph.legend.milestone' },
    { key: 'release', label: 'intelPage.graph.legend.release' },
  ]},
  { layer: 'chat', types: [
    { key: 'chat_session', label: 'intelPage.graph.legend.chatSession' },
  ]},
]

/**
 * The entity legend, po-graph style: a tight grid of one dot + one word, 11px, muted until
 * hovered (hovering a word lights its nodes). Collapsible like every graph panel; narrow
 * (≤ 17rem) so it stays a corner note, not a box.
 */
export function GraphLegend({ visibleLayers }: { visibleLayers: Set<IntelligenceLayer> }) {
  const { t } = useT()
  const setHovered = useSetAtom(legendHoveredTypeAtom)
  const entries = ENTITY_LEGEND.filter((g) => visibleLayers.has(g.layer)).flatMap((g) => g.types)
  return (
    <GraphPanel
      id="legend"
      title={t('intelPage.graph.panels.legend')}
      className="pointer-events-auto w-[min(17rem,calc(100vw-1.5rem))]"
    >
      <ul className="grid grid-cols-3 gap-x-2 gap-y-1 p-2">
        {entries.map((entry) => (
          <li
            key={entry.key}
            className="flex min-w-0 cursor-default items-center gap-1.5 text-[10.5px] text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
            onMouseEnter={() => setHovered(entry.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className={graphDot} style={{ backgroundColor: entityColor(entry.key) }} aria-hidden="true" />
            <span className="truncate">{t(entry.label)}</span>
          </li>
        ))}
      </ul>
    </GraphPanel>
  )
}
