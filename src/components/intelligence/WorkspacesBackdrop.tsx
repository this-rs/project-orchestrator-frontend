import { useEffect, useRef, useState } from 'react'
import { intelligenceApi } from '@/services/intelligence'
import { cellCentre, layoutBackdrop, type BackdropLayer } from './workspaceBackdrop'

/** Layers fetched for the backdrop: the code and the knowledge around it. */
const BACKDROP_LAYERS = ['code', 'knowledge']
/** Per workspace: enough to show its shape, cheap enough for a list of many. */
const BACKDROP_NODE_LIMIT = 300

/**
 * The graph of every workspace, drawn faintly behind the selector's list. It is
 * decorative: a workspace whose graph fails is simply left out, and the list
 * never waits for it.
 */
export function WorkspacesBackdrop({ slugs }: { slugs: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [layers, setLayers] = useState<BackdropLayer[]>([])
  const key = slugs.join('|')

  useEffect(() => {
    const list = key ? key.split('|') : []
    if (list.length === 0) return
    const ac = new AbortController()
    Promise.allSettled(
      list.map((slug) =>
        intelligenceApi
          .getWorkspaceGraph(slug, { layers: BACKDROP_LAYERS, limit: BACKDROP_NODE_LIMIT }, ac.signal)
          .then((graph) => ({ slug, graph })),
      ),
    ).then((results) => {
      if (ac.signal.aborted) return
      const ok = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      setLayers(layoutBackdrop(ok))
    })
    return () => ac.abort()
  }, [key])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      const n = layers.length
      layers.forEach((layer, i) => {
        const { cx, cy, cols, rows } = cellCentre(i, n)
        const cellW = rect.width / cols
        const cellH = rect.height / rows
        const radius = Math.min(cellW, cellH) * 0.42
        const px = (p: { x: number; y: number }) => [cx * rect.width + p.x * radius, cy * rect.height + p.y * radius] as const

        ctx.strokeStyle = `hsla(${layer.hue}, 60%, 70%, 0.10)`
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const [a, b] of layer.edges) {
          const [ax, ay] = px(layer.points[a])
          const [bx, by] = px(layer.points[b])
          ctx.moveTo(ax, ay)
          ctx.lineTo(bx, by)
        }
        ctx.stroke()

        ctx.fillStyle = `hsla(${layer.hue}, 75%, 72%, 0.6)`
        for (const p of layer.points) {
          const [x, y] = px(p)
          ctx.beginPath()
          ctx.arc(x, y, 1 + 0.9 * Math.sqrt(p.degree), 0, Math.PI * 2)
          ctx.fill()
        }
      })
    }
    draw()
    // Environments without ResizeObserver (jsdom) keep the first drawing only.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [layers])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
    />
  )
}
