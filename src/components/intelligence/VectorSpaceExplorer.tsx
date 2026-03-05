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
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/ErrorState'
import { intelligenceApi } from '@/services/intelligence'
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
  critical: 10,
  high: 7,
  medium: 5,
  low: 3,
}

const SYNAPSE_COLOR = '#22D3EE'   // cyan — matches neural layer
const SKILL_HULL_ALPHA = 0.08
const SKILL_BORDER_ALPHA = 0.4

const MIN_ZOOM = 0.3
const MAX_ZOOM = 8
const ZOOM_STEP = 1.15

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
    const r = (IMPORTANCE_RADIUS[p.importance] ?? 5) * cam.zoom
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
                  width: IMPORTANCE_RADIUS[imp] * 1.2,
                  height: IMPORTANCE_RADIUS[imp] * 1.2,
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
  showSynapses: boolean,
  showSkills: boolean,
) {
  ctx.clearRect(0, 0, width, height)

  // ── Grid dots (subtle) ──────────────────────────────────────────────
  const gridSpacing = 50
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
      ctx.font = `bold ${Math.max(9, 11 * cam.zoom)}px ui-sans-serif, system-ui, sans-serif`
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
      ctx.lineWidth = isHighlighted ? 2 : Math.max(0.5, syn.weight * 2)
      ctx.stroke()
    }
  }

  // ── Points ──────────────────────────────────────────────────────────
  for (const point of points) {
    const [sx, sy] = worldToScreen(point.x, point.y, cam)

    // Frustum culling
    const r = (IMPORTANCE_RADIUS[point.importance] ?? 5) * cam.zoom
    if (sx + r < 0 || sx - r > width || sy + r < 0 || sy - r > height) continue

    const color = POINT_COLORS[point.type] ?? '#94a3b8'
    const radius = IMPORTANCE_RADIUS[point.importance] ?? 5
    const energyAlpha = Math.max(0.2, Math.min(1, point.energy))
    const isHovered = point.id === hoveredId

    // Glow for hovered point
    if (isHovered) {
      ctx.beginPath()
      ctx.arc(sx, sy, radius * cam.zoom + 8, 0, Math.PI * 2)
      ctx.fillStyle = `${color}30`
      ctx.fill()
    }

    // Main circle
    ctx.beginPath()
    ctx.arc(sx, sy, radius * cam.zoom, 0, Math.PI * 2)
    // Energy modulates alpha
    const hexAlpha = Math.round(energyAlpha * 255).toString(16).padStart(2, '0')
    ctx.fillStyle = `${color}${hexAlpha}`
    ctx.fill()

    // Border ring
    ctx.strokeStyle = isHovered ? '#ffffff' : `${color}88`
    ctx.lineWidth = isHovered ? 2 : 1
    ctx.stroke()
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
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null)

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
        const w = canvas?.width ?? 800
        const h = canvas?.height ?? 600
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
        const dpr = window.devicePixelRatio || 1
        canvas.width = width * dpr
        canvas.height = height * dpr
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
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
      renderCanvas(
        ctx, w, h,
        data.points,
        data.synapses,
        data.skills,
        camera,
        hoveredPoint?.id ?? null,
        showSynapses,
        showSkills,
      )
      animFrameRef.current = requestAnimationFrame(draw)
    }
    animFrameRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [data, camera, hoveredPoint, showSynapses, showSkills])

  // ── Mouse handlers ────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect || !data) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      setMousePos({ x: mx, y: my })

      if (isPanning && panStart.current) {
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
    [data, camera, isPanning],
  )

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      setIsPanning(true)
      panStart.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        camX: camera.x,
        camY: camera.y,
      }
    },
    [camera],
  )

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
    panStart.current = null
  }, [])

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      // World position under cursor before zoom
      const [wx, wy] = screenToWorld(mx, my, camera)

      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
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
    <div className="flex flex-col h-full">
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
        className="flex-1 relative bg-[#0c1322] overflow-hidden"
        style={{ cursor: isPanning ? 'grabbing' : hoveredPoint ? 'pointer' : 'grab' }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            handleMouseUp()
            setHoveredPoint(null)
          }}
        />

        {/* Tooltip */}
        {hoveredPoint && !isPanning && (
          <Tooltip point={hoveredPoint} x={mousePos.x} y={mousePos.y} />
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

        {/* Zoom controls */}
        <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-1">
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

        {/* Zoom level indicator */}
        <div className="absolute top-3 right-3 z-30 text-[9px] text-slate-600 font-mono bg-slate-900/60 px-2 py-1 rounded">
          {(camera.zoom * 100).toFixed(0)}%
        </div>
      </div>
    </div>
  )
}
