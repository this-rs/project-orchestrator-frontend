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
  lazy,
  Suspense,
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
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
  Maximize,
  Minimize,
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
  Grid3x3,
  Box,
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

// Lazy-load the 3D component — Three.js only loaded when needed
const VectorSpace3D = lazy(() => import('./vectorspace3d/VectorSpace3D'))

type ViewMode = '2d' | '3d'

// ============================================================================
// CONSTANTS
// ============================================================================

const POINT_COLORS: Record<string, string> = {
  note: ENTITY_COLORS.note,       // #F59E0B amber
  decision: ENTITY_COLORS.decision, // #8B5CF6 violet
  skill: ENTITY_COLORS.skill,     // #EC4899 pink
}

const WORLD_SIZE = 1000 // Normalize UMAP coords to this range for natural zoom levels

const IMPORTANCE_RADIUS: Record<string, number> = {
  critical: 10,
  high: 8,
  medium: 6,
  low: 4.5,
}

const SYNAPSE_COLOR = '#22D3EE'   // cyan — matches neural layer
const SKILL_HULL_ALPHA = 0.08
const SKILL_BORDER_ALPHA = 0.4

const MIN_ZOOM = 0.1
const MAX_ZOOM = 20
const ZOOM_STEP = 1.25 // for button clicks only
const DRAG_THRESHOLD_SQ = 25 // 5px euclidean distance squared
const PAN_FRICTION = 0.92
const PAN_REST_THRESHOLD = 0.5
const VEL_SAMPLES = 4
const ZOOM_ANIM_MS = 250

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/** Fixed screen-space point radius — zoom changes spacing, not dot size */
function screenPtRadius(base: number, _zoom: number): number {
  return base
}

