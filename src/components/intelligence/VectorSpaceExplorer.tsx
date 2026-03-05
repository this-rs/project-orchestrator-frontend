// ============================================================================
// VECTOR SPACE EXPLORER — UMAP 2D Projection of Knowledge Embeddings
// ============================================================================
//
// Renders a Canvas-based 2D scatter plot of note/decision embeddings projected
// via UMAP. Points are positioned by their UMAP coordinates, colored by type,
// sized by importance, and have opacity reflecting their energy level.
//
// Phase 1: fetch + render canvas scatter (T5.2 Step 1)
// Phase 2: synapses overlay + skill hulls (T5.2 Step 2)
// Phase 3: interactions — hover, click, lasso, semantic zoom (T5.2 Step 3)
// ============================================================================

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Brain,
  ArrowLeft,
  RefreshCw,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
  StickyNote,
  Scale,
  Sparkles,
  Eye,
  EyeOff,
  X,
  Zap,
  Lasso,
  Check,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/ErrorState'
import { intelligenceApi } from '@/services/intelligence'
import { adminApi } from '@/services/admin'
import { ENTITY_COLORS } from '@/constants/intelligence'
import { useWorkspaceSlug } from '@/hooks'
import { workspacePath } from '@/utils/paths'
import type {
  ProjectionPoint,
  ProjectionSynapse,
  ProjectionSkill,
  EmbeddingsProjectionResponse,
} from '@/types/intelligence'

// ============================================================================
// CONSTANTS
// ============================================================================

const POINT_COLORS: Record<string, string> = {
  note: ENTITY_COLORS.note,       // #F59E0B amber
  decision: ENTITY_COLORS.decision, // #8B5CF6 violet
  skill: ENTITY_COLORS.skill,     // #EC4899 pink
}

const IMPORTANCE_RADIUS: Record<string, number> = {
  critical: 6,
  high: 4.5,
  medium: 3.5,
  low: 2.5,
}

const SYNAPSE_COLOR = '#22D3EE'   // cyan — matches neural layer
const SKILL_HULL_ALPHA = 0.08
const SKILL_BORDER_ALPHA = 0.4

const MIN_ZOOM = 0.1
const MAX_ZOOM = 20
const ZOOM_STEP = 1.25 // for button clicks only

/** Screen-space point radius with subtle logarithmic zoom scaling */
function screenPtRadius(base: number, zoom: number): number {
  return base * Math.min(2, 0.8 + Math.log2(Math.max(1, zoom)) * 0.25)
}

// ============================================================================
// CAMERA (pan + zoom transform)
// ============================================================================

interface Camera {
  x: number
  y: number
  zoom: number
}

function worldToScreen(wx: number, wy: number, cam: Camera): [number, number] {
  return [
    (wx - cam.x) * cam.zoom,
    (wy - cam.y) * cam.zoom,
  ]
}

function screenToWorld(sx: number, sy: number, cam: Camera): [number, number] {
  return [
    sx / cam.zoom + cam.x,
    sy / cam.zoom + cam.y,
  ]
}

// ============================================================================
// HULL — convex hull for skill clusters (Graham scan)
// ============================================================================

function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

  const lower: [number, number][] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }

  const upper: [number, number][] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }

  upper.pop()
  lower.pop()
  return lower.concat(upper)
}

// ============================================================================
// POINT HIT TEST
// ============================================================================

function findPointAtScreen(
  sx: number,
  sy: number,
  points: ProjectionPoint[],
  cam: Camera,
): ProjectionPoint | null {
  // Search in reverse (top-rendered last = highest z)
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]
    const [px, py] = worldToScreen(p.x, p.y, cam)
    const r = screenPtRadius(IMPORTANCE_RADIUS[p.importance] ?? 3.5, cam.zoom)
    const dx = sx - px
    const dy = sy - py
    if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return p
  }
  return null
}

// ============================================================================
// TOOLTIP COMPONENT
// ============================================================================

