import { memo, useCallback, useMemo, type KeyboardEvent, type RefObject } from 'react'
import type { LaidOutNode, RadialLayout } from './radialLayout'
import { typeColor, typeLabel } from './entityVisuals'

export interface EntityGraphCanvasProps {
  layout: RadialLayout
  selectedId: string | null
  hoverId: string | null
  onSelect: (id: string | null) => void
  onHover: (id: string | null) => void
  /** One short spatial transition between layouts (off for big graphs / reduced motion). */
  animate: boolean
  svgRef: RefObject<SVGSVGElement | null>
  gRef: RefObject<SVGGElement | null>
  wasDrag: () => boolean
  dimmed?: boolean
}

// Motion (DESIGN.md "Matière et mouvement"): nothing idles; a layout change
// glides nodes once (≤ 240 ms, transform/opacity only, ease-out) and fades
// edges in; selection feedback ≤ 150 ms. All disabled under reduced motion.
const MOTION_CSS = `
.eg-anim .eg-node{transition:transform 220ms cubic-bezier(.2,0,0,1),opacity 220ms ease-out}
.eg-anim .eg-fade{animation:eg-fade-in 240ms ease-out backwards}
.eg-sel{transition:opacity 120ms ease-out}
@keyframes eg-fade-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.eg-anim .eg-node,.eg-anim .eg-fade,.eg-sel{transition:none;animation:none}}
`

const EDGE_COLOR = '#94A3B8'
const EDGE_FOCUS = '#A5B4FC'
const MAX_LABEL = 26