/** Smooth a closed polygon via Chaikin's corner-cutting (2 iterations) */
function smoothPolygon(pts: [number, number][], iterations = 2): [number, number][] {
  let points = pts
  for (let iter = 0; iter < iterations; iter++) {
    const smoothed: [number, number][] = []
    for (let i = 0; i < points.length; i++) {
      const p0 = points[i]
      const p1 = points[(i + 1) % points.length]
      smoothed.push([p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25])
      smoothed.push([p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75])
    }
    points = smoothed
  }
  return points
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

function findSkillAtScreen(
  sx: number,
  sy: number,
  skills: ProjectionSkill[],
  points: ProjectionPoint[],
  cam: Camera,
): ProjectionSkill | null {
  const pointMap = new Map(points.map((p) => [p.id, p]))
  for (const skill of skills) {
    const worldCoords = skill.member_ids
      .map((id) => pointMap.get(id))
      .filter((p): p is ProjectionPoint => p != null)
      .map((p): [number, number] => [p.x, p.y])
    if (worldCoords.length < 3) continue
    const hull = convexHull(worldCoords)
    if (hull.length < 3) continue
    const cx = hull.reduce((s, h) => s + h[0], 0) / hull.length
    const cy = hull.reduce((s, h) => s + h[1], 0) / hull.length
    const padded = hull.map(([hx, hy]): [number, number] => {
      const dx = hx - cx
      const dy = hy - cy
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      return [hx + (dx / d) * 15, hy + (dy / d) * 15]
    })
    const screenHull = padded.map(([hx, hy]): [number, number] => worldToScreen(hx, hy, cam))
    if (pointInPolygon(sx, sy, screenHull)) return skill
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
            {method === 'umap' ? 'UMAP 2D' : method === 'umap_3d' ? 'UMAP 3D' : method}
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
            x: {point.x.toFixed(3)} · y: {point.y.toFixed(3)}{point.z != null ? ` · z: ${point.z.toFixed(3)}` : ''}
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

  // ── Grid dots (batched single path, density-capped) ────────────────
  const gridSpacing = cam.zoom < 0.5 ? 200 : cam.zoom < 2 ? 80 : cam.zoom < 6 ? 40 : 20
  const [gx0, gy0] = screenToWorld(0, 0, cam)
  const [gx1, gy1] = screenToWorld(width, height, cam)
  const startX = Math.floor(gx0 / gridSpacing) * gridSpacing
  const startY = Math.floor(gy0 / gridSpacing) * gridSpacing
  const gridCols = Math.ceil((gx1 - startX) / gridSpacing)
  const gridRows = Math.ceil((gy1 - startY) / gridSpacing)

  if (gridCols * gridRows < 6000) {
    ctx.fillStyle = '#1e293b'
    ctx.beginPath()
    for (let x = startX; x <= gx1; x += gridSpacing) {
      for (let y = startY; y <= gy1; y += gridSpacing) {
        const [sx, sy] = worldToScreen(x, y, cam)
        ctx.rect(sx - 0.5, sy - 0.5, 1, 1)
      }
    }
    ctx.fill()
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

      // Draw filled hull (smoothed with Chaikin's corner-cutting)
      const smoothed = smoothPolygon(padded)
      ctx.beginPath()
      const [f0x, f0y] = worldToScreen(smoothed[0][0], smoothed[0][1], cam)
      ctx.moveTo(f0x, f0y)
      for (let i = 1; i < smoothed.length; i++) {
        const [fx, fy] = worldToScreen(smoothed[i][0], smoothed[i][1], cam)
        ctx.lineTo(fx, fy)
      }
      ctx.closePath()

      // Check if this skill is "active" (any member selected)
      const isSkillActive = selectedIds.size > 0 &&
        skill.member_ids.some(id => selectedIds.has(id))

      const skillColor = ENTITY_COLORS.skill
      const fillAlpha = isSkillActive ? 0.25 : SKILL_HULL_ALPHA
      const borderAlpha = isSkillActive ? 0.9 : SKILL_BORDER_ALPHA
      ctx.fillStyle = `${skillColor}${Math.round(fillAlpha * 255).toString(16).padStart(2, '0')}`
      ctx.fill()
      ctx.strokeStyle = `${skillColor}${Math.round(borderAlpha * 255).toString(16).padStart(2, '0')}`
      ctx.lineWidth = isSkillActive ? 2.5 : 1.5
      ctx.setLineDash(isSkillActive ? [] : [6, 4])
      ctx.stroke()
      ctx.setLineDash([])

      // Skill label at centroid
      const [lcx, lcy] = worldToScreen(cx, cy, cam)
      const fontSize = Math.max(9, Math.min(13, 10 * Math.sqrt(cam.zoom)))
      ctx.font = `${isSkillActive ? 700 : 600} ${fontSize}px -apple-system, system-ui, sans-serif`
      ctx.fillStyle = isSkillActive ? `${skillColor}ff` : `${skillColor}99`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(skill.name, lcx, lcy)
    }
  }

  // ── Synapses (batched path rendering) ────────────────────────────────
  if (showSynapses && synapses.length > 0) {
    const pointMap = new Map(points.map((p) => [p.id, p]))
    const highlighted: { sx: number; sy: number; tx: number; ty: number }[] = []

    // Batch all non-highlighted synapses into a single path
    ctx.beginPath()
    for (const syn of synapses) {
      const src = pointMap.get(syn.source)
      const tgt = pointMap.get(syn.target)
      if (!src || !tgt) continue

      const [sx, sy] = worldToScreen(src.x, src.y, cam)
      const [tx, ty] = worldToScreen(tgt.x, tgt.y, cam)

      if (Math.max(sx, tx) < -50 || Math.min(sx, tx) > width + 50 ||
          Math.max(sy, ty) < -50 || Math.min(sy, ty) > height + 50) continue

      const isConnected =
        (hoveredId != null && (syn.source === hoveredId || syn.target === hoveredId)) ||
        (selectedId != null && (syn.source === selectedId || syn.target === selectedId))
      if (isConnected) {
        highlighted.push({ sx, sy, tx, ty })
        continue
      }
      ctx.moveTo(sx, sy)
      ctx.lineTo(tx, ty)
    }
    ctx.strokeStyle = `${SYNAPSE_COLOR}25`
    ctx.lineWidth = 0.5
    ctx.stroke()

    // Highlighted synapses in separate batch
    if (highlighted.length > 0) {
      ctx.beginPath()
      for (const { sx, sy, tx, ty } of highlighted) {
        ctx.moveTo(sx, sy)
        ctx.lineTo(tx, ty)
      }
      ctx.strokeStyle = `${SYNAPSE_COLOR}cc`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  // ── Points (Pass 1: circles + borders) ──────────────────────────────
  const showLabels = cam.zoom > 2

  for (const point of points) {
    const [sx, sy] = worldToScreen(point.x, point.y, cam)
    const baseR = IMPORTANCE_RADIUS[point.importance] ?? 4
    const r = screenPtRadius(baseR, cam.zoom)

    // Frustum culling
    if (sx + r + 8 < 0 || sx - r - 8 > width || sy + r + 8 < 0 || sy - r - 8 > height) continue

    const color = POINT_COLORS[point.type] ?? '#94a3b8'
    const energyAlpha = Math.max(0.3, Math.min(1, point.energy))
    const isHovered = point.id === hoveredId
    const isSelected = point.id === selectedId
    const isInSelection = selectedIds.has(point.id)

    // Glow for hovered / selected / multi-selected point
    if (isHovered || isSelected || isInSelection) {
      ctx.beginPath()
      ctx.arc(sx, sy, r + (isSelected ? 6 : 5), 0, Math.PI * 2)
      ctx.fillStyle = isInSelection ? '#22d3ee25' : `${color}30`
      ctx.fill()
    }

    // Main circle
    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    const hexAlpha = Math.round(energyAlpha * 255).toString(16).padStart(2, '0')
    ctx.fillStyle = `${color}${hexAlpha}`
    ctx.fill()

    // Border ring (always drawn — thicker for crispness)
    ctx.strokeStyle = isSelected ? '#f0f0f0' : isInSelection ? '#22d3ee' : isHovered ? '#ffffff' : `${color}88`
    ctx.lineWidth = isSelected ? 2 : isInSelection ? 1.5 : isHovered ? 2 : 1
    ctx.stroke()
  }

  // ── Points (Pass 2: labels on top of ALL circles) ──────────────────
  if (showLabels) {
    ctx.font = '10px -apple-system, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    for (const point of points) {
      if (!point.content_preview) continue
      const [sx, sy] = worldToScreen(point.x, point.y, cam)
      // Frustum culling (labels extend rightward)
      if (sx > width + 10 || sx < -200 || sy < -10 || sy > height + 10) continue

      const baseR = IMPORTANCE_RADIUS[point.importance] ?? 4
      const r = screenPtRadius(baseR, cam.zoom)
      const isHovered = point.id === hoveredId
      const isSelected = point.id === selectedId

      const maxLen = cam.zoom > 6 ? 60 : cam.zoom > 3 ? 35 : 20
      const label = point.content_preview.length > maxLen
        ? point.content_preview.slice(0, maxLen - 1) + '…'
        : point.content_preview
      ctx.fillStyle = isHovered || isSelected ? '#e2e8f0' : '#94a3b8aa'
      ctx.fillText(label, sx + r + 5, sy)
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

interface VectorSpaceExplorerProps {
  /** When true, hides back navigation header and adapts height for inline embedding */
  embedded?: boolean
  /** Explicit slug — avoids useParams when embedded */
  projectSlug?: string
}

export default function VectorSpaceExplorer(props: VectorSpaceExplorerProps) {
  const params = useParams<{ projectSlug: string }>()
  const projectSlug = props.projectSlug ?? params.projectSlug
  const wsSlug = useWorkspaceSlug()
  const navigate = useNavigate()

  // State (React — for overlay UI only)
  const [data, setData] = useState<EmbeddingsProjectionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [hoveredPoint, setHoveredPoint] = useState<ProjectionPoint | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<ProjectionPoint | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lassoMode, setLassoMode] = useState(false)
  const [reinforceStatus, setReinforceStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [reinforceMessage, setReinforceMessage] = useState('')
  const [showSynapses, setShowSynapses] = useState(true)
  const [showSkills, setShowSkills] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const fullscreenRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = useCallback(() => {
    if (!fullscreenRef.current) return
    if (!document.fullscreenElement) {
      fullscreenRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // ── Imperative render state (refs — bypasses React for smooth canvas) ─
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)
  const panStart = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null)
  const didDrag = useRef(false)
  const isPanningRef = useRef(false)
  const isLassoingRef = useRef(false)
  const wheelSyncRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHoverTime = useRef(0)
  const velHistory = useRef<{ x: number; y: number }[]>([])
  const inertiaRafRef = useRef(0)
  const animRafRef = useRef(0)
  const zoomDisplayRef = useRef<HTMLSpanElement>(null)
  const semanticDisplayRef = useRef<HTMLSpanElement>(null)
  const needsAutoFit = useRef(true)

  // Mutable render state — read by scheduleFrame, updated imperatively
  const rs = useRef({
    camera: { x: 0, y: 0, zoom: 1 } as Camera,
    hoveredId: null as string | null,
    selectedId: null as string | null,
    selectedIds: new Set<string>(),
    lassoPoints: [] as [number, number][],
    showSynapses: true,
    showSkills: true,
  })

  // Keep render state in sync with React state (cold path)
  rs.current.selectedId = selectedPoint?.id ?? null
  rs.current.selectedIds = selectedIds
  rs.current.showSynapses = showSynapses
  rs.current.showSkills = showSkills

  // ── scheduleFrame: coalesced imperative draw ───────────────────────────
  const scheduleFrame = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (!canvas || !data) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      renderCanvas(
        ctx, w, h,
        data.points, data.synapses, data.skills,
        rs.current.camera, rs.current.hoveredId, rs.current.selectedId,
        rs.current.selectedIds, rs.current.lassoPoints,
        rs.current.showSynapses, rs.current.showSkills,
      )
      // Imperatively update zoom HUD (bypasses React render cycle)
      if (zoomDisplayRef.current) {
        zoomDisplayRef.current.textContent = `${(rs.current.camera.zoom * 100).toFixed(0)}%`
      }
      if (semanticDisplayRef.current) {
        semanticDisplayRef.current.style.display = rs.current.camera.zoom > 2.5 ? '' : 'none'
      }
    })
  }, [data])

  // ── Animated camera transitions (easeOutCubic) ─────────────────────
  const animateCamera = useCallback((target: Camera, durationMs = ZOOM_ANIM_MS) => {
    cancelAnimationFrame(animRafRef.current)
    cancelAnimationFrame(inertiaRafRef.current)
    const start = { ...rs.current.camera }
    const startTime = performance.now()

    function tick(now: number) {
      const elapsed = now - startTime
      const rawT = Math.min(elapsed / durationMs, 1)
      const t = easeOutCubic(rawT)
      rs.current.camera = {
        x: start.x + (target.x - start.x) * t,
        y: start.y + (target.y - start.y) * t,
        zoom: start.zoom + (target.zoom - start.zoom) * t,
      }
      scheduleFrame()
      if (rawT < 1) {
        animRafRef.current = requestAnimationFrame(tick)
      }
    }

    animRafRef.current = requestAnimationFrame(tick)
  }, [scheduleFrame])

  // ── Pan inertia (friction decay after drag release) ────────────────
  const startInertia = useCallback((initialVel: { x: number; y: number }) => {
    cancelAnimationFrame(inertiaRafRef.current)
    const vel = { ...initialVel }

    function tick() {
      vel.x *= PAN_FRICTION
      vel.y *= PAN_FRICTION
      if (Math.abs(vel.x) + Math.abs(vel.y) < PAN_REST_THRESHOLD) return
      const cam = rs.current.camera
      rs.current.camera = {
        ...cam,
        x: cam.x - vel.x / cam.zoom,
        y: cam.y - vel.y / cam.zoom,
      }
      scheduleFrame()
      inertiaRafRef.current = requestAnimationFrame(tick)
    }

    inertiaRafRef.current = requestAnimationFrame(tick)
  }, [scheduleFrame])

  // ── Fetch data ────────────────────────────────────────────────────────
  const fetchData = useCallback(async (dims: 2 | 3 = 2): Promise<number> => {
    if (!projectSlug) return 0
    setError(null)
    try {
      const result = await intelligenceApi.getEmbeddingsProjection(projectSlug, dims)

      // ── Normalize UMAP coordinates to [0, WORLD_SIZE] ──────────────
      // Uses percentile-based bounds (2% trim each side) to ignore outliers
      // that compress the main point cloud into a tiny region.
      // NOTE: In 3D mode, VectorSpace3D handles its own normalization.
      if (result.points.length > 0 && dims === 2) {
        const TRIM = 0.02 // trim 2% outliers on each side
        const lo = Math.floor(result.points.length * TRIM)
        const hi = Math.max(lo, result.points.length - 1 - lo)

        const xs = result.points.map(p => p.x).sort((a, b) => a - b)
        const ys = result.points.map(p => p.y).sort((a, b) => a - b)

        const rMinX = xs[lo], rMaxX = xs[hi]
        const rMinY = ys[lo], rMaxY = ys[hi]

        const rangeX = rMaxX - rMinX || 1
        const rangeY = rMaxY - rMinY || 1
        const maxRange = Math.max(rangeX, rangeY)
        const scale = WORLD_SIZE / maxRange
        // Center the smaller axis so data is visually centered
        const offsetX = (WORLD_SIZE - rangeX * scale) / 2
        const offsetY = (WORLD_SIZE - rangeY * scale) / 2
        for (const p of result.points) {
          // Clamp outliers to percentile bounds before scaling
          const cx = Math.max(rMinX, Math.min(rMaxX, p.x))
          const cy = Math.max(rMinY, Math.min(rMaxY, p.y))
          p.x = (cx - rMinX) * scale + offsetX
          p.y = (cy - rMinY) * scale + offsetY
        }

        // ── Auto-fit camera to normalized bounds ──────────────────────
        // Canvas may not be in DOM yet (loading spinner is shown).
        // Use window dimensions as fallback; ResizeObserver refines later.
        const canvas = canvasRef.current
        const dpr = window.devicePixelRatio || 1
        const w = canvas && canvas.width > 0 ? canvas.width / dpr : window.innerWidth || 1200
        const h = canvas && canvas.height > 0 ? canvas.height / dpr : (window.innerHeight || 800) - 120
        const nw = rangeX * scale // normalized data width
        const nh = rangeY * scale // normalized data height
        const padding = 60
        const zoom = Math.min(
          (w - padding * 2) / nw,
          (h - padding * 2) / nh,
          MAX_ZOOM,
        )
        rs.current.camera = {
          x: offsetX - padding / zoom,
          y: offsetY - padding / zoom,
          zoom: Math.max(MIN_ZOOM, zoom),
        }
        needsAutoFit.current = true
      }

      setData(result)
      return result.points.length
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projection data')
      return 0
    }
  }, [projectSlug])

  useEffect(() => {
    setLoading(true)
    const dims: 2 | 3 = viewMode === '3d' ? 3 : 2
    fetchData(dims).then((count) => {
      // Fallback: if 3D returned no points, retry with 2D (backend may not support 3D UMAP)
      if (dims === 3 && count === 0) {
        return fetchData(2)
      }
    }).finally(() => setLoading(false))
  }, [fetchData, viewMode])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchData(viewMode === '3d' ? 3 : 2)
    setRefreshing(false)
  }, [fetchData, viewMode])

  // ── Canvas resize ─────────────────────────────────────────────────────
  // Deps include [data, scheduleFrame] so the observer is re-created when
  // data loads (at that point loading=false → canvas is in the DOM).
  // On first proper resize with data, recalculate camera with real dimensions.
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

        // Auto-fit camera with real canvas dimensions (first resize after data load)
        if (needsAutoFit.current && data && data.points.length > 0) {
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
          const zoom = Math.min(
            (w - padding * 2) / dx,
            (h - padding * 2) / dy,
            MAX_ZOOM,
          )
          rs.current.camera = {
            x: minX - padding / zoom,
            y: minY - padding / zoom,
            zoom: Math.max(MIN_ZOOM, zoom),
          }
          needsAutoFit.current = false
        }

        scheduleFrame()
      }
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [data, scheduleFrame])

  // ── Redraw on React state changes (cold path) ────────────────────────
  useEffect(() => { scheduleFrame() }, [data, selectedPoint, selectedIds, showSynapses, showSkills, scheduleFrame])

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
        rs.current.lassoPoints = []
        isLassoingRef.current = false
        scheduleFrame()
        return
      }
      const ids = new Set<string>()
      for (const p of data.points) {
        const [sx, sy] = worldToScreen(p.x, p.y, rs.current.camera)
        if (pointInPolygon(sx, sy, screenPolygon)) ids.add(p.id)
      }
      setSelectedIds(ids)
      rs.current.lassoPoints = []
      isLassoingRef.current = false
      if (ids.size > 0) setLassoMode(false)
      scheduleFrame()
    },
    [data, scheduleFrame],
  )

  // ── Pointer events (native — PointerCapture, bypasses React) ────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Set default cursor
    canvas.style.cursor = lassoMode ? 'crosshair' : 'grab'

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return // left or middle
      cancelAnimationFrame(inertiaRafRef.current)
      cancelAnimationFrame(animRafRef.current)

      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // Lasso start
      if (lassoMode && e.button === 0) {
        isLassoingRef.current = true
        rs.current.lassoPoints = [[mx, my]]
        setSelectedIds(new Set())
        canvas.setPointerCapture(e.pointerId)
        return
      }

      // Pan start
      didDrag.current = false
      isPanningRef.current = true
      panStart.current = { x: mx, y: my, camX: rs.current.camera.x, camY: rs.current.camera.y }
      velHistory.current = []
      canvas.setPointerCapture(e.pointerId)
      canvas.style.cursor = 'grabbing'
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // Lasso drawing
      if (isLassoingRef.current) {
        rs.current.lassoPoints = [...rs.current.lassoPoints, [mx, my]]
        scheduleFrame()
        return
      }

      // Panning with drag threshold
      if (isPanningRef.current && panStart.current) {
        const tdx = mx - panStart.current.x
        const tdy = my - panStart.current.y
        if (!didDrag.current && (tdx * tdx + tdy * tdy) < DRAG_THRESHOLD_SQ) return
        didDrag.current = true

        const cam = rs.current.camera
        rs.current.camera = {
          ...cam,
          x: panStart.current.camX - (mx - panStart.current.x) / cam.zoom,
          y: panStart.current.camY - (my - panStart.current.y) / cam.zoom,
        }
        // Track velocity for inertia (screen-space movement)
        velHistory.current.push({ x: e.movementX, y: e.movementY })
        if (velHistory.current.length > VEL_SAMPLES) velHistory.current.shift()
        scheduleFrame()
        return
      }

      // Hover — throttled 30fps
      const now = performance.now()
      if (now - lastHoverTime.current < 33) return
      lastHoverTime.current = now
      setMousePos({ x: mx, y: my })

      const hit = findPointAtScreen(mx, my, data?.points ?? [], rs.current.camera)
      const newId = hit?.id ?? null
      if (newId !== rs.current.hoveredId) {
        rs.current.hoveredId = newId
        setHoveredPoint(hit)
        canvas.style.cursor = lassoMode ? 'crosshair' : hit ? 'pointer' : 'grab'
        scheduleFrame()
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      canvas.releasePointerCapture(e.pointerId)

      // Finalize lasso
      if (isLassoingRef.current && rs.current.lassoPoints.length > 2) {
        finalizeLasso(rs.current.lassoPoints)
        canvas.style.cursor = lassoMode ? 'crosshair' : 'grab'
        return
      }

      // Click (not drag) → select/deselect
      if (!didDrag.current && !lassoMode && data) {
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const cam = rs.current.camera
        const hit = findPointAtScreen(mx, my, data.points, cam)
        if (hit) {
          setSelectedPoint((prev) => prev?.id === hit.id ? null : hit)
          setSelectedIds(new Set())
        } else {
          const skillHit = findSkillAtScreen(mx, my, data.skills, data.points, cam)
          if (skillHit) {
            setSelectedIds(new Set(skillHit.member_ids))
            setSelectedPoint(null)
          } else {
            setSelectedPoint(null)
          }
        }
      }

      // Start inertia if was dragging
      if (didDrag.current && isPanningRef.current && velHistory.current.length > 0) {
        const sum = velHistory.current.reduce(
          (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
          { x: 0, y: 0 },
        )
        startInertia({
          x: sum.x / velHistory.current.length,
          y: sum.y / velHistory.current.length,
        })
      }

      isPanningRef.current = false
      panStart.current = null
      canvas.style.cursor = lassoMode ? 'crosshair' : 'grab'
    }

    const onPointerLeave = () => {
      if (isLassoingRef.current) finalizeLasso(rs.current.lassoPoints)
      isPanningRef.current = false
      panStart.current = null
      rs.current.hoveredId = null
      setHoveredPoint(null)
      canvas.style.cursor = lassoMode ? 'crosshair' : 'grab'
      scheduleFrame()
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [data, lassoMode, scheduleFrame, finalizeLasso, startInertia])

  // ── Wheel: ALL scroll/wheel/pinch → zoom (centered on cursor) ────
  // Pan is done exclusively via drag. This matches Google Maps / canvas
  // tool conventions: scroll = zoom, drag = pan.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      cancelAnimationFrame(inertiaRafRef.current)

      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const cam = rs.current.camera
      const [wx, wy] = screenToWorld(mx, my, cam)

      // Normalize delta to pixels
      let dy = e.deltaY
      if (e.deltaMode === 1) dy *= 16  // line mode → pixels
      if (e.deltaMode === 2) dy *= 100 // page mode → pixels

      // Pinch gestures (ctrlKey on macOS) send much smaller deltas
      // → use higher sensitivity. Regular wheel/scroll → gentler.
      const sensitivity = (e.ctrlKey || e.metaKey) ? 80 : 200
      dy = Math.max(-300, Math.min(300, dy))
      const factor = Math.pow(2, -dy / sensitivity)
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor))

      rs.current.camera = {
        x: wx - mx / newZoom,
        y: wy - my / newZoom,
        zoom: newZoom,
      }

      scheduleFrame()

      // Debounced React sync (for overlay updates)
      if (wheelSyncRef.current) clearTimeout(wheelSyncRef.current)
      wheelSyncRef.current = setTimeout(() => {
        setHoveredPoint((h) => h)
      }, 150)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [scheduleFrame])

  // ── Zoom button controls (animated) ────────────────────────────────
  const zoomIn = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const cx = canvas.width / dpr / 2
    const cy = canvas.height / dpr / 2
    const cam = rs.current.camera
    const [wx, wy] = screenToWorld(cx, cy, cam)
    const newZoom = Math.min(MAX_ZOOM, cam.zoom * ZOOM_STEP)
    animateCamera({ x: wx - cx / newZoom, y: wy - cy / newZoom, zoom: newZoom })
  }, [animateCamera])

  const zoomOut = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const cx = canvas.width / dpr / 2
    const cy = canvas.height / dpr / 2
    const cam = rs.current.camera
    const [wx, wy] = screenToWorld(cx, cy, cam)
    const newZoom = Math.max(MIN_ZOOM, cam.zoom / ZOOM_STEP)
    animateCamera({ x: wx - cx / newZoom, y: wy - cy / newZoom, zoom: newZoom })
  }, [animateCamera])

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
    animateCamera({
      x: minX - padding / zoom,
      y: minY - padding / zoom,
      zoom: Math.max(MIN_ZOOM, zoom),
    })
  }, [data, animateCamera])

  // ── Keyboard shortcuts ──────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'Escape') {
        setSelectedPoint(null)
        setSelectedIds(new Set())
        if (lassoMode) setLassoMode(false)
        rs.current.lassoPoints = []
        isLassoingRef.current = false
        scheduleFrame()
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomIn()
      } else if (e.key === '-') {
        e.preventDefault()
        zoomOut()
      } else if (e.key === '0') {
        e.preventDefault()
        fitAll()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lassoMode, scheduleFrame, zoomIn, zoomOut, fitAll])

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
        {!props.embedded && (
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => navigate(workspacePath(wsSlug, `/projects/${projectSlug}/intelligence`))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft size={14} />
              Dashboard
            </button>
          </div>
        )}
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
    <div
      ref={fullscreenRef}
      className={`flex flex-col ${props.embedded && !isFullscreen ? 'rounded-lg overflow-hidden border border-slate-800' : !isFullscreen ? '-mx-4 md:-mx-6 -mb-2' : ''} ${isFullscreen ? 'bg-slate-950' : ''}`}
      style={{ height: props.embedded && !isFullscreen ? '600px' : isFullscreen ? '100vh' : 'calc(100dvh - 5rem)' }}
    >
      {/* ── Header (hidden in embedded mode) ──────────────────────────── */}
      {!props.embedded && (
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
                UMAP {viewMode === '3d' ? '3D' : '2D'} projection of knowledge embeddings
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
      )}

      {/* ── Canvas / 3D Area ─────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-[#0c1322] overflow-hidden touch-none select-none"
      >
        {viewMode === '2d' ? (
          <>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
            />

            {/* Zoom + Lasso controls (2D only) */}
            <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-1">
              <button
                onClick={() => {
                  setLassoMode((v) => !v)
                  if (lassoMode) { rs.current.lassoPoints = []; isLassoingRef.current = false; scheduleFrame() }
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

            {/* Zoom level + semantic zoom indicator (2D only) */}
            <div className="absolute top-3 right-3 z-30 flex items-center gap-2 text-[9px] font-mono bg-slate-900/60 px-2 py-1 rounded">
              <span ref={zoomDisplayRef} className="text-slate-600">100%</span>
              <span ref={semanticDisplayRef} className="text-cyan-600" style={{ display: 'none' }}>semantic</span>
            </div>
          </>
        ) : (
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center bg-slate-950">
              <div className="text-slate-500 text-sm flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                Loading 3D engine…
              </div>
            </div>
          }>
            <VectorSpace3D
              points={data.points}
              synapses={data.synapses}
              skills={data.skills}
              showSynapses={showSynapses}
              showSkills={showSkills}
              selectedIds={selectedIds}
              selectedPointId={selectedPoint?.id}
              onPointHover={(p) => setHoveredPoint(p)}
              onPointClick={(p) => {
                if (p) {
                  setSelectedPoint((prev) => prev?.id === p.id ? null : p)
                } else {
                  // Empty click — only clear point, keep skill area selection
                  setSelectedPoint(null)
                }
              }}
              onSkillClick={(skill) => {
                // Select all member neurons of the clicked skill
                setSelectedIds(new Set(skill.member_ids))
                setSelectedPoint(null)
              }}
            />
          </Suspense>
        )}

        {/* 2D/3D toggle + Fullscreen (bottom-right, above zoom controls) */}
        <div className={`absolute ${viewMode === '2d' ? 'bottom-4 right-14' : 'bottom-4 right-4'} z-30 flex items-center gap-1 bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700 p-0.5`}>
          <button
            onClick={() => setViewMode('2d')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
              viewMode === '2d'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Grid3x3 size={12} />
            2D
          </button>
          <button
            onClick={() => setViewMode('3d')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-medium transition-colors ${
              viewMode === '3d'
                ? 'bg-cyan-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            }`}
          >
            <Box size={12} />
            3D
          </button>
          <div className="w-px h-5 bg-slate-700 mx-0.5" />
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
          </button>
        </div>

        {/* Tooltip (only in 2D mode, not in lasso mode, no selection panel) */}
        {viewMode === '2d' && hoveredPoint && !selectedPoint && (
          <Tooltip point={hoveredPoint} x={mousePos.x} y={mousePos.y} />
        )}

        {/* Selection bar (multi-select via lasso in 2D, or skill click in 3D) */}
        {selectedIds.size > 0 && (
          <SelectionBar
            count={selectedIds.size}
            status={reinforceStatus}
            message={reinforceMessage}
            onReinforce={handleReinforce}
            onClear={() => { setSelectedIds(new Set()); setReinforceStatus('idle') }}
          />
        )}

        {/* Detail panel (single click selection — both modes) */}
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
          method={viewMode === '3d' ? 'umap_3d' : data.method}
          showSynapses={showSynapses}
          showSkills={showSkills}
          onToggleSynapses={() => setShowSynapses((v) => !v)}
          onToggleSkills={() => setShowSkills((v) => !v)}
        />
      </div>
    </div>
  )
}