function Tooltip({
  point,
  x,
  y,
}: {
  point: ProjectionPoint
  x: number
  y: number
}) {
  const typeIcon = point.type === 'note' ? '📝' : point.type === 'decision' ? '⚖️' : '✨'
  const importanceColor =
    point.importance === 'critical' ? '#f87171'
    : point.importance === 'high' ? '#fb923c'
    : point.importance === 'medium' ? '#fbbf24'
    : '#94a3b8'

  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{
        left: x + 12,
        top: y - 8,
        maxWidth: 280,
      }}
    >
      <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700/80 rounded-lg px-3 py-2 shadow-xl">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs">{typeIcon}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: POINT_COLORS[point.type] ?? '#94a3b8' }}>
            {point.type}
          </span>
          <span
            className="ml-auto text-[9px] px-1.5 py-0.5 rounded font-medium"
            style={{ backgroundColor: `${importanceColor}20`, color: importanceColor }}
          >
            {point.importance}
          </span>
        </div>
        <p className="text-[11px] text-slate-300 leading-snug line-clamp-3">
          {point.content_preview || '(no preview)'}
        </p>
        {point.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {point.tags.slice(0, 5).map((t) => (
              <span key={t} className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-500">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1.5 text-[9px] text-slate-600">
          <span>⚡ {(point.energy * 100).toFixed(0)}%</span>
          <span className="font-mono">{point.id.slice(0, 8)}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LEGEND
// ============================================================================

function Legend({
  pointCount,
  synapseCount,
  skillCount,
  method,
  showSynapses,
  showSkills,
  onToggleSynapses,
  onToggleSkills,
}: {
  pointCount: number
  synapseCount: number
  skillCount: number
  method: string
  showSynapses: boolean
  showSkills: boolean
  onToggleSynapses: () => void
  onToggleSkills: () => void
}) {
  return (
    <div className="absolute bottom-4 left-4 z-30">
      <div className="bg-slate-900/90 backdrop-blur-sm border border-slate-700/60 rounded-lg px-3 py-2.5 space-y-2">
        {/* Method badge */}
        <div className="flex items-center gap-1.5">
          <Info size={10} className="text-slate-600" />
          <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">
            {method === 'umap' ? 'UMAP 2D' : method}
          </span>
          <span className="text-[9px] text-slate-600 ml-1">
            {pointCount} points
          </span>
        </div>

        {/* Entity types */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: POINT_COLORS.note }} />
            <span className="text-[10px] text-slate-400">Notes</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: POINT_COLORS.decision }} />
            <span className="text-[10px] text-slate-400">Decisions</span>
          </div>
        </div>

        {/* Importance scale */}
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-600">Size:</span>
          {(['low', 'medium', 'high', 'critical'] as const).map((imp) => (
            <div key={imp} className="flex items-center gap-0.5">
              <div
                className="rounded-full bg-slate-500"
                style={{
                  width: IMPORTANCE_RADIUS[imp] * 2,
                  height: IMPORTANCE_RADIUS[imp] * 2,
                }}
              />
              <span className="text-[8px] text-slate-600">{imp[0].toUpperCase()}</span>
            </div>
          ))}
        </div>

        {/* Overlay toggles */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
          <button
            onClick={onToggleSynapses}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${
              showSynapses
                ? 'bg-cyan-500/15 text-cyan-400'
                : 'bg-slate-800 text-slate-600 hover:text-slate-400'
            }`}
          >
            {showSynapses ? <Eye size={9} /> : <EyeOff size={9} />}
            Synapses ({synapseCount})
          </button>
          <button
            onClick={onToggleSkills}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] transition-colors ${
              showSkills
                ? 'bg-pink-500/15 text-pink-400'
                : 'bg-slate-800 text-slate-600 hover:text-slate-400'
            }`}
          >
            {showSkills ? <Eye size={9} /> : <EyeOff size={9} />}
            Skills ({skillCount})
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// POINT-IN-POLYGON (ray casting) — for lasso selection
// ============================================================================

function pointInPolygon(x: number, y: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

// ============================================================================
// DETAIL PANEL — shows selected point info
// ============================================================================

function DetailPanel({
  point,
  onClose,
}: {
  point: ProjectionPoint
  onClose: () => void
}) {
  const typeIcon = point.type === 'note' ? '📝' : point.type === 'decision' ? '⚖️' : '✨'
  const importanceColor =
    point.importance === 'critical' ? '#f87171'
    : point.importance === 'high' ? '#fb923c'
    : point.importance === 'medium' ? '#fbbf24'
    : '#94a3b8'
  const color = POINT_COLORS[point.type] ?? '#94a3b8'

  return (
    <div className="absolute top-0 right-0 z-40 w-72 h-full bg-slate-900/95 backdrop-blur-sm border-l border-slate-700/80 overflow-y-auto">
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span>{typeIcon}</span>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color }}>
              {point.type}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content preview */}
        <div className="bg-slate-800/60 rounded-lg p-3 border border-slate-700/40">
          <p className="text-[11px] text-slate-300 leading-relaxed">
            {point.content_preview || '(no content)'}
          </p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-800/40 rounded-lg px-2.5 py-2 border border-slate-700/30">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">Energy</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Zap size={10} className="text-cyan-400" />
              <span className="text-sm font-bold text-slate-200 tabular-nums">
                {(point.energy * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-cyan-400"
                style={{ width: `${point.energy * 100}%` }}
              />
            </div>
          </div>
          <div className="bg-slate-800/40 rounded-lg px-2.5 py-2 border border-slate-700/30">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">Importance</p>
            <span
              className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded"
              style={{ backgroundColor: `${importanceColor}20`, color: importanceColor }}
            >
              {point.importance}
            </span>
          </div>
        </div>

        {/* Tags */}
        {point.tags.length > 0 && (
          <div>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Tags</p>
            <div className="flex flex-wrap gap-1">
              {point.tags.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/40 text-slate-400">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Coordinates */}
        <div className="pt-2 border-t border-slate-800">
          <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Position</p>
          <p className="text-[10px] text-slate-500 font-mono">
            x: {point.x.toFixed(3)} · y: {point.y.toFixed(3)}
          </p>
          <p className="text-[10px] text-slate-600 font-mono mt-0.5">
            {point.id}
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// SELECTION BAR — multi-select actions (Reinforce Neurons)
// ============================================================================

function SelectionBar({
  count,
  status,
  message,
  onReinforce,
  onClear,
}: {
  count: number
  status: 'idle' | 'running' | 'success' | 'error'
  message: string
  onReinforce: () => void
  onClear: () => void
}) {
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40">
      <div className="flex items-center gap-2 bg-slate-900/95 backdrop-blur-sm border border-cyan-500/30 rounded-lg px-3 py-2 shadow-xl">
        <span className="text-[11px] text-cyan-400 font-medium">
          {count} selected
        </span>

        {count >= 2 && (
          <button
            onClick={onReinforce}
            disabled={status === 'running'}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 text-[10px] font-medium transition-colors disabled:opacity-50"
          >
            {status === 'running' ? (
              <Loader2 size={10} className="animate-spin" />
            ) : status === 'success' ? (
              <Check size={10} className="text-emerald-400" />
            ) : (
              <Zap size={10} />
            )}
            Reinforce Neurons
          </button>
        )}

        {status === 'success' && message && (
          <span className="text-[10px] text-emerald-400">{message}</span>
        )}
        {status === 'error' && message && (
          <span className="text-[10px] text-red-400">{message}</span>
        )}

        <button
          onClick={onClear}
          className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors ml-1"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// CANVAS RENDERER
// ============================================================================

function renderCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: ProjectionPoint[],
  synapses: ProjectionSynapse[],
  skills: ProjectionSkill[],
  cam: Camera,
  hoveredId: string | null,
  selectedId: string | null,
  selectedIds: Set<string>,
  lassoPoints: [number, number][],
  showSynapses: boolean,
  showSkills: boolean,
) {
  // NOTE: clearRect is done in the draw loop before DPR transform

  // ── Grid dots (subtle) ──────────────────────────────────────────────
  const gridSpacing = cam.zoom < 0.5 ? 200 : cam.zoom < 2 ? 80 : cam.zoom < 6 ? 40 : 20
  ctx.fillStyle = '#1e293b'
  const [gx0, gy0] = screenToWorld(0, 0, cam)
  const [gx1, gy1] = screenToWorld(width, height, cam)
  const startX = Math.floor(gx0 / gridSpacing) * gridSpacing
  const startY = Math.floor(gy0 / gridSpacing) * gridSpacing
  for (let x = startX; x <= gx1; x += gridSpacing) {
    for (let y = startY; y <= gy1; y += gridSpacing) {
      const [sx, sy] = worldToScreen(x, y, cam)
      ctx.fillRect(sx - 0.5, sy - 0.5, 1, 1)
    }
  }

  // ── Skill hulls (behind everything) ─────────────────────────────────
  if (showSkills && skills.length > 0) {
    const pointMap = new Map(points.map((p) => [p.id, p]))

    for (const skill of skills) {
      const memberCoords = skill.member_ids
        .map((id) => pointMap.get(id))
        .filter((p): p is ProjectionPoint => p != null)
        .map((p): [number, number] => [p.x, p.y])

      if (memberCoords.length < 2) continue

      // Add padding around hull points
      const hull = convexHull(memberCoords)
      if (hull.length < 2) continue

      // Compute centroid for label
      const cx = hull.reduce((s, h) => s + h[0], 0) / hull.length
      const cy = hull.reduce((s, h) => s + h[1], 0) / hull.length

      // Expand hull outward for visual padding
      const padded = hull.map(([hx, hy]): [number, number] => {
        const dx = hx - cx
        const dy = hy - cy
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        return [hx + (dx / d) * 15, hy + (dy / d) * 15]
      })

      // Draw filled hull
      ctx.beginPath()
      const [f0x, f0y] = worldToScreen(padded[0][0], padded[0][1], cam)
      ctx.moveTo(f0x, f0y)
      for (let i = 1; i < padded.length; i++) {
        const [fx, fy] = worldToScreen(padded[i][0], padded[i][1], cam)
        ctx.lineTo(fx, fy)
      }
      ctx.closePath()

      const skillColor = ENTITY_COLORS.skill
      ctx.fillStyle = `${skillColor}${Math.round(SKILL_HULL_ALPHA * 255).toString(16).padStart(2, '0')}`
      ctx.fill()
      ctx.strokeStyle = `${skillColor}${Math.round(SKILL_BORDER_ALPHA * 255).toString(16).padStart(2, '0')}`
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Skill label at centroid
      const [lcx, lcy] = worldToScreen(cx, cy, cam)
      ctx.font = `bold ${Math.max(8, Math.min(13, 10 * Math.sqrt(cam.zoom)))}px ui-sans-serif, system-ui, sans-serif`
      ctx.fillStyle = `${skillColor}99`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(skill.name, lcx, lcy)
    }
  }

  // ── Synapses (edges between points) ─────────────────────────────────
  if (showSynapses && synapses.length > 0) {
    const pointMap = new Map(points.map((p) => [p.id, p]))

    for (const syn of synapses) {
      const src = pointMap.get(syn.source)
      const tgt = pointMap.get(syn.target)
      if (!src || !tgt) continue

      const [sx, sy] = worldToScreen(src.x, src.y, cam)
      const [tx, ty] = worldToScreen(tgt.x, tgt.y, cam)

      // Only render if at least partially on screen
      if (
        Math.max(sx, tx) < -50 || Math.min(sx, tx) > width + 50 ||
        Math.max(sy, ty) < -50 || Math.min(sy, ty) > height + 50
      ) continue

      const alpha = Math.max(0.05, Math.min(0.6, syn.weight))
      const isHighlighted = hoveredId != null && (syn.source === hoveredId || syn.target === hoveredId)

      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(tx, ty)
      ctx.strokeStyle = isHighlighted
        ? `${SYNAPSE_COLOR}cc`
        : `${SYNAPSE_COLOR}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
      ctx.lineWidth = isHighlighted ? 1.5 : Math.max(0.3, syn.weight * 1.5)
      ctx.stroke()
    }
  }

  // ── Points ──────────────────────────────────────────────────────────
  for (const point of points) {
    const [sx, sy] = worldToScreen(point.x, point.y, cam)
    const baseR = IMPORTANCE_RADIUS[point.importance] ?? 3.5
    const r = screenPtRadius(baseR, cam.zoom)

    // Frustum culling (screen-space radius + margin)
    if (sx + r + 6 < 0 || sx - r - 6 > width || sy + r + 6 < 0 || sy - r - 6 > height) continue

    const color = POINT_COLORS[point.type] ?? '#94a3b8'
    const energyAlpha = Math.max(0.25, Math.min(1, point.energy))
    const isHovered = point.id === hoveredId
    const isSelected = point.id === selectedId
    const isInSelection = selectedIds.has(point.id)

    // Glow for hovered / selected / multi-selected point
    if (isHovered || isSelected || isInSelection) {
      ctx.beginPath()
      ctx.arc(sx, sy, r + (isSelected ? 5 : 4), 0, Math.PI * 2)
      ctx.fillStyle = isInSelection ? '#22d3ee20' : `${color}25`
      ctx.fill()
    }

    // Main circle
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    const hexAlpha = Math.round(energyAlpha * 255).toString(16).padStart(2, '0')
    ctx.fillStyle = `${color}${hexAlpha}`
    ctx.fill()

    // Border ring
    ctx.strokeStyle = isSelected ? '#f0f0f0' : isInSelection ? '#22d3ee' : isHovered ? '#ffffff' : `${color}66`
    ctx.lineWidth = isSelected ? 1.5 : isInSelection ? 1 : isHovered ? 1.5 : 0.5
    ctx.stroke()

    // Semantic zoom: show labels at high zoom levels
    if (cam.zoom > 4 && point.content_preview) {
      const label = point.content_preview.length > 50
        ? point.content_preview.slice(0, 47) + '…'
        : point.content_preview
      ctx.font = '10px ui-sans-serif, system-ui, sans-serif'
      ctx.fillStyle = '#94a3b8aa'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, sx + r + 4, sy)
    }
  }

  // ── Lasso overlay ────────────────────────────────────────────────────
  if (lassoPoints.length > 1) {
    ctx.beginPath()
    ctx.moveTo(lassoPoints[0][0], lassoPoints[0][1])
    for (let i = 1; i < lassoPoints.length; i++) {
      ctx.lineTo(lassoPoints[i][0], lassoPoints[i][1])
    }
    ctx.closePath()
    ctx.fillStyle = '#22d3ee10'
    ctx.fill()
    ctx.strokeStyle = '#22d3ee66'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 3])
    ctx.stroke()
    ctx.setLineDash([])
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function VectorSpaceExplorer() {
  const { projectSlug } = useParams<{ projectSlug: string }>()
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()

  // State
  const [data, setData] = useState<EmbeddingsProjectionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Camera
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })

  // Interaction state
  const [hoveredPoint, setHoveredPoint] = useState<ProjectionPoint | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<ProjectionPoint | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null)
  const didDrag = useRef(false)

  // Lasso selection
  const [lassoMode, setLassoMode] = useState(false)
  const [isLassoing, setIsLassoing] = useState(false)
  const [lassoPoints, setLassoPoints] = useState<[number, number][]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reinforce action
  const [reinforceStatus, setReinforceStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [reinforceMessage, setReinforceMessage] = useState('')

  // Layer toggles
  const [showSynapses, setShowSynapses] = useState(true)
  const [showSkills, setShowSkills] = useState(true)

  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number>(0)

  // ── Fetch data ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!projectSlug) return
    setError(null)
    try {
      const result = await intelligenceApi.getEmbeddingsProjection(projectSlug)
      setData(result)

      // Auto-fit camera to data bounds
      if (result.points.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
        for (const p of result.points) {
          if (p.x < minX) minX = p.x
          if (p.x > maxX) maxX = p.x
          if (p.y < minY) minY = p.y
          if (p.y > maxY) maxY = p.y
        }
        const canvas = canvasRef.current
        const dpr = window.devicePixelRatio || 1
        const w = canvas ? canvas.width / dpr : 800
        const h = canvas ? canvas.height / dpr : 600
        const dx = maxX - minX || 1
        const dy = maxY - minY || 1
        const padding = 60
        const zoom = Math.min(
          (w - padding * 2) / dx,
          (h - padding * 2) / dy,
          MAX_ZOOM,
        )
        setCamera({
          x: minX - padding / zoom,
          y: minY - padding / zoom,
          zoom: Math.max(MIN_ZOOM, zoom),
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projection data')
    }
  }, [projectSlug])

  useEffect(() => {
    setLoading(true)
    fetchData().finally(() => setLoading(false))
  }, [fetchData])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }, [fetchData])

  // ── Canvas resize ─────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width === 0 || height === 0) continue
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // ── Render loop ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr

      // Reset transform and apply DPR scaling each frame
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      renderCanvas(
        ctx, w, h,
        data.points,
        data.synapses,
        data.skills,
        camera,
        hoveredPoint?.id ?? null,
        selectedPoint?.id ?? null,
        selectedIds,
        lassoPoints,
        showSynapses,
        showSkills,
      )
      animFrameRef.current = requestAnimationFrame(draw)
    }
    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [data, camera, hoveredPoint, selectedPoint, selectedIds, lassoPoints, showSynapses, showSkills])

  // ── Reinforce neurons action ──────────────────────────────────────────
  const handleReinforce = useCallback(async () => {
    if (selectedIds.size < 2) return
    setReinforceStatus('running')
    setReinforceMessage('')
    try {
      // Only send note IDs (reinforce API requires notes)
      const noteIds = [...selectedIds].filter((id) => {
        const p = data?.points.find((pt) => pt.id === id)
        return p?.type === 'note'
      })
      if (noteIds.length < 2) {
        setReinforceStatus('error')
        setReinforceMessage('Need at least 2 notes (not decisions) to reinforce')
        return
      }
      const r = await adminApi.reinforceNeurons({ note_ids: noteIds })
      setReinforceStatus('success')
      setReinforceMessage(`${r.neurons_boosted} boosted, ${r.synapses_reinforced} synapses`)
      setTimeout(() => {
        setReinforceStatus('idle')
        setReinforceMessage('')
      }, 4000)
    } catch (err) {
      setReinforceStatus('error')
      setReinforceMessage(err instanceof Error ? err.message : 'Reinforce failed')
    }
  }, [selectedIds, data])

  // ── Lasso: compute selected points from lasso polygon ──────────────
  const finalizeLasso = useCallback(
    (screenPolygon: [number, number][]) => {
      if (!data || screenPolygon.length < 3) {
        setLassoPoints([])
        setIsLassoing(false)
        return
      }
      const ids = new Set<string>()
      for (const p of data.points) {
        const [sx, sy] = worldToScreen(p.x, p.y, camera)
        if (pointInPolygon(sx, sy, screenPolygon)) {
          ids.add(p.id)
        }
      }
      setSelectedIds(ids)
      setLassoPoints([])
      setIsLassoing(false)
      // Exit lasso mode after selection
      if (ids.size > 0) setLassoMode(false)
    },
    [data, camera],
  )

  // ── Mouse handlers ────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect || !data) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setMousePos({ x: mx, y: my })

      // Lasso drawing
      if (isLassoing && lassoMode) {
        setLassoPoints((prev) => [...prev, [mx, my]])
        return
      }

      if (isPanning && panStart.current) {
        didDrag.current = true
        const dx = (mx - panStart.current.x) / camera.zoom
        const dy = (my - panStart.current.y) / camera.zoom
        setCamera((c) => ({
          ...c,
          x: panStart.current!.camX - dx,
          y: panStart.current!.camY - dy,
        }))
        return
      }

      const hit = findPointAtScreen(mx, my, data.points, camera)
      setHoveredPoint(hit)
    },
    [data, camera, isPanning, isLassoing, lassoMode],
  )

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // Start lasso
      if (lassoMode) {
        setIsLassoing(true)
        setLassoPoints([[mx, my]])
        setSelectedIds(new Set())
        return
      }

      // Normal pan
      didDrag.current = false
      setIsPanning(true)
      panStart.current = {
        x: mx,
        y: my,
        camX: camera.x,
        camY: camera.y,
      }
    },
    [camera, lassoMode],
  )

  const handleMouseUp = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      // Finalize lasso
      if (isLassoing && lassoPoints.length > 2) {
        finalizeLasso(lassoPoints)
        return
      }

      // Click (not drag) → select/deselect point
      if (!didDrag.current && !lassoMode && data) {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (rect) {
          const mx = e.clientX - rect.left
          const my = e.clientY - rect.top
          const hit = findPointAtScreen(mx, my, data.points, camera)
          if (hit) {
            setSelectedPoint((prev) => prev?.id === hit.id ? null : hit)
            setSelectedIds(new Set()) // clear lasso selection on click
          } else {
            setSelectedPoint(null)
          }
        }
      }

      setIsPanning(false)
      panStart.current = null
    },
    [data, camera, isLassoing, lassoPoints, lassoMode, finalizeLasso],
  )

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // World position under cursor before zoom
      const [wx, wy] = screenToWorld(mx, my, camera)

      // Continuous zoom: proportional to scroll delta for smooth trackpad support
      const factor = Math.pow(1.001, -e.deltaY)
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor))

      // Adjust camera so the same world point stays under cursor
      setCamera({
        x: wx - mx / newZoom,
        y: wy - my / newZoom,
        zoom: newZoom,
      })
    },
    [camera],
  )

  // Attach wheel listener (passive: false for preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Zoom controls ─────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    setCamera((c) => {
      const canvas = canvasRef.current
      if (!canvas) return c
      const dpr = window.devicePixelRatio || 1
      const cx = canvas.width / dpr / 2
      const cy = canvas.height / dpr / 2
      const [wx, wy] = screenToWorld(cx, cy, c)
      const newZoom = Math.min(MAX_ZOOM, c.zoom * ZOOM_STEP)
      return { x: wx - cx / newZoom, y: wy - cy / newZoom, zoom: newZoom }
    })
  }, [])

  const zoomOut = useCallback(() => {
    setCamera((c) => {
      const canvas = canvasRef.current
      if (!canvas) return c
      const dpr = window.devicePixelRatio || 1
      const cx = canvas.width / dpr / 2
      const cy = canvas.height / dpr / 2
      const [wx, wy] = screenToWorld(cx, cy, c)
      const newZoom = Math.max(MIN_ZOOM, c.zoom / ZOOM_STEP)
      return { x: wx - cx / newZoom, y: wy - cy / newZoom, zoom: newZoom }
    })
  }, [])

  const fitAll = useCallback(() => {
    if (!data || data.points.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of data.points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    const dx = maxX - minX || 1
    const dy = maxY - minY || 1
    const padding = 60
    const zoom = Math.min((w - padding * 2) / dx, (h - padding * 2) / dy, MAX_ZOOM)
    setCamera({
      x: minX - padding / zoom,
      y: minY - padding / zoom,
      zoom: Math.max(MIN_ZOOM, zoom),
    })
  }, [data])

  // ── Stats ─────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data) return null
    const notes = data.points.filter((p) => p.type === 'note').length
    const decisions = data.points.filter((p) => p.type === 'decision').length
    const avgEnergy = data.points.length > 0
      ? data.points.reduce((s, p) => s + p.energy, 0) / data.points.length
      : 0
    return { notes, decisions, avgEnergy }
  }, [data])

  // ── Loading / Error ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="text-cyan-400 animate-spin" />
          <p className="text-sm text-slate-500">Loading UMAP projection…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return <ErrorState description={error} onRetry={handleRefresh} />
  }

  if (!data || data.points.length === 0) {
    return (
      <div className="py-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <button
            onClick={() => navigate(workspacePath(wsSlug, `/projects/${projectSlug}/intelligence`))}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={14} />
            Dashboard
          </button>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <Brain size={40} className="text-slate-700" />
              <p className="text-sm font-medium">No embeddings available</p>
              <p className="text-xs text-slate-600">
                Notes and decisions need embeddings to project. Run &quot;Backfill Synapses&quot; from the Intelligence Dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col -mx-4 md:-mx-6 -mb-2" style={{ height: 'calc(100dvh - 5rem)' }}>
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(workspacePath(wsSlug, `/projects/${projectSlug}/intelligence`))}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft size={14} />
          </button>
          <div>
            <h1 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
              <Brain size={16} className="text-cyan-400" />
              Vector Space Explorer
            </h1>
            <p className="text-[10px] text-slate-600">
              UMAP 2D projection of knowledge embeddings
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick stats */}
          {stats && (
            <div className="flex items-center gap-3 mr-3">
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <StickyNote size={10} className="text-amber-500" />
                {stats.notes}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <Scale size={10} className="text-violet-500" />
                {stats.decisions}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                <Sparkles size={10} className="text-pink-500" />
                {data.skills.length}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-slate-500">
                ⚡ {(stats.avgEnergy * 100).toFixed(0)}%
              </div>
            </div>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Canvas Area ───────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-[#0c1322] overflow-hidden touch-none select-none"
        style={{
          cursor: lassoMode
            ? 'crosshair'
            : isPanning
              ? 'grabbing'
              : hoveredPoint
                ? 'pointer'
                : 'grab',
        }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (isLassoing) finalizeLasso(lassoPoints)
            setIsPanning(false)
            panStart.current = null
            setHoveredPoint(null)
          }}
        />

        {/* Tooltip (only when not in lasso mode and no selection panel) */}
        {hoveredPoint && !isPanning && !isLassoing && !selectedPoint && (
          <Tooltip point={hoveredPoint} x={mousePos.x} y={mousePos.y} />
        )}

        {/* Selection bar (multi-select via lasso) */}
        {selectedIds.size > 0 && (
          <SelectionBar
            count={selectedIds.size}
            status={reinforceStatus}
            message={reinforceMessage}
            onReinforce={handleReinforce}
            onClear={() => { setSelectedIds(new Set()); setReinforceStatus('idle') }}
          />
        )}

        {/* Detail panel (single click selection) */}
        {selectedPoint && (
          <DetailPanel
            point={selectedPoint}
            onClose={() => setSelectedPoint(null)}
          />
        )}

        {/* Legend */}
        <Legend
          pointCount={data.points.length}
          synapseCount={data.synapses.length}
          skillCount={data.skills.length}
          method={data.method}
          showSynapses={showSynapses}
          showSkills={showSkills}
          onToggleSynapses={() => setShowSynapses((v) => !v)}
          onToggleSkills={() => setShowSkills((v) => !v)}
        />

        {/* Zoom + Lasso controls */}
        <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-1">
          <button
            onClick={() => {
              setLassoMode((v) => !v)
              if (lassoMode) { setLassoPoints([]); setIsLassoing(false) }
            }}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors ${
              lassoMode
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400'
                : 'bg-slate-800/90 border-slate-700/60 text-slate-400 hover:text-slate-300 hover:bg-slate-700'
            }`}
            title={lassoMode ? 'Exit lasso mode' : 'Lasso select (multi-select)'}
          >
            <Lasso size={14} />
          </button>
          <div className="h-px bg-slate-800 my-0.5" />
          <button
            onClick={zoomIn}
            className="w-8 h-8 rounded-lg bg-slate-800/90 border border-slate-700/60 flex items-center justify-center text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={zoomOut}
            className="w-8 h-8 rounded-lg bg-slate-800/90 border border-slate-700/60 flex items-center justify-center text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={fitAll}
            className="w-8 h-8 rounded-lg bg-slate-800/90 border border-slate-700/60 flex items-center justify-center text-slate-400 hover:text-slate-300 hover:bg-slate-700 transition-colors"
            title="Fit all"
          >
            <Maximize2 size={14} />
          </button>
        </div>

        {/* Zoom level + semantic zoom indicator */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2 text-[9px] font-mono bg-slate-900/60 px-2 py-1 rounded">
          <span className="text-slate-600">{(camera.zoom * 100).toFixed(0)}%</span>
          {camera.zoom > 2.5 && (
            <span className="text-cyan-600">semantic</span>
          )}
        </div>
      </div>
    </div>
  )
}
