// GENERATED from website@255d188e3498305845e72a27d2569810c72c2e1b:src/three/iso/IsoGL.tsx by scripts/sync-iso-lib.mjs — do not edit.
// @ts-nocheck — typechecked on the site (TypeScript 6, strict + noUncheckedIndexedAccess); TS 5.7 here infers differently.
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'

import type { MachineDef } from './machine'
import type { LiveScene } from './live'
import { IsoRenderer } from './litRenderer'
import { BUILD_MS } from './buildIn'
import { scrollProgress, type IsoDrive } from './drive'
import { getIsoFocus, onIsoFocus } from './focus'
import { ease, LAMP, type Vec3 } from './iso'
import { CHIP_H, DOT, chipWidth, declutter, fadeOf, pinRect, projectPins, treeToWorld, type Pin } from './pins'
import { DEFAULT_FOV, PERSP_FIT, mixCamera, orbit, pan, presetCamera, zoomAt, type CameraState, type ViewPreset } from './camera'


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
  /** Caméra libre (opt-in : le chat, jamais le héros du site) : glisser = tourner, clic droit ou Maj + glisser =
   * déplacer, Ctrl/⌘ + molette ou pincer = zoomer (molette seule une fois la scène cliquée), double-clic sur un poste =
   * le centrer ; au clavier (canvas focalisé) flèches, + / −, 0 ; barre de vues (Iso, Dessus, Face, Côté, Ortho/Persp,
   * Réinitialiser) dans le coin. `labels` : textes de la barre (défaut : anglais). */
  controls?: boolean | { labels?: Partial<IsoControlLabels> | undefined } | undefined
  /** Étiquettes ancrées à des points de l'ARBRE de construction (mêmes coordonnées que les `at` du JSON ; z = 0 au sol
   * d'une machine `bare`), posées par-dessus le canvas et recalculées à chaque image avec la caméra du rendu. L'ordre est
   * la priorité : une étiquette qui en recouvre une plus haute dans la liste ne garde que son point. Absentes : rien n'est
   * créé. `station` choisit l'arbre d'un poste (défaut 0). */
  pins?: readonly Pin[] | undefined
  /** Clic ou Entrée sur une étiquette (la caméra se centre aussi dessus si `controls` est actif). */
  onPinClick?: ((id: string) => void) | undefined
  /** Plein écran (ou vue immersive) : la scène prend TOUS les gestes — toucher à un doigt sans focus préalable, molette
   * sans Ctrl/⌘ — puisqu'il n'y a plus de conversation à faire défiler autour. */
  immersive?: boolean | undefined
}

/** Textes de la barre de vues : `x` le libellé court, `xHint` le nom accessible. */
export interface IsoControlLabels {
  toolbar: string
  canvas: string
  iso: string
  isoHint: string
  top: string
  topHint: string
  front: string
  frontHint: string
  side: string
  sideHint: string
  persp: string
  perspHint: string
  reset: string
  resetHint: string
  /** Infobulle de la première visite : comment zoomer sans faire défiler la page. */
  hint: string
  /** Bouton qui montre ou masque les étiquettes ancrées (`pins`). */
  pins: string
  pinsHint: string
}

const ISO_CONTROL_LABELS: IsoControlLabels = {
  toolbar: '3D view',
  canvas: '3D scene: drag to orbit, right-drag or Shift-drag to pan, Ctrl or ⌘ + scroll (or pinch) to zoom, double-click a station to centre it; arrow keys, + / − and 0 when focused',
  iso: 'Iso',
  isoHint: 'Isometric view',
  top: 'Top',
  topHint: 'View from above',
  front: 'Front',
  frontHint: 'Front view',
  side: 'Side',
  sideHint: 'Side view',
  persp: 'Persp',
  perspHint: 'Perspective projection',
  reset: 'Reset',
  resetHint: 'Reset the camera',
  hint: 'Ctrl + scroll to zoom',
  pins: 'Labels',
  pinsHint: 'Show or hide the labels',
}

