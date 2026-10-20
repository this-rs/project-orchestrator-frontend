// GENERATED from website@8ff26ee08f7be0342973cc35bcffb837b7fc5e0f:src/three/iso/IsoGL.tsx by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
import { useEffect, useRef } from 'react'

import type { MachineDef } from './machine'
import { IsoRenderer } from './litRenderer'
import { BUILD_MS } from './buildIn'
import { scrollProgress, type IsoDrive } from './drive'
import { getIsoFocus, onIsoFocus } from './focus'


interface IsoGLProps {
  machine: MachineDef
  /** Une seule image, machine complète à t0 (mouvement réduit). */
  still?: boolean
  /** `time` : construction puis cycle en boucle. `scroll` : la construction puis le cycle suivent la position du bloc
   * dans la fenêtre (rien ne bouge si le lecteur ne défile pas). */
  drive?: IsoDrive
  /** Classes du canvas (défaut : celles du héros, `iso-lit iso-fit`). */
  className?: string
  /** Fond transparent : la scène se pose sur le fond de sa section (illustration de bloc). */
  transparent?: boolean
  /** Scène interactive : le poste mis en avant (focus.ts) est soulevé et allumé ; `onHotspots` reçoit la position de
   * chaque poste en pixels CSS du canvas, pour y poser des boutons. */
  interactive?: boolean
  onHotspots?: (h: { x: number; y: number; r: number }[]) => void
  /** Appelé après la première image. */
  onFirstFrame?: () => void
  /** Pas de WebGL 2 : le parent garde le SVG. */
  onUnsupported?: () => void
}


/**
 * Scène WebGL d'une machine (rendu éclairé, `litRenderer.ts`) : chargée en différé, jamais prérendue, cadrée comme le
 * SVG prérendu (fit.ts). Mode `time` : l'horloge part à la première image visible ; la machine se construit
 * (`buildIn.ts`, essaim d'agents) puis son cycle tourne. Mode `scroll` : l'entrée du bloc dans la fenêtre construit la
 * machine (premier tiers du trajet), la suite du trajet joue un cycle entier ; la scène n'est retracée qu'au défilement.
 * Le canvas apparaît en fondu ; la boucle ne tourne que si le canvas est visible et l'onglet au premier plan.
 */
export default function IsoGL({ machine, still = false, drive = 'time', className = 'iso-lit iso-fit block', transparent = false, interactive = false, onHotspots, onFirstFrame, onUnsupported }: IsoGLProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cb = useRef({ onFirstFrame, onUnsupported, onHotspots })
  useEffect(() => {
    cb.current = { onFirstFrame, onUnsupported, onHotspots }
  }, [onFirstFrame, onUnsupported, onHotspots])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let r: IsoRenderer
    try {
      r = new IsoRenderer(canvas, machine, transparent)
    } catch {
      cb.current.onUnsupported?.()
      return
    }
    let raf = 0
    let visible = false
    let first = true
    let fade = 0
    let start = 0
    let resized = true
    const resize = () => {
      resized = true
      const b = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(b.width * dpr))
      canvas.height = Math.max(1, Math.round(b.height * dpr))
    }
    const at = (now: number): [number, number] => {
      if (still) return [machine.t0, 1]
      if (drive === 'scroll') {
        const s = scrollProgress(canvas)
        const built = Math.min(1, s / 0.38)
        const run = Math.min(1, Math.max(0, (s - 0.38) / 0.5))
        return [(machine.t0 + run) % 1, built]
      }
      // Temps : l'horloge part à la première image VISIBLE ; construction, puis le cycle démarre à t0 (aucun saut).
      if (!start) start = now
      const t = now - start
      const ms = machine.buildPlan?.ms ?? BUILD_MS
      const run = Math.max(0, t - ms)
      return [((((run / 1000) / machine.cycle + machine.t0) % 1) + 1) % 1, Math.min(1, t / ms)]
    }
    const frame = (now: number) => {
      raf = 0
      const [u, built] = at(now)
      const focus = interactive && built >= 1 ? getIsoFocus(machine.id) : null
      r.draw(u, built, focus)
      if (interactive && (first || resized)) {
        resized = false
        const b = canvas.getBoundingClientRect()
        cb.current.onHotspots?.(r.hotspots(b.width, b.height))
      }
      if (first) {
        first = false
        canvas.style.opacity = '1'
        fade = window.setTimeout(() => cb.current.onFirstFrame?.(), still ? 0 : 250)
      }
      if (!still && drive === 'time') schedule()
    }
    const schedule = () => {
      if (!raf && visible && document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting)
        if (visible) schedule()
      },
      { threshold: 0.01 },
    )
    io.observe(canvas)
    const ro = new ResizeObserver(() => {
      resize()
      schedule()
    })
    ro.observe(canvas)
    const onVis = () => schedule()
    const onScroll = () => schedule()
    // Image figée ou pilotée par le défilement : retracer quand le lecteur met un poste en avant.
    const offFocus = interactive ? onIsoFocus(() => schedule()) : () => {}
    document.addEventListener('visibilitychange', onVis)
    if (drive === 'scroll' && !still) window.addEventListener('scroll', onScroll, { passive: true })
    resize()
    schedule()
    return () => {
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('scroll', onScroll)
      offFocus()
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(fade)
      r.dispose()
    }
  }, [machine, still, drive, transparent, interactive])

  return <canvas ref={ref} width={1200} height={700} className={className} style={{ opacity: 0, transition: still ? undefined : 'opacity .25s ease-out' }} />
}
