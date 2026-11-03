/**
 * Point d'entrée de la galerie iso_scene, bundlé par esbuild (alias `@` → `src`)
 * dans scripts/iso-shots.mjs — jamais importé par l'application.
 *
 * Ce qu'il mesure : le RENDU réel du moteur 3D, pas une réimplémentation.
 *
 *   - Le VRAI compilateur `compileIsoScene` produit la vraie `MachineDef` (vérifiée
 *     par `defineScene`/`checkAst`, refus listés).
 *   - La scène valide est tirée par le VRAI rendu WebGL 2 `IsoRenderer`
 *     (litRenderer.ts, la classe qu'IsoGL instancie), avec la même caméra que le
 *     composant (`controls` → perspective, `DEFAULT_FOV`, `PERSP_FIT`), en une seule
 *     image `draw(t0, 1)` = la machine COMPLÈTE (ce que rend `IsoStage` en mouvement
 *     réduit). Le repli WebGL indisponible rejoue exactement `IsoSvg` (les mêmes
 *     primitives : `machine.build(t0,1)` + `toView` + `litColor` + `contentBox`).
 *   - La scène INVALIDE monte le VRAI composant `IsoSceneViz` (son bloc de refus).
 *
 * POURQUOI on tire `IsoRenderer` en une image au lieu de laisser `IsoStage` animer :
 * en headless Chrome, une scène `still` (un seul tirage, `preserveDrawingBuffer:false`)
 * est effacée par le compositeur, et une scène animée (9 postes WebGL SwiftShader en
 * boucle) sature le thread principal et fait pendre le CDP. Une seule image
 * SYNCHRONE par tuile est déterministe, légère et fidèle (même machine, même caméra).
 *
 * `@/i18n` est remplacé par scripts/iso-i18n-stub.ts (le vrai module utilise
 * `import.meta.glob`, une primitive Vite qu'esbuild ne transforme pas) ; seul
 * `IsoSceneViz` en consomme `useT()` pour son bloc de refus.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import IsoSceneViz from '@/components/chat/viz/iso/IsoSceneViz'
import { compileIsoScene, type IsoCompile } from '@/components/chat/viz/iso/compile'
import { IsoRenderer } from '@/vendor/three-iso/litRenderer'
import { DEFAULT_FOV, PERSP_FIT } from '@/vendor/three-iso/camera'
import { contentBox } from '@/vendor/three-iso/fit'
import { toView } from '@/vendor/three-iso/compose'
import { litColor } from '@/vendor/three-iso/shading'
import type { MachineDef } from '@/vendor/three-iso/machine'

interface GalleryScene {
  slug: string
  title: string
  intent: string
  expect: 'ok' | 'refused'
  data: unknown
}

// Mode ?live=<slug> : une seule scène, montée par le composant réel (IsoSceneViz → IsoGL), pour vérifier ce qui ne se
// voit pas sur une image fixe : la tournée des vues, et le fait qu'elle rende la main.
const liveSlug = new URLSearchParams(location.search).get('live')

const scenes: GalleryScene[] = (window as unknown as { __ISO_GALLERY__?: GalleryScene[] }).__ISO_GALLERY__ ?? []

// compileIsoScene est pur et déterministe : on le calcule UNE fois par scène
// (le SDF maillé coûte une passe de marching-tetrahedra, on évite de la refaire).
const compiled = new Map<string, IsoCompile>(scenes.map((s) => [s.slug, compileIsoScene(s.data)]))

/** Le repli WebGL indisponible : la MÊME géométrie que `IsoSvg` (composant réel). */
function IsoSvgFallback({ machine }: { machine: MachineDef }) {
  const b = contentBox(machine)
  return (
    <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="xMidYMid meet" className="iso-fallback-svg" data-testid="iso-scene-svg" focusable="false">
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

/** Une scène valide : une image WebGL synchrone (la machine complète), ou le SVG de repli. */
function SceneCanvas({ machine }: { machine: MachineDef }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [noGl, setNoGl] = useState(false)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas || noGl) return
    try {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      const r = new IsoRenderer(canvas, machine, true)
      r.setDefaults({ mode: 'persp', fov: DEFAULT_FOV, zoom: PERSP_FIT })
      // ?built=0.35 : tire un INSTANT de la construction (0 = rien, 1 = fini) — c'est ainsi qu'on voit les ouvriers
      // au travail, sinon le banc ne montre que la machine finie et personne ne peut juger l'apparition.
      const built = Number(new URLSearchParams(location.search).get('built') ?? 1)
      r.draw(machine.t0, Number.isFinite(built) ? Math.min(1, Math.max(0, built)) : 1, null)
    } catch {
      setNoGl(true)
    }
  }, [machine, noGl])
  if (noGl) return <IsoSvgFallback machine={machine} />
  return <canvas ref={ref} width={340} height={340} style={{ display: 'block', width: '100%', height: '100%' }} />
}