/** Commandes que la barre envoie à la boucle de rendu. */
interface CameraApi {
  preset(p: ViewPreset): void
  toggleMode(): void
  reset(): void
  /** Centre la caméra sur l'étiquette `id` (déplacement doux, zoom d'au moins `PIN_ZOOM`). */
  focusPin(id: string): void
}

const TWEEN_MS = 450
/** Un tour de caméra par hauteur de canvas (comme les contrôles orbitaux usuels). */
const ORBIT_TURN = Math.PI * 2
/** Inertie : demi-vie de la vitesse de rotation après le lâcher, et seuil d'arrêt (rad/ms). */
const INERTIA_MS = 240
const INERTIA_MIN = 4e-5
/** Lissage du zoom à la molette : constante de temps (ms) vers le zoom visé. */
const ZOOM_MS = 110
const HINT_MS = 2800
/** Zoom en attente au plus de ce facteur (une rafale de molette ne s'accumule pas sans fin). */
const ZOOM_MAX_STEP = 6
const KEY_ANGLE = Math.PI / 12
const KEY_ZOOM = 1.25
/** Zoom minimal quand la caméra se centre sur une étiquette. */
const PIN_ZOOM = 1.6
/** Au-delà de ce nombre d'étiquettes, le choix des puces visibles n'est refait qu'une image sur trois. */
const PIN_FULL = 40


/**
 * Scène WebGL d'une machine (rendu éclairé, `litRenderer.ts`) : chargée en différé, jamais prérendue, cadrée comme le
 * SVG prérendu (fit.ts). Mode `time` : l'horloge part à la première image visible ; la machine se construit
 * (`buildIn.ts`, essaim d'agents) puis son cycle tourne. Mode `scroll` : l'entrée du bloc dans la fenêtre construit la
 * machine (premier tiers du trajet), la suite du trajet joue un cycle entier ; la scène n'est retracée qu'au défilement.
 * Le canvas apparaît en fondu ; la boucle ne tourne que si le canvas est visible et l'onglet au premier plan.
 */
