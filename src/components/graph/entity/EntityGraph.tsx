/**
 * EntityGraph — ego-graph centred on any entity (note, decision, task, …).
 *
 * Shows the neighbourhood the agent itself consumes for that entity:
 * one ring per hop, node size/opacity = salience, a "relief" slider that hides
 * weak links (server-side `min_weight`), layer toggles, tap-to-inspect.
 *
 * Performance (phones first): deterministic radial layout (pure function, no
 * force simulation), plain SVG, zero animation loop — it renders when data,
 * params, selection or hover change, and pan/zoom only mutate one transform.
 *
 * @example
 * ```tsx
 * // Dev-only usage sketch — e.g. in a decision detail page:
 * import { EntityGraph, entityHref } from '@/components/graph/entity'
 *
 * const navigate = useNavigate()
 * <EntityGraph
 *   entityType="decision"
 *   entityId={decision.id}
 *   initialDepth={2}
 *   hrefForNode={(n) => entityHref(n.type, n.id, wsSlug)}
 *   onOpenNode={(n) => {
 *     const href = entityHref(n.type, n.id, wsSlug)
 *     if (href) navigate(href)
 *   }}
 * />
 * ```
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  NEIGHBORHOOD_LAYERS,
  type NeighborhoodDepth,
  type NeighborhoodLayer,
  type NeighborhoodNode,
  type NeighborhoodParams,
} from '@/services/neighborhood'
import { useT } from '@/i18n'
import { useNeighborhood } from './useNeighborhood'
import { usePanZoom } from './usePanZoom'
import { useReducedMotion } from './useReducedMotion'
import { pathToCenter, radialLayout } from './radialLayout'
import { layerCounts, TYPE_ORDER } from './entityVisuals'
import { EntityGraphControls } from './EntityGraphControls'
import { EntityGraphExplainer } from './EntityGraphExplainer'
import { EntityGraphCanvas } from './EntityGraphCanvas'
import { NodeInfoCard } from './NodeInfoCard'

export interface EntityGraphProps {
  /** Entity type of the center (note, decision, task, plan, …). */
  entityType: string
  entityId: string
  /** Initial hop depth (1..3). Default 2. */
  initialDepth?: NeighborhoodDepth
  /** Initial relief = min_weight (0..0.9). Default 0.2. */
  initialRelief?: number
  /** Initially enabled layers. Default: all. */
  initialLayers?: readonly NeighborhoodLayer[]
  /** Max nodes asked to the server. Default 150. */
  limit?: number
  /** Called by the info card "Ouvrir" action. */
  onOpenNode?: (node: NeighborhoodNode) => void
  /** Route of a node (rendered as a real link in the info card); null = no page. */
  hrefForNode?: (node: NeighborhoodNode) => string | null
  /** Height of the drawing area (CSS). Default `min(62vh, 520px)`. */
  height?: number | string
  /** Debounce of the relief slider before refetching. Default 300 ms. */
  reliefDebounceMs?: number
  /** Open the "how to read this graph" explainer initially. */
  defaultExplainerOpen?: boolean
  className?: string
}

const VIEWBOX = 600
/** Above this node count the layout transition is skipped (cheap on phones). */
const ANIMATE_MAX_NODES = 150

/**
 * Relief slider state: `relief` follows the thumb instantly, `minWeight`
 * (what is requested) follows after `ms` of calm — one request per drag.
 * `setBoth` applies a value immediately (reset, empty-state shortcut).
 */
function useRelief(initial: number, ms: number) {
  const [relief, setRelief] = useState(initial)
  const [minWeight, setMinWeight] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => cancel, [cancel])
  const onChange = useCallback(
    (v: number) => {
      setRelief(v)
      cancel()
      timer.current = setTimeout(() => {
        timer.current = null
        setMinWeight(v)
      }, ms)
    },
    [ms, cancel]
  )
  const setBoth = useCallback(
    (v: number) => {
      cancel()
      setRelief(v)
      setMinWeight(v)
    },
    [cancel]
  )
  return { relief, minWeight, onChange, setBoth }
}

