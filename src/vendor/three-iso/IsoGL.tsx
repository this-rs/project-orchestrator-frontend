// GENERATED from website@68fc05a16f43f7955077d1db0a7a00e456a1d22f:src/three/iso/IsoGL.tsx by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
import { useEffect, useRef } from 'react'

import type { MachineDef } from './machine'
import type { LiveScene } from './live'
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
  /** Sélecteur de l'élément de texte que les postes ne doivent pas recouvrir (cherché dans le héros parent) : la
   * disposition est étirée verticalement jusqu'à le dégager. */
  avoid?: string | undefined
  /** Scène dont on lit le poste mis en avant (par défaut : `machine.id` ; la variante téléphone lit celle de base). */
  focusId?: string
  onHotspots?: ((h: { x: number; y: number; r: number }[]) => void) | undefined
  /** Appelé après la première image. */
  onFirstFrame?: () => void
  /** Scène vivante (`live.ts`) : la machine suit ses patchs sans recréer le contexte, chaque poste suit son statut, et
   * l'image est redessinée en continu tant que la scène est visible. `machine` est alors ignoré (sauf repli). */
  live?: LiveScene | undefined
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
export default function IsoGL({ machine: given, live, still = false, drive = 'time', className = 'iso-lit iso-fit block', transparent = false, interactive = false, focusId, avoid, onHotspots, onFirstFrame, onUnsupported }: IsoGLProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cb = useRef({ onFirstFrame, onUnsupported, onHotspots })
  useEffect(() => {
    cb.current = { onFirstFrame, onUnsupported, onHotspots }
  }, [onFirstFrame, onUnsupported, onHotspots])

  // Une scène vivante garde son contexte quand sa machine change : l'effet dépend de la scène, pas de la machine.
  const source: LiveScene | MachineDef = live ?? given
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const live = 'apply' in source ? source : null
    const machine = live ? (live.machine ?? given) : (source as MachineDef)
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
    const avoidEl = avoid ? canvas.closest('.page-hero')?.querySelector(avoid) : null
    const resize = () => {
      resized = true
      if (avoidEl) {
        const c = canvas.getBoundingClientRect()
        const t = avoidEl.getBoundingClientRect()
        r.avoid({ x0: t.left - c.left, x1: t.right - c.left, y0: t.top - c.top, y1: t.bottom - c.top }, c.width, c.height)
      }
      const b = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(b.width * dpr))
      canvas.height = Math.max(1, Math.round(b.height * dpr))
    }
    const at = (now: number): [number, number] => {
      if (still) return [machine.t0, 1]
      // Scène vivante : pas d'apparition globale (chaque poste suit son statut), le cycle tourne depuis la 1re image.
      if (live) {
        if (!start) start = now
        return [((((now - start) / 1000) / machine.cycle + machine.t0) % 1 + 1) % 1, 1]
      }
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
      const focus = interactive && built >= 1 ? getIsoFocus(focusId ?? machine.id) : null
      r.draw(u, built, focus)
      if (canvas.dataset.machine !== r.current) canvas.dataset.machine = r.current
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
    if (avoidEl) ro.observe(avoidEl)
    const onVis = () => schedule()
    const onScroll = () => schedule()
    // Image figée ou pilotée par le défilement : retracer quand le lecteur met un poste en avant.
    const offFocus = interactive ? onIsoFocus(() => schedule()) : () => {}
    const offLive = live
      ? live.subscribe(() => {
          if (live.machine) r.setMachine(live.machine)
          schedule()
        })
      : () => {}
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
      offLive()
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(fade)
      r.dispose()
    }
    // `given` ne sert que de repli à la création : il ne recrée pas le contexte d'une scène vivante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, still, drive, transparent, interactive, focusId, avoid])

  return <canvas ref={ref} width={1200} height={700} className={className} style={{ opacity: 0, transition: still ? undefined : 'opacity .25s ease-out' }} />
}