export default function IsoGL({ machine: given, live, still = false, drive = 'time', className = 'iso-lit iso-fit block', transparent = false, interactive = false, focusId, avoid, onHotspots, onFirstFrame, onUnsupported, controls, pins, onPinClick, immersive = false }: IsoGLProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const withControls = !!controls
  const api = useRef<CameraApi | null>(null)
  const [mode, setMode] = useState<CameraState['mode'] | null>(null)
  const [focused, setFocused] = useState(false)
  const [hint, setHint] = useState(false)
  const [showPins, setShowPins] = useState(true)
  const [activePin, setActivePin] = useState<string | null>(null)
  const hasPins = !!pins && pins.length > 0
  const wrapped = withControls || hasPins
  // Les étiquettes vivent hors de React à chaque image : la boucle de rendu lit ces références, sans rendu à chaque image.
  const pinsRef = useRef<readonly Pin[]>([])
  const pinEls = useRef<(HTMLElement | null)[]>([])
  const showRef = useRef(true)
  const clickRef = useRef(onPinClick)
  const immersiveRef = useRef(immersive)
  useEffect(() => {
    immersiveRef.current = immersive
  }, [immersive])
  const hintSeen = useRef(false)
  const cb = useRef({ onFirstFrame, onUnsupported, onHotspots })
  useEffect(() => {
    cb.current = { onFirstFrame, onUnsupported, onHotspots }
  }, [onFirstFrame, onUnsupported, onHotspots])
  // Rendu : la liste et l'état d'affichage sont lus par la boucle ; une image est demandée quand ils changent.
  const redraw = useRef<(() => void) | null>(null)
  useEffect(() => {
    pinsRef.current = pins ?? []
    showRef.current = showPins
    clickRef.current = onPinClick
    redraw.current?.()
  }, [pins, showPins, onPinClick, activePin])

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
    // Caméra libre : perspective d'emblée (la profondeur se lit) ; le héros du site garde l'isométrique.
    if (withControls) r.setDefaults({ mode: 'persp', fov: DEFAULT_FOV, zoom: PERSP_FIT })
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
    // Caméra libre (opt-in) : l'état du lecteur (null = caméra par défaut) et une transition en cours.
    let cam: CameraState | null = null
    let tween: { from: CameraState; to: CameraState | null; Ta: Vec3; Tb: Vec3; at: number } | null = null
    let moved = false
    // Mouvement qui se poursuit seul : inertie de la rotation (rad/ms) et zoom visé (facteur restant, ancré au curseur).
    const vel = { yaw: 0, pitch: 0 }
    let zoomLeft = 1
    let zoomAt_: [number, number] = [0, 0]
    let lastNow = 0
    const stopMotion = () => {
      vel.yaw = 0
      vel.pitch = 0
      zoomLeft = 1
    }
    const current = (): CameraState => cam ?? r.defaultCamera()
    const tweenAt = (now: number): CameraState => {
      const t = tween!
      const u = Math.min(1, (now - t.at) / TWEEN_MS)
      return mixCamera(t.from, t.to ?? r.defaultCamera(), t.Ta, t.Tb, ease(u))
    }
    /** La caméra au moment du geste (au milieu d'une transition : là où elle en est). */
    const live_ = (): CameraState => (tween ? tweenAt(performance.now()) : current())
    /** La caméra suit le geste sans transition (et coupe celle en cours). */
    const setCam = (c: CameraState | null) => {
      tween = null
      cam = c
      r.setCamera(c)
      moved = true
      setMode((c ?? r.defaultCamera()).mode)
      schedule()
    }
    /** Transition adoucie vers `to` (null = la caméra par défaut). */
    const glideTo = (to: CameraState | null) => {
      stopMotion()
      const f = r.frame
      if (!f) return setCam(to)
      const from = live_()
      const goal = to ?? r.defaultCamera()
      tween = { from, to, Ta: from.target ?? f.T, Tb: goal.target ?? r.center, at: performance.now() }
      setMode(goal.mode)
      schedule()
    }
    const stepTween = (now: number) => {
      if (!tween) return
      if (now - tween.at >= TWEEN_MS) {
        cam = tween.to
        tween = null
      } else cam = tweenAt(now)
      r.setCamera(cam)
      moved = true
    }
    /** Inertie et zoom lissé : un pas par image, indépendant de la cadence. */
    const stepMotion = (now: number) => {
      const dt = Math.min(64, lastNow ? now - lastNow : 16)
      lastNow = now
      const f = r.frame
      if (!f || tween) return
      if (Math.abs(vel.yaw) > INERTIA_MIN || Math.abs(vel.pitch) > INERTIA_MIN) {
        setCam(orbit(current(), vel.yaw * dt, vel.pitch * dt))
        const k = Math.pow(0.5, dt / INERTIA_MS)
        vel.yaw *= k
        vel.pitch *= k
      } else {
        vel.yaw = 0
        vel.pitch = 0
      }
      if (Math.abs(Math.log(zoomLeft)) > 0.002) {
        const a = 1 - Math.exp(-dt / ZOOM_MS)
        const step = Math.pow(zoomLeft, a)
        const c = current()
        const z = zoomAt(c, c.target ?? f.T, f, step, zoomAt_[0], zoomAt_[1])
        zoomLeft /= step
        // Une borne atteinte : plus rien à attendre.
        if (z.zoom === c.zoom) zoomLeft = 1
        setCam(z)
      } else zoomLeft = 1
    }
    const motion = () => Math.abs(vel.yaw) > INERTIA_MIN || Math.abs(vel.pitch) > INERTIA_MIN || Math.abs(Math.log(zoomLeft)) > 0.002
    const bindGestures = () => {
      const pts = new Map<number, { x: number; y: number }>()
      let kind: 'orbit' | 'pan' | null = null
      let lastT = 0
      let pinch: { d: number; mx: number; my: number } | null = null
      // Double toucher (un doigt, deux appuis brefs et proches) : même effet que le double-clic, que les navigateurs
      // mobiles n'émettent pas quand la scène prend les gestes (touch-action: none).
      let tapStart: { x: number; y: number; t: number } | null = null
      let lastTap: { x: number; y: number; t: number } | null = null
      let multi = false
      const rect = () => canvas.getBoundingClientRect()
      const ndc = (x: number, y: number, b: DOMRect): [number, number] => [((x - b.left) / b.width) * 2 - 1, 1 - ((y - b.top) / b.height) * 2]
      const two = () => {
        const [a, b] = [...pts.values()] as [{ x: number; y: number }, { x: number; y: number }]
        return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
      }
      const down = (e: PointerEvent) => {
        if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return
        canvas.focus({ preventScroll: true })
        canvas.setPointerCapture(e.pointerId)
        stopMotion()
        setHint(false)
        lastT = e.timeStamp
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
        if (pts.size === 1) {
          multi = false
          tapStart = { x: e.clientX, y: e.clientY, t: e.timeStamp }
        } else multi = true
        if (pts.size === 1) kind = e.button === 2 || e.shiftKey ? 'pan' : 'orbit'
        else if (pts.size === 2) {
          kind = null
          pinch = two()
        }
      }
      const move = (e: PointerEvent) => {
        const p = pts.get(e.pointerId)
        const f = r.frame
        if (!p || !f) return
        const dx = e.clientX - p.x
        const dy = e.clientY - p.y
        p.x = e.clientX
        p.y = e.clientY
        const b = rect()
        const c = live_()
        const T = c.target ?? f.T
        if (pts.size >= 2 && pinch) {
          // Deux doigts : le milieu déplace la scène, l'écart zoome autour du milieu.
          const g = two()
          const n = pan(c, T, f, ((g.mx - pinch.mx) / b.width) * 2, (-(g.my - pinch.my) / b.height) * 2)
          const [nx, ny] = ndc(g.mx, g.my, b)
          const k = g.d / Math.max(1, pinch.d)
          pinch = g
          setCam(zoomAt(n, n.target ?? T, f, k, nx, ny))
        } else if (kind === 'orbit') {
          const k = ORBIT_TURN / Math.max(1, b.height)
          setCam(orbit(c, dx * k, dy * k))
          // Vitesse lissée : le lâcher la prolonge (le doigt immobile avant le lâcher l'annule).
          const dtm = Math.max(1, e.timeStamp - lastT)
          lastT = e.timeStamp
          vel.yaw = vel.yaw * 0.5 + ((dx * k) / dtm) * 0.5
          vel.pitch = vel.pitch * 0.5 + ((dy * k) / dtm) * 0.5
        }
        else if (kind === 'pan') setCam(pan(c, T, f, (dx / b.width) * 2, (-dy / b.height) * 2))
      }
      const up = (e: PointerEvent) => {
        // Immobile juste avant le lâcher : pas d'inertie.
        if (kind !== 'orbit' || e.timeStamp - lastT > 90) stopMotion()
        if (e.pointerType === 'touch' && e.type === 'pointerup' && !multi && pts.size === 1 && tapStart) {
          const tap = { x: e.clientX, y: e.clientY, t: e.timeStamp }
          const still_ = Math.hypot(tap.x - tapStart.x, tap.y - tapStart.y) < 10 && tap.t - tapStart.t < 300
          if (still_ && lastTap && tap.t - lastTap.t < 350 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 30) {
            lastTap = null
            stopMotion()
            dbl(new MouseEvent('dblclick', { clientX: tap.x, clientY: tap.y }))
          } else lastTap = still_ ? tap : null
        }
        pts.delete(e.pointerId)
        if (pts.size < 2) pinch = null
        if (pts.size === 0) kind = null
        if (motion()) schedule()
      }
      const wheel = (e: WheelEvent) => {
        // Une conversation défile à la molette : la scène ne la prend qu'avec Ctrl/⌘ (le pincement d'un pavé tactile
        // arrive ainsi) ou une fois cliquée (focalisée).
        if (!(e.ctrlKey || e.metaKey || immersiveRef.current || document.activeElement === canvas)) return
        const f = r.frame
        if (!f) return
        e.preventDefault()
        setHint(false)
        const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)
        const k = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015))
        // Le zoom visé s'accumule ; la boucle s'en approche en douceur, ancrée au curseur.
        zoomLeft = Math.min(ZOOM_MAX_STEP, Math.max(1 / ZOOM_MAX_STEP, zoomLeft * k))
        zoomAt_ = ndc(e.clientX, e.clientY, rect())
        if (tween) setCam(live_())
        schedule()
      }
      const dbl = (e: MouseEvent) => {
        const f = r.frame
        if (!f) return
        const b = rect()
        const x = e.clientX - b.left
        const y = e.clientY - b.top
        const c = live_()
        const T = c.target ?? f.T
        const at = r.drawn.hotspots?.at
        let best = -1
        let bd = Infinity
        r.hotspots(b.width, b.height).forEach((h, i) => {
          const d = Math.hypot(h.x - x, h.y - y)
          if (h.r > 0 && d <= h.r * 1.4 && d < bd) {
            best = i
            bd = d
          }
        })
        const hit = best >= 0 && at ? at[best] : undefined
        if (hit) {
          glideTo({ ...c, target: hit, zoom: Math.max(c.zoom, 2) })
          return
        }
        // Ailleurs : la cible va au point du plan de la cible sous le curseur (zoom inchangé).
        const [nx, ny] = ndc(e.clientX, e.clientY, b)
        const half = zoomAt({ ...c, zoom: c.zoom / 2 }, T, f, 2, nx, ny)
        glideTo({ ...c, target: half.target ?? T })
      }
      const key = (e: KeyboardEvent) => {
        const c = live_()
        const f = r.frame
        let n: CameraState | null
        if (e.key === 'ArrowLeft') n = orbit(c, -KEY_ANGLE, 0)
        else if (e.key === 'ArrowRight') n = orbit(c, KEY_ANGLE, 0)
        else if (e.key === 'ArrowUp') n = orbit(c, 0, -KEY_ANGLE)
        else if (e.key === 'ArrowDown') n = orbit(c, 0, KEY_ANGLE)
        else if ((e.key === '+' || e.key === '=') && f) n = zoomAt(c, c.target ?? f.T, f, KEY_ZOOM, 0, 0)
        else if ((e.key === '-' || e.key === '_') && f) n = zoomAt(c, c.target ?? f.T, f, 1 / KEY_ZOOM, 0, 0)
        else if (e.key === '0') n = null
        else return
        e.preventDefault()
        glideTo(n)
      }
      const menu = (e: Event) => e.preventDefault()
      const on: [string, EventListener, AddEventListenerOptions?][] = [
        ['pointerdown', down as EventListener],
        ['pointermove', move as EventListener],
        ['pointerup', up as EventListener],
        ['pointercancel', up as EventListener],
        ['wheel', wheel as EventListener, { passive: false }],
        ['dblclick', dbl as EventListener],
        ['keydown', key as EventListener],
        ['contextmenu', menu],
      ]
      for (const [t, fn, o] of on) canvas.addEventListener(t, fn, o)
      return () => {
        for (const [t, fn] of on) canvas.removeEventListener(t, fn)
      }
    }
    const offGestures = withControls ? bindGestures() : () => {}
    if (withControls) {
      api.current = {
        preset: (p) => glideTo(presetCamera(r.drawn, p, current())),
        toggleMode: () => {
          const c = current()
          glideTo({ ...c, mode: c.mode === 'ortho' ? 'persp' : 'ortho', fov: c.fov || DEFAULT_FOV })
        },
        reset: () => glideTo(null),
        focusPin: (id) => {
          const i = pinsRef.current.findIndex((p) => p.id === id)
          const t = worldOfPins()[i]
          if (!t || !Number.isFinite(t[0])) return
          const c = live_()
          glideTo({ ...c, target: t, zoom: Math.max(c.zoom, PIN_ZOOM) })
        },
      }
      setMode(current().mode)
    }
    // Étiquettes ancrées : points de l'arbre → monde (une fois par liste et par machine dessinée), puis pixels avec la
    // matrice de la dernière image. Écrites directement dans le DOM (transform, opacité) : aucun rendu React par image.
    let pinWorld: Vec3[] = []
    let pinFor: readonly Pin[] | null = null
    let pinMachine: MachineDef | null = null
    let pinFrame = 0
    let pinChip: boolean[] = []
    const pinWidth: number[] = []
    // Dernières valeurs écrites (x, y, opacité) : une caméra immobile (la scène seule s'anime) ne réécrit rien dans le DOM.
    let pinLast: number[] = []
    const worldOfPins = () => {
      const list = pinsRef.current
      if (pinFor !== list || pinMachine !== r.drawn) {
        pinFor = list
        pinMachine = r.drawn
        pinWidth.length = 0
        pinChip = []
        pinLast = []
        pinWorld = list.map((p) => {
          const fr = r.drawn.treeFrames?.[p.station ?? 0]
          return fr ? treeToWorld(fr, p.at) : ([NaN, NaN, NaN] as const)
        })
      }
      return pinWorld
    }
    const updatePins = () => {
      const list = pinsRef.current
      if (!list.length || !showRef.current) return
      const f = r.frame
      if (!f) return
      const world = worldOfPins()
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const placed = projectPins(world, f.M, f.camera, f.T, w, h)
      const els = pinEls.current
      // La largeur réelle d'une puce se mesure une fois (à défaut : l'estimation à chasse fixe).
      if (pinWidth.length !== list.length) {
        pinWidth.length = list.length
        for (let i = 0; i < list.length; i++) pinWidth[i] = (els[i]?.children[1] as HTMLElement | undefined)?.offsetWidth || chipWidth(list[i]!.label)
      }
      pinFrame += 1
      if (pinChip.length !== list.length || list.length <= PIN_FULL || pinFrame % 3 === 0)
        pinChip = declutter(placed.map((p, i) => pinRect(p.x, p.y, pinWidth[i]!)), placed.map((p) => p.inside))
      for (let i = 0; i < list.length; i++) {
        const el = els[i]
        const p = placed[i]!
        if (!el) continue
        if (!p.inside) {
          if (el.dataset.v !== '0') {
            el.style.visibility = 'hidden'
            el.dataset.v = '0'
          }
          continue
        }
        if (el.dataset.v !== '1') {
          el.style.visibility = 'visible'
          el.dataset.v = '1'
        }
        const x = p.x - DOT / 2
        const y = p.y - CHIP_H / 2
        const active = el.dataset.active === '1'
        const op = Math.round((active ? 1 : fadeOf(p.near)) * 100)
        if (Math.abs(x - (pinLast[3 * i] ?? 1e9)) > 0.25 || Math.abs(y - (pinLast[3 * i + 1] ?? 1e9)) > 0.25) {
          el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`
          pinLast[3 * i] = x
          pinLast[3 * i + 1] = y
        }
        if (op !== pinLast[3 * i + 2]) {
          el.style.opacity = (op / 100).toString()
          pinLast[3 * i + 2] = op
        }
        const chip = active || pinChip[i] ? '1' : '0'
        if (el.dataset.c !== chip) {
          el.dataset.c = chip
          const c = el.children[1] as HTMLElement
          c.style.opacity = chip
          c.style.pointerEvents = chip === '1' ? 'auto' : 'none'
        }
      }
    }
    const frame = (now: number) => {
      raf = 0
      const [u, built] = at(now)
      const focus = interactive && built >= 1 ? getIsoFocus(focusId ?? machine.id) : null
      stepTween(now)
      stepMotion(now)
      r.draw(u, built, focus)
      updatePins()
      if (canvas.dataset.machine !== r.current) canvas.dataset.machine = r.current
      if (interactive && (first || resized || moved)) {
        resized = false
        moved = false
        const b = canvas.getBoundingClientRect()
        cb.current.onHotspots?.(r.hotspots(b.width, b.height))
      }
      if (first) {
        first = false
        canvas.style.opacity = '1'
        fade = window.setTimeout(() => cb.current.onFirstFrame?.(), still ? 0 : 250)
      }
      // Une image figée (ou pilotée par le défilement) est retracée tant que la caméra glisse.
      if ((!still && drive === 'time') || tween || r.moving || motion()) schedule()
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
    redraw.current = () => {
      // Étiquettes montrées, masquées ou changées : une image (le DOM des étiquettes est écrit dans `frame`).
      for (const el of pinEls.current) if (el) el.dataset.v = ''
      pinFor = null
      pinLast = []
      schedule()
    }
    resize()
    schedule()
    return () => {
      redraw.current = null
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('scroll', onScroll)
      offFocus()
      offLive()
      offGestures()
      api.current = null
      if (raf) cancelAnimationFrame(raf)
      window.clearTimeout(fade)
      r.dispose()
    }
    // `given` ne sert que de repli à la création : il ne recrée pas le contexte d'une scène vivante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, still, drive, transparent, interactive, focusId, avoid, withControls, wrapped])

  const fade: CSSProperties = { opacity: 0, transition: still ? undefined : 'opacity .25s ease-out' }
  if (!wrapped) return <canvas ref={ref} width={1200} height={700} className={className} style={fade} />
  const L: IsoControlLabels = { ...ISO_CONTROL_LABELS, ...(typeof controls === 'object' ? controls.labels : undefined) }
  const positioned = /(^|\s)(absolute|fixed|relative|sticky)(\s|$)/.test(className)
  const act = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const a = e.currentTarget.dataset.act
    const c = api.current
    if (a === 'pins') return setShowPins((v) => !v)
    if (!c) return
    if (a === 'persp') c.toggleMode()
    else if (a === 'reset') c.reset()
    else if (a === 'iso' || a === 'top' || a === 'front' || a === 'side') c.preset(a)
  }
  return (
    <div
      className={className}
      style={positioned ? undefined : { position: 'relative' }}
      onPointerEnter={() => {
        // Première visite : l'astuce du zoom, puis elle s'efface.
        if (hintSeen.current) return
        hintSeen.current = true
        setHint(true)
        window.setTimeout(() => setHint(false), HINT_MS)
      }}
    >
      <canvas
        ref={ref}
        width={1200}
        height={700}
        tabIndex={0}
        aria-label={L.canvas}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Toucher : tant que la scène n'est pas touchée (focalisée), un glissé vertical fait défiler la conversation.
        style={{ ...fade, display: 'block', width: '100%', height: '100%', touchAction: focused || immersive ? 'none' : 'pan-y', cursor: 'grab', outline: focused ? '1px solid rgba(148,163,184,.45)' : 'none', outlineOffset: -1 }}
      />
      {mode && (
        <div role="toolbar" aria-label={L.toolbar} style={BAR}>
          {(['iso', 'top', 'front', 'side', 'persp', 'reset', ...(hasPins ? (['pins'] as const) : [])] as const).map((a) => {
            const pressed = a === 'persp' ? mode === 'persp' : a === 'pins' ? showPins : undefined
            const name = L[`${a}Hint`]
            return (
              <button key={a} type="button" data-act={a} aria-label={name} title={name} aria-pressed={pressed} onClick={act} style={pressed ? { ...BTN, ...BTN_ON } : BTN}>
                {L[a]}
              </button>
            )
          })}
        </div>
      )}
      {hasPins && (
        <div style={{ ...OVERLAY, display: showPins ? 'block' : 'none' }}>
          {pins!.map((p, i) => {
            const color = (LAMP as Record<string, string>)[p.tone ?? ''] ?? LAMP.sky
            const on = activePin === p.id
            return (
              <button
                key={p.id}
                ref={(el) => {
                  pinEls.current[i] = el
                }}
                type="button"
                data-pin={p.id}
                data-active={on ? '1' : undefined}
                aria-label={p.detail ? `${p.label} : ${p.detail}` : p.label}
                style={{ ...PIN, zIndex: on ? 3 : 1, visibility: 'hidden' }}
                onClick={() => {
                  setActivePin(p.id)
                  api.current?.focusPin(p.id)
                  clickRef.current?.(p.id)
                }}
                onPointerEnter={() => setActivePin(p.id)}
                onPointerLeave={() => setActivePin((v) => (v === p.id ? null : v))}
                onFocus={() => setActivePin(p.id)}
                onBlur={() => setActivePin((v) => (v === p.id ? null : v))}
              >
                <span aria-hidden="true" style={PIN_HIT} />
                <span style={{ ...PIN_DOT, background: color, boxShadow: `0 0 0 2px rgba(10,12,18,.6), 0 0 8px ${color}` }} />
                <span style={PIN_CHIP}>{p.label}</span>
                {p.detail && on && (
                  <span role="tooltip" style={PIN_TIP}>
                    {p.detail}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      <div aria-hidden="true" style={{ ...HINT, opacity: hint && !focused && !immersive ? 1 : 0 }}>
        {L.hint}
      </div>
    </div>
  )
}

// Barre compacte, lisible sur fond clair comme sombre (fond sombre translucide, texte clair).
const BAR: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  maxWidth: 'calc(100% - 16px)',
  gap: 2,
  padding: 3,
  borderRadius: 8,
  background: 'rgba(10,12,18,.74)',
  border: '1px solid rgba(148,163,184,.28)',
  boxShadow: '0 2px 10px rgba(0,0,0,.25)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
  fontSize: 11,
  lineHeight: '16px',
}
const BTN: CSSProperties = { padding: '3px 8px', minHeight: 26, minWidth: 30, borderRadius: 5, border: 0, background: 'transparent', color: '#e2e8f0', cursor: 'pointer', font: 'inherit' }
const BTN_ON: CSSProperties = { background: 'rgba(148,163,184,.32)', color: '#fff' }
const HINT: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 10,
  transform: 'translateX(-50%)',
  padding: '3px 10px',
  borderRadius: 999,
  background: 'rgba(10,12,18,.74)',
  color: '#e2e8f0',
  fontSize: 11,
  lineHeight: '16px',
  pointerEvents: 'none',
  transition: 'opacity .5s ease',
  whiteSpace: 'nowrap',
}

// Étiquettes ancrées : la couche ne prend aucun clic (seuls le point et la puce visible le prennent) ; même fond sombre
// translucide que la barre, lisible sur une scène claire comme sombre.
const OVERLAY: CSSProperties = { position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }
const PIN: CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  height: CHIP_H,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  margin: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  font: '11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  color: '#e2e8f0',
  pointerEvents: 'none',
}
// Zone de toucher de 32 px centrée sur le point (doigt), sans changer la mise en page de l'étiquette.
const PIN_HIT: CSSProperties = { position: 'absolute', left: DOT / 2 - 16, top: CHIP_H / 2 - 16, width: 32, height: 32, borderRadius: '50%', pointerEvents: 'auto', cursor: 'pointer' }
const PIN_DOT: CSSProperties = { flex: 'none', width: DOT, height: DOT, borderRadius: '50%', pointerEvents: 'auto', cursor: 'pointer' }
const PIN_CHIP: CSSProperties = {
  height: CHIP_H,
  boxSizing: 'border-box',
  padding: '0 8px',
  lineHeight: `${CHIP_H - 2}px`,
  borderRadius: 6,
  border: '1px solid rgba(148,163,184,.28)',
  background: 'rgba(10,12,18,.82)',
  boxShadow: '0 2px 8px rgba(0,0,0,.22)',
  whiteSpace: 'nowrap',
  opacity: 0,
  pointerEvents: 'none',
  cursor: 'pointer',
  transition: 'opacity .15s ease',
}
const PIN_TIP: CSSProperties = {
  position: 'absolute',
  left: DOT + 4,
  top: CHIP_H + 4,
  width: 'max-content',
  maxWidth: 240,
  padding: '4px 8px',
  borderRadius: 6,
  border: '1px solid rgba(148,163,184,.28)',
  background: 'rgba(10,12,18,.88)',
  color: '#e2e8f0',
  font: '11px/1.4 ui-sans-serif, system-ui, sans-serif',
  whiteSpace: 'normal',
  textAlign: 'left',
  pointerEvents: 'none',
}
