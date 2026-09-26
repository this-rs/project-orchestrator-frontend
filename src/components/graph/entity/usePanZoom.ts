/**
 * Pointer pan / pinch-zoom / wheel-zoom for an SVG, applied as a transform on
 * a <g>. The transform is written straight to the DOM (no React state), and
 * coalesced to at most one write per animation frame while a gesture is in
 * progress — panning never re-renders nor re-lays out the graph, and nothing
 * runs when the user isn't touching it.
 */
import { useCallback, useEffect, useRef } from 'react'

interface Transform {
  x: number
  y: number
  k: number
}

const MIN_K = 0.5
const MAX_K = 6
/** Movement (px) above which a press becomes a drag (and no longer a tap). */
const TAP_SLOP = 6

export interface PanZoom {
  svgRef: React.RefObject<SVGSVGElement | null>
  gRef: React.RefObject<SVGGElement | null>
  /** True when the last pointer gesture was a drag — tap handlers should ignore it. */
  wasDrag: () => boolean
  zoomBy: (factor: number) => void
  reset: () => void
}

/**
 * @param active re-binds the listeners when the <svg> mounts (e.g. after loading).
 */
export function usePanZoom(viewBoxSize: number, active = true): PanZoom {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const gRef = useRef<SVGGElement | null>(null)
  const t = useRef<Transform>({ x: 0, y: 0, k: 1 })
  const dragged = useRef(false)
  const frame = useRef<number | null>(null)

  const write = useCallback(() => {
    frame.current = null
    const g = gRef.current
    if (!g) return
    const { x, y, k } = t.current
    if (x === 0 && y === 0 && k === 1) g.removeAttribute('transform')
    else
      g.setAttribute(
        'transform',
        `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${k.toFixed(4)})`
      )
  }, [])

  const schedule = useCallback(() => {
    if (frame.current !== null) return
    if (typeof requestAnimationFrame === 'function') {
      frame.current = requestAnimationFrame(write)
    } else {
      write()
    }
  }, [write])

  /** Zoom by `factor` keeping viewBox point (px, py) fixed. */
  const zoomAt = useCallback(
    (px: number, py: number, factor: number) => {
      const cur = t.current
      const k = Math.min(MAX_K, Math.max(MIN_K, cur.k * factor))
      const f = k / cur.k
      t.current = { k, x: px - (px - cur.x) * f, y: py - (py - cur.y) * f }
      schedule()
    },
    [schedule]
  )

  const zoomBy = useCallback(
    (factor: number) => zoomAt(viewBoxSize / 2, viewBoxSize / 2, factor),
    [zoomAt, viewBoxSize]
  )

  const reset = useCallback(() => {
    t.current = { x: 0, y: 0, k: 1 }
    schedule()
  }, [schedule])

  const wasDrag = useCallback(() => dragged.current, [])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !active) return
    write() // re-apply the current transform to a freshly mounted <g>

    /** Client px → viewBox units (square viewBox, xMidYMid meet). */
    const toViewBox = (clientX: number, clientY: number) => {
      const rect = svg.getBoundingClientRect()
      const side = Math.min(rect.width, rect.height) || viewBoxSize
      const s = viewBoxSize / side
      return {
        x: (clientX - rect.left - (rect.width - side) / 2) * s,
        y: (clientY - rect.top - (rect.height - side) / 2) * s,
        s,
      }
    }

    const pointers = new Map<number, { x: number; y: number }>()
    let downAt: { x: number; y: number } | null = null
    let pinchDist = 0

    const onDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) {
        dragged.current = false
        downAt = { x: e.clientX, y: e.clientY }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
        dragged.current = true
      }
    }

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      const next = { x: e.clientX, y: e.clientY }
      pointers.set(e.pointerId, next)

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinchDist > 0 && dist > 0) {
          const mid = toViewBox((a.x + b.x) / 2, (a.y + b.y) / 2)
          zoomAt(mid.x, mid.y, dist / pinchDist)
        }
        pinchDist = dist
        return
      }

      if (!dragged.current && downAt) {
        if (Math.hypot(next.x - downAt.x, next.y - downAt.y) < TAP_SLOP) return
        dragged.current = true
        // Capture only once it's a real drag, so taps still reach nodes.
        try {
          svg.setPointerCapture(e.pointerId)
        } catch {
          /* pointer already released */
        }
      }
      const { s } = toViewBox(0, 0)
      t.current = {
        ...t.current,
        x: t.current.x + (next.x - prev.x) * s,
        y: t.current.y + (next.y - prev.y) * s,
      }
      schedule()
    }

    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDist = 0
      if (pointers.size === 0) downAt = null
    }

    // Plain wheel keeps scrolling the page (the graph lives inside detail
    // pages); ctrl/⌘ + wheel — and trackpad pinch, which sets ctrlKey — zooms.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const p = toViewBox(e.clientX, e.clientY)
      zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015))
    }

    svg.addEventListener('pointerdown', onDown)
    svg.addEventListener('pointermove', onMove)
    svg.addEventListener('pointerup', onUp)
    svg.addEventListener('pointercancel', onUp)
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      svg.removeEventListener('pointerdown', onDown)
      svg.removeEventListener('pointermove', onMove)
      svg.removeEventListener('pointerup', onUp)
      svg.removeEventListener('pointercancel', onUp)
      svg.removeEventListener('wheel', onWheel)
      if (frame.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frame.current)
        frame.current = null
      }
    }
  }, [viewBoxSize, zoomAt, schedule, write, active])

  return { svgRef, gRef, wasDrag, zoomBy, reset }
}