export function EntityGraph({
  entityType,
  entityId,
  initialDepth = 2,
  initialRelief = 0.2,
  initialLayers,
  limit = 150,
  onOpenNode,
  hrefForNode,
  height = 'min(62vh, 520px)',
  reliefDebounceMs = 300,
  defaultExplainerOpen = false,
  className = '',
}: EntityGraphProps) {
  const { t } = useT()
  const allLayers = useMemo(
    () => new Set<NeighborhoodLayer>(initialLayers ?? NEIGHBORHOOD_LAYERS),
    [initialLayers]
  )
  const [depth, setDepth] = useState<NeighborhoodDepth>(initialDepth)
  const [layers, setLayers] = useState<ReadonlySet<NeighborhoodLayer>>(allLayers)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)

  const {
    relief,
    minWeight,
    onChange: onReliefChange,
    setBoth: setReliefNow,
  } = useRelief(initialRelief, reliefDebounceMs)

  const params = useMemo<NeighborhoodParams>(
    () => ({
      entityType,
      entityId,
      depth,
      minWeight,
      limit,
      layers:
        layers.size === NEIGHBORHOOD_LAYERS.length
          ? undefined
          : NEIGHBORHOOD_LAYERS.filter((l) => layers.has(l)),
    }),
    [entityType, entityId, depth, minWeight, limit, layers]
  )

  const { data, staleData, loading, error, retry } = useNeighborhood(params)
  // While the next answer loads, keep showing the previous one (dimmed) —
  // but never another entity's graph.
  const shown = data ?? (staleData?.center.id === entityId ? staleData : undefined)

  const layout = useMemo(() => (shown ? radialLayout(shown, VIEWBOX) : null), [shown])
  const reducedMotion = useReducedMotion()
  const animate = !reducedMotion && !!layout && layout.nodes.length <= ANIMATE_MAX_NODES

  const isEmpty = !!data && !!layout && layout.nodes.length <= 1
  const pz = usePanZoom(VIEWBOX, !!layout && !isEmpty)

  const counts = useMemo(() => layerCounts(shown?.stats, shown?.nodes), [shown])
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of layout?.nodes ?? []) m.set(n.type, (m.get(n.type) ?? 0) + 1)
    const rank = (t: string) => {
      const i = TYPE_ORDER.indexOf(t)
      return i === -1 ? TYPE_ORDER.length : i
    }
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || (a[0] < b[0] ? -1 : 1))
  }, [layout])

  const selected = selectedId && layout ? layout.byId.get(selectedId) : undefined
  const selectedPath = useMemo(
    () => (selected && shown ? pathToCenter(shown, selected.id) : null),
    [selected, shown]
  )

  const toggleLayer = useCallback((l: NeighborhoodLayer) => {
    setLayers((cur) => {
      const next = new Set(cur)
      if (next.has(l)) {
        if (next.size === 1) return cur // keep at least one layer
        next.delete(l)
      } else next.add(l)
      return next
    })
  }, [])

  const { reset: resetView, zoomBy } = pz
  const reset = useCallback(() => {
    setDepth(initialDepth)
    setReliefNow(initialRelief)
    setLayers(allLayers)
    setSelectedId(null)
    resetView()
  }, [initialDepth, initialRelief, allLayers, resetView, setReliefNow])

  const refreshing = loading && !!layout

  return (
    <section className={`flex flex-col gap-3 ${className}`} aria-label={t('graph.entity.label')}>
      <EntityGraphControls
        depth={depth}
        onDepthChange={setDepth}
        relief={relief}
        onReliefChange={onReliefChange}
        layers={layers}
        onToggleLayer={toggleLayer}
        layerCounts={counts}
        onReset={reset}
        onZoom={zoomBy}
      />

      <div
        className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015]"
        style={{ height }}
        aria-busy={loading}
      >
        {layout && !isEmpty && (
          <EntityGraphCanvas
            layout={layout}
            selectedId={selected ? selected.id : null}
            hoverId={hoverId}
            onSelect={setSelectedId}
            onHover={setHoverId}
            animate={animate}
            svgRef={pz.svgRef}
            gRef={pz.gRef}
            wasDrag={pz.wasDrag}
            dimmed={refreshing}
          />
        )}

        {!layout && loading && <GraphSkeleton />}

        {error && !loading && (
          <div
            role="alert"
            className="absolute inset-x-3 top-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200"
          >
            <AlertTriangle size={14} aria-hidden />
            <span className="flex-1 min-w-[12rem]">
              {t('graph.entity.loadFailed', { message: error.message })}
            </span>
            <Button type="button" size="sm" variant="secondary" flat onClick={retry}>
              {t('graph.entity.retry')}
            </Button>
          </div>
        )}

        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm">
            <p className="text-gray-300">{t('graph.entity.noRelation')}</p>
            <p className="text-xs text-gray-500 max-w-xs">{t('graph.entity.noRelationHint')}</p>
            <div className="flex gap-2">
              {relief > 0 && (
                <Button type="button" size="sm" variant="secondary" flat onClick={() => setReliefNow(0)}>
                  {t('graph.entity.lowerRelief')}
                </Button>
              )}
              {depth < 3 && (
                <Button type="button" size="sm" variant="secondary" flat onClick={() => setDepth((depth + 1) as NeighborhoodDepth)}>
                  {t('graph.entity.goDepth', { n: depth + 1 })}
                </Button>
              )}
            </div>
          </div>
        )}

        {refreshing && (
          <span className="absolute top-2 right-3 text-[11px] text-gray-500" aria-live="polite">
            {t('graph.entity.updating')}
          </span>
        )}

        {shown?.truncated && !isEmpty && (
          <span className="absolute top-2 left-3 rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-gray-300">
            {t('graph.entity.truncated', { shown: shown.nodes.length, total: shown.stats.total_before_limit })}
          </span>
        )}

        {selected && layout && (
          <div className="absolute inset-x-2 bottom-2 sm:right-auto sm:w-80">
            <NodeInfoCard
              node={selected}
              isCenter={selected.isCenter}
              path={selectedPath}
              labelOf={(id) => layout.byId.get(id)?.label ?? id}
              href={hrefForNode ? hrefForNode(selected) : null}
              onOpen={onOpenNode}
              onClose={() => setSelectedId(null)}
            />
          </div>
        )}
      </div>

      <EntityGraphExplainer typeCounts={typeCounts} defaultOpen={defaultExplainerOpen} />
    </section>
  )
}

/** Static placeholder (no pulse, no spinner): the rings the graph will fill. */
function GraphSkeleton() {
  const { t } = useT()
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      data-testid="entity-graph-skeleton"
    >
      <svg viewBox="0 0 100 100" className="h-3/4 w-3/4" aria-hidden>
        {[14, 28, 42].map((r) => (
          <circle
            key={r}
            cx={50}
            cy={50}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="1 2"
          />
        ))}
        <circle cx={50} cy={50} r={4} fill="rgba(255,255,255,0.1)" />
      </svg>
      <span className="sr-only">{t('graph.entity.loadingNeighborhood')}</span>
    </div>
  )
}