function short(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1)}…` : label
}

const Rings = memo(function Rings({ layout }: { layout: RadialLayout }) {
  const c = layout.size / 2
  const u = layout.size / 600
  return (
    <g aria-hidden>
      {layout.rings.map((ring) => (
        <g key={ring.depth}>
          <circle
            cx={c}
            cy={c}
            r={ring.radius}
            fill="none"
            stroke="rgba(255,255,255,0.07)"
            strokeDasharray={`${3 * u} ${5 * u}`}
          />
          <text
            x={c + ring.radius * Math.SQRT1_2 + 4 * u}
            y={c - ring.radius * Math.SQRT1_2 - 4 * u}
            fontSize={9 * u}
            fill="rgba(255,255,255,0.28)"
          >
            {ring.depth} hop{ring.depth > 1 ? 's' : ''}
          </text>
        </g>
      ))}
    </g>
  )
})

const Edges = memo(function Edges({
  layout,
  focusId,
}: {
  layout: RadialLayout
  focusId: string | null
}) {
  return (
    <g className="eg-fade" aria-hidden>
      {layout.edges.map((e) => {
        const hot = focusId !== null && (e.source === focusId || e.target === focusId)
        const dim = focusId !== null && !hot
        return (
          <line
            key={e.key}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={hot ? EDGE_FOCUS : EDGE_COLOR}
            strokeWidth={hot ? e.strokeWidth * 1.4 : e.strokeWidth}
            strokeOpacity={hot ? Math.max(0.75, e.opacity) : dim ? e.opacity * 0.35 : e.opacity}
            strokeLinecap="round"
          />
        )
      })}
    </g>
  )
})

const Nodes = memo(function Nodes({
  layout,
  selectedId,
  focusId,
  neighbors,
  onActivate,
  onHover,
}: {
  layout: RadialLayout
  selectedId: string | null
  focusId: string | null
  neighbors: Set<string>
  onActivate: (id: string) => void
  onHover: (id: string | null) => void
}) {
  const u = layout.size / 600
  const hit = 12 * u // minimum touch radius
  return (
    <g>
      {layout.nodes.map((n: LaidOutNode) => {
        const color = typeColor(n.type)
        const selected = n.id === selectedId
        const related = focusId === null || n.id === focusId || neighbors.has(n.id)
        const opacity = related ? n.opacity : n.opacity * 0.3
        const showLabel = n.showLabel || selected || n.id === focusId
        const onKey = (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onActivate(n.id)
          }
        }
        return (
          <g
            key={n.id}
            className="eg-node"
            style={{ transform: `translate(${n.x}px, ${n.y}px)`, opacity }}
            role="button"
            tabIndex={0}
            aria-label={`${typeLabel(n.type)}: ${n.label}`}
            aria-pressed={selected}
            data-node-id={n.id}
            onClick={(e) => {
              e.stopPropagation()
              onActivate(n.id)
            }}
            onKeyDown={onKey}
            onPointerEnter={(e) => e.pointerType === 'mouse' && onHover(n.id)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(null)}
            cursor="pointer"
          >
            <g className="eg-fade">
              <circle r={Math.max(hit, n.r + 4 * u)} fill="transparent" />
              <circle
                className="eg-sel"
                r={n.r + 4 * u}
                fill="none"
                stroke={color}
                strokeWidth={1.5 * u}
                opacity={selected ? 0.9 : 0}
              />
              {n.isCenter && (
                <circle
                  r={n.r + 7 * u}
                  fill="none"
                  stroke={color}
                  strokeOpacity={0.35}
                  strokeWidth={1 * u}
                />
              )}
              <circle
                r={n.r}
                fill={color}
                fillOpacity={n.isCenter ? 0.9 : 0.75}
                stroke={color}
                strokeWidth={1 * u}
              />
              {showLabel && (
                <text
                  x={n.labelX - n.x}
                  y={n.labelY - n.y}
                  textAnchor={n.labelAnchor}
                  fontSize={(n.isCenter ? 13 : 10.5) * u}
                  fontWeight={n.isCenter ? 600 : 400}
                  fill={n.isCenter ? '#F3F4F6' : '#D1D5DB'}
                  stroke="#0B0D12"
                  strokeWidth={3 * u}
                  strokeLinejoin="round"
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {short(n.label)}
                </text>
              )}
            </g>
          </g>
        )
      })}
    </g>
  )
})

/**
 * Pure SVG renderer — no animation loop. Re-renders only when the layout,
 * the selection or the hovered node change; pan/zoom mutate `gRef` directly.
 */
export function EntityGraphCanvas({
  layout,
  selectedId,
  hoverId,
  onSelect,
  onHover,
  animate,
  svgRef,
  gRef,
  wasDrag,
  dimmed,
}: EntityGraphCanvasProps) {
  const focusId = hoverId ?? selectedId
  const neighbors = useMemo(() => {
    const s = new Set<string>()
    if (!focusId) return s
    for (const e of layout.edges) {
      if (e.source === focusId) s.add(e.target)
      else if (e.target === focusId) s.add(e.source)
    }
    return s
  }, [layout, focusId])

  const onActivate = useCallback(
    (id: string) => {
      if (wasDrag()) return
      onSelect(id === selectedId ? null : id)
    },
    [wasDrag, onSelect, selectedId]
  )

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${layout.size} ${layout.size}`}
      preserveAspectRatio="xMidYMid meet"
      className={`w-full h-full select-none ${animate ? 'eg-anim' : ''} ${
        dimmed ? 'opacity-60' : ''
      }`}
      style={{ touchAction: 'none', overflow: 'visible' }}
      role="group"
      aria-label="Neighborhood graph"
      onClick={() => {
        if (!wasDrag()) onSelect(null)
      }}
    >
      <style>{MOTION_CSS}</style>
      <g ref={gRef}>
        <Rings layout={layout} />
        <Edges key={layoutKey(layout)} layout={layout} focusId={focusId} />
        <Nodes
          layout={layout}
          selectedId={selectedId}
          focusId={focusId}
          neighbors={neighbors}
          onActivate={onActivate}
          onHover={onHover}
        />
      </g>
    </svg>
  )
}

// Stable identity per layout object → edges remount (and fade in once) only
// when the layout actually changes, never on hover/selection.
const layoutKeys = new WeakMap<RadialLayout, number>()
let nextLayoutKey = 0
function layoutKey(layout: RadialLayout): number {
  let k = layoutKeys.get(layout)
  if (k === undefined) {
    k = ++nextLayoutKey
    layoutKeys.set(layout, k)
  }
  return k
}
