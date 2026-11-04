import { useT } from '@/i18n'

export interface GraphSituationProps {
  /** Nodes on screen. */
  nodeCount: number
  /** Groups of the current scale: 1 at full detail, N when aggregated. */
  groupCount: number
  /** Edges on screen. */
  edgeCount: number
  /** Visible layers, short names. */
  layers: readonly string[]
  /** Aggregation scale: 0 = detail, 1..N = groups. */
  scale: number
}

/** Beyond this many layers the names give way to a count. */
const MAX_LAYER_NAMES = 3

/**
 * One quiet line that says what the graph shows: nodes, groups, edges, layers, scale.
 * Counts are mono; the line truncates (never wraps) and the full text sits in `title`.
 */
export function GraphSituation({ nodeCount, groupCount, edgeCount, layers, scale }: GraphSituationProps) {
  const { t } = useT()
  const layerText = layers.length > MAX_LAYER_NAMES ? String(layers.length) : layers.join(' · ')
  const tier = scale > 0 ? t('intelPage.situation.tierGroups') : t('intelPage.situation.tierDetail')
  const n = nodeCount.toLocaleString()
  const g = groupCount.toLocaleString()
  const e = edgeCount.toLocaleString()
  const full = `${tier} · ${n} ${t('intelPage.situation.nodes')} · ${g} ${t('intelPage.situation.groups')} · ${e} ${t('intelPage.situation.edges')} · ${layers.length} ${t('intelPage.situation.layers')}${layers.length ? ` (${layers.join(', ')})` : ''}`

  const num = 'font-mono tabular-nums text-[var(--text-secondary)]'
  return (
    <div
      role="status"
      aria-label={t('intelPage.situation.aria')}
      title={full}
      data-graph-situation=""
      className="pointer-events-none absolute left-3 top-[3.5rem] z-30 flex min-w-0 max-w-[calc(100%-1.5rem)] items-center rounded-lg border border-[var(--border-default)] bg-[var(--color-surface-raised)] px-2 py-0.5 text-[11px] text-[var(--text-tertiary)]"
    >
      <span className="min-w-0 truncate whitespace-nowrap">
        <span className="text-[var(--text-secondary)]">{tier}</span>
        {' · '}
        <span className={num}>{n}</span> {t('intelPage.situation.nodes')}
        {' · '}
        <span className={num}>{g}</span> {t('intelPage.situation.groups')}
        {' · '}
        <span className={num}>{e}</span> {t('intelPage.situation.edges')}
        {' · '}
        <span className={num}>{layerText}</span>
        {layers.length > MAX_LAYER_NAMES ? ` ${t('intelPage.situation.layers')}` : ''}
      </span>
    </div>
  )
}
