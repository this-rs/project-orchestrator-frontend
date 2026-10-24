/**
 * `iso_scene` viz — the LAZY chunk: the shared 3D engine (`src/vendor/three-iso/`,
 * generated from the site), its checks, and the WebGL canvas. Loaded by
 * `LazyIsoSceneViz` only when a scene appears in a conversation.
 *
 * - Checked: a refused scene shows what to correct and the text fallback, never a crash.
 * - Built layer by layer by the swarm of agents (the engine's build-in), on a
 *   transparent background, when the block first comes into view.
 * - The WebGL context is opened only while the block is near the viewport (a long
 *   conversation can hold many scenes without as many contexts).
 * - Reduced motion: the finished machine, still. No WebGL 2: the same machine as a flat
 *   SVG, in the same colours.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { useT } from '@/i18n'
import { useReducedMotion } from '@/utils/motion'
import IsoGL from '@/vendor/three-iso/IsoGL'
import { toView } from '@/vendor/three-iso/compose'
import { contentBox } from '@/vendor/three-iso/fit'
import { litColor } from '@/vendor/three-iso/shading'
import type { MachineDef } from '@/vendor/three-iso/machine'
import type { LiveScene } from '@/vendor/three-iso/live'
import type { VizBlockProps } from '../registry'
import { compileIsoScene, type LegendEntry } from './compile'

export function IsoSceneRefusal({ problems, fallbackText }: { problems: readonly string[]; fallbackText?: string }) {
  const { t } = useT()
  return (
    <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.04] px-3 py-2" role="note" data-testid="iso-scene-refused">
      <div className="flex items-center gap-1.5 text-xs text-amber-300/90">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{t('chatA-tools.viz.iso.refused')}</span>
      </div>
      <ul className="mt-1.5 list-disc pl-5 text-[11px] text-gray-400 space-y-0.5">
        {problems.slice(0, 12).map((p, i) => (
          <li key={i}>{p}</li>
        ))}
        {problems.length > 12 && <li>{t('chatA-tools.viz.iso.moreProblems', { count: problems.length - 12 })}</li>}
      </ul>
      {fallbackText && (
        <pre className="mt-2 max-h-40 overflow-auto text-[11px] text-gray-500 whitespace-pre-wrap font-mono leading-relaxed">{fallbackText}</pre>
      )}
    </div>
  )
}

/** The machine as flat polygons (no WebGL 2): same faces, same lighting as the first WebGL frame. */
function IsoSvg({ machine }: { machine: MachineDef }) {
  const b = contentBox(machine)
  return (
    <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" focusable="false" data-testid="iso-scene-svg">
      <g strokeWidth="0.6" strokeLinejoin="round">
        {machine.build(machine.t0, 1).map((f, i) => {
          const pts = f.pts.map((p) => {
            const v = toView(machine, p)
            return `${v[0].toFixed(1)},${v[1].toFixed(1)}`
          })
          const col = litColor(f)
          return <polygon key={i} points={pts.join(' ')} fill={col} stroke={col} fillOpacity={f.alpha < 1 ? f.alpha : undefined} strokeOpacity={f.alpha < 1 ? f.alpha : undefined} />
        })}
      </g>
    </svg>
  )
}

function Legend({ entries }: { entries: readonly LegendEntry[] }) {
  if (!entries.length) return null
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 px-1 pt-2 text-[11px] text-gray-400" data-testid="iso-scene-legend">
      {entries.map((e, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: e.color }} aria-hidden />
          {e.label}
        </li>
      ))}
    </ul>
  )
}

/** The canvas of a scene. `live`: a live scene (`live.ts`), whose machine follows its patches — nothing to rebuild. */
export function IsoStage({ machine, expanded, label, live }: { machine: MachineDef; expanded: boolean; label: string; live?: LiveScene }) {
  const { t } = useT()
  const reduced = useReducedMotion()
  const box = useRef<HTMLDivElement>(null)
  // No IntersectionObserver (old webview, tests): mount at once.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  const [noGl, setNoGl] = useState(false)
  const [run, setRun] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((e) => setNear(e.some((x) => x.isIntersecting)), { rootMargin: '200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  const toggleFullscreen = () => {
    const el = box.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
      setFullscreen(false)
    } else if (typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().then(() => setFullscreen(true)).catch(() => setFullscreen(true))
    } else {
      setFullscreen((v) => !v)
    }
  }
  const fullscreenCls = fullscreen ? 'fixed inset-0 z-50 bg-gray-950' : expanded ? 'h-[min(70vh,640px)]' : 'h-[220px]'
  return (
    <div ref={box} className={`relative w-full ${fullscreenCls}`} role="img" aria-label={label}>
      {noGl ? (
        <IsoSvg machine={machine} />
      ) : (
        near && (
          <IsoGL
            key={run}
            machine={machine}
            {...(live ? { live } : {})}
            still={reduced}
            drive="time"
            transparent
            controls
            className="absolute inset-0 block h-full w-full"
            onUnsupported={() => setNoGl(true)}
          />
        )
      )}
      <button
        type="button"
        onClick={toggleFullscreen}
        title={fullscreen ? t('chatA-tools.viz.iso.exitFullscreen') : t('chatA-tools.viz.iso.fullscreen')}
        aria-label={fullscreen ? t('chatA-tools.viz.iso.exitFullscreen') : t('chatA-tools.viz.iso.fullscreen')}
        className="absolute right-1 top-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
      >
        {fullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
      </button>
      {!noGl && !reduced && !live && (
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className="absolute right-1 bottom-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-white/[0.04] transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          {t('chatA-tools.viz.iso.rebuild')}
        </button>
      )}
    </div>
  )
}

export default function IsoSceneViz({ data, fallbackText, expanded = false, title }: VizBlockProps) {
  const result = useMemo(() => compileIsoScene(data), [data])
  if (!result.ok) return <IsoSceneRefusal problems={result.problems} fallbackText={fallbackText} />
  return (
    <div data-testid="iso-scene">
      <IsoStage machine={result.machine} expanded={expanded} label={title ?? result.title ?? fallbackText} />
      <Legend entries={result.legend} />
    </div>
  )
}