function Tile({ scene }: { scene: GalleryScene }) {
  const r = useMemo(() => compiled.get(scene.slug)!, [scene.slug])
  return (
    <div className="tile" data-slug={scene.slug} data-expect={scene.expect}>
      <div className="tile-stage">
        {r.ok ? <SceneCanvas machine={r.machine} /> : <IsoSceneViz data={scene.data as Record<string, unknown>} expanded fallbackText={scene.title} title={scene.title} />}
      </div>
      <div className="tile-caption">
        <div className="tile-id">
          <code>{scene.slug}</code>
          <span className="tile-title">{scene.title}</span>
        </div>
        <div className="tile-meta" data-meta />
        <div className="tile-intent">{scene.intent}</div>
      </div>
    </div>
  )
}

function App() {
  useEffect(() => {
    // Les effets enfants (tirages synchrones) ont déjà tourné : on relève le rendu.
    const tiles = Array.from(document.querySelectorAll<HTMLElement>('.tile'))
    const result = tiles.map((tile) => {
      const slug = tile.dataset.slug!
      const scene = scenes.find((s) => s.slug === slug)!
      const r = compiled.get(slug)!
      const meta = tile.querySelector<HTMLElement>('[data-meta]')!
      const canvas = tile.querySelector<HTMLCanvasElement>('canvas')
      const svg = tile.querySelector<SVGSVGElement>('[data-testid="iso-scene-svg"]')
      const refused = tile.querySelector('[data-testid="iso-scene-refused"]')
      let renderer = 'unknown'
      let res: string | null = null
      if (refused) {
        renderer = 'refused'
        meta.textContent = `refusé · ${r.problems.join(' ; ')}`
      } else if (canvas) {
        renderer = 'webgl'
        res = `${canvas.width}×${canvas.height}`
        meta.textContent = `renderer: webgl · res: ${res}`
      } else if (svg) {
        renderer = 'svg'
        const b = svg.getBoundingClientRect()
        res = `${Math.round(b.width)}×${Math.round(b.height)}`
        meta.textContent = `renderer: svg · res: ${res}`
      }
      meta.dataset.renderer = renderer
      return { slug, title: scene.title, expect: scene.expect, ok: r.ok, problems: r.ok ? [] : r.problems, renderer, res, meta: meta.textContent ?? '' }
    })
    ;(window as unknown as { __ISO_GALLERY_RESULT__?: unknown }).__ISO_GALLERY_RESULT__ = result
    ;(window as unknown as { __ISO_READY__?: boolean }).__ISO_READY__ = true
  }, [])
  // Mode vivant : une scène, le composant réel. C'est le seul chemin qui joue la tournée des vues et le cycle.
  if (liveSlug) {
    const sc = scenes.find((x) => x.slug === liveSlug)
    if (!sc) return <p>scène inconnue : {liveSlug}</p>
    return (
      <div style={{ width: 900, height: 640 }}>
        <IsoSceneViz data={sc.data as Record<string, unknown>} expanded title={sc.title} />
      </div>
    )
  }

  return (
    <div className="gallery">
      <header className="gallery-head">
        <h1>Galerie iso_scene</h1>
        <p>Le rendu réel du moteur 3D isométrique (machine complète), un objet par tuile — WebGL, sinon SVG.</p>
      </header>
      <div className="grid">
        {scenes.map((s) => (
          <Tile key={s.slug} scene={s} />
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
