// ============================================================================
// ACTIVITY HEATMAP 3D — Cinematic glass bar chart with spotlight lighting
// ============================================================================
//
// Renders the 7×24 (day × hour) activity grid as a 3D bar chart with:
// - Tinted glass material (MeshPhysicalMaterial with transmission)
// - Bar height AND opacity mapped to event count
// - Cyan tint matching the 2D heatmap color (#22d3ee)
// - Spotlights only on the top 2-3 busiest DAYS (not per-cell)
// - All bars remain visible via ambient/hemisphere fill lighting
// - Diagonal top-down camera with OrbitControls
//
// ============================================================================

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'

// ── Types ──────────────────────────────────────────────────────────────────

type TimelineEventType =
  | 'note_created'
  | 'note_confirmed'
  | 'decision'
  | 'commit'
  | 'skill_created'
  | 'skill_activated'
  | 'protocol_transition'

interface TimelineEvent {
  id: string
  type: TimelineEventType
  date: Date
  label: string
  detail?: string
  fullContent?: string
}

const EVENT_COLORS: Record<TimelineEventType, string> = {
  note_created: '#3B82F6',
  note_confirmed: '#4ade80',
  decision: '#8B5CF6',
  commit: '#64748B',
  skill_created: '#EC4899',
  skill_activated: '#fbbf24',
  protocol_transition: '#F97316',
}

interface TooltipData {
  x: number
  y: number
  day: string
  hour: number
  count: number
  events: TimelineEvent[]
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Base cyan matching the 2D heatmap */
const CYAN = new THREE.Color(0x22d3ee)

// ── Component ──────────────────────────────────────────────────────────────

export function ActivityHeatmap3D({
  events,
}: {
  events: TimelineEvent[]
  color?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const animFrameRef = useRef<number>(0)
  const hoveredRef = useRef<THREE.Mesh | null>(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2(-999, -999))

  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  // ── Build the 7×24 grid ────────────────────────────────────────────────
  const { grid, maxCount, eventsByCell, dayTotals } = useMemo(() => {
    const counts: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    const map = new Map<string, TimelineEvent[]>()

    for (const ev of events) {
      const day = ev.date.getDay()
      const hour = ev.date.getHours()
      counts[day][hour]++
      const key = `${day}-${hour}`
      const arr = map.get(key) || []
      arr.push(ev)
      map.set(key, arr)
    }

    let m = 0
    for (const row of counts) for (const v of row) if (v > m) m = v

    // Aggregate totals per day for spotlight placement
    const totals = counts.map((row) => row.reduce((s, v) => s + v, 0))

    return { grid: counts, maxCount: m || 1, eventsByCell: map, dayTotals: totals }
  }, [events])

  // ── Mouse tracking for raycasting ──────────────────────────────────────
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }, [])

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.set(-999, -999)
    setTooltip(null)
    if (hoveredRef.current) {
      const ud = hoveredRef.current.userData
      const mat = hoveredRef.current.material as THREE.MeshPhysicalMaterial
      mat.emissiveIntensity = ud.baseEmissive
      hoveredRef.current = null
    }
  }, [])

  // ── Three.js setup ─────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const width = container.clientWidth
    const height = 360

    // ── Scene ──
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x080c14)
    // No fog — we want ALL bars visible, even far ones
    // scene.fog = new THREE.FogExp2(0x080c14, 0.008)

    // ── Camera — diagonal top-down ──
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 200)
    camera.position.set(20, 22, 20)
    camera.lookAt(12, 0, 3.5)

    // ── Renderer ──
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.4
    container.appendChild(renderer.domElement)

    // ── Postprocessing — subtle bloom for glass glow ──
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.4,   // strength — subtle
      0.6,   // radius
      0.9,   // threshold — only bright things bloom
    )
    composer.addPass(bloomPass)

    // ── Controls ──
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(12, 0, 3.5)
    controls.minDistance = 10
    controls.maxDistance = 60
    controls.maxPolarAngle = Math.PI / 2.1
    controls.update()

    // ── Lighting ──

    // Ambient — strong enough that EVERY bar is visible
    const ambient = new THREE.AmbientLight(0x64748b, 1.5)
    scene.add(ambient)

    // Hemisphere — cyan from above, dark blue from below
    const hemi = new THREE.HemisphereLight(0x22d3ee, 0x1e293b, 0.6)
    scene.add(hemi)

    // Directional — fills from the front-left for depth/shadows
    const dirLight = new THREE.DirectionalLight(0xcbd5e1, 0.5)
    dirLight.position.set(-10, 15, 10)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(1024, 1024)
    dirLight.shadow.camera.left = -15
    dirLight.shadow.camera.right = 30
    dirLight.shadow.camera.top = 12
    dirLight.shadow.camera.bottom = -5
    scene.add(dirLight)

    // ── Ground plane ──
    const groundGeo = new THREE.PlaneGeometry(40, 20)
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0c1222,
      roughness: 0.95,
      metalness: 0.05,
    })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(12, -0.01, 3.5)
    ground.receiveShadow = true
    scene.add(ground)

    // ── Grid helper (very subtle) ──
    const gridLines = new THREE.GridHelper(40, 40, 0x162032, 0x0f1724)
    gridLines.position.set(12, 0, 3.5)
    scene.add(gridLines)

    // ── Build glass bars ──
    const bars: THREE.Mesh[] = []
    const barGeo = new THREE.BoxGeometry(0.85, 1, 0.85)
    barGeo.translate(0, 0.5, 0) // bottom at y=0

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const count = grid[day][hour]
        const t = count / maxCount // 0→1

        const barHeight = count === 0 ? 0.12 : 0.25 + t * 7
        const isEmpty = count === 0

        // ── Glass material — all bars are tinted cyan, ALL visible ──
        // Empty cells: still visible as dim glass stubs
        // Active cells: intensity drives opacity & glow
        const opacity = isEmpty ? 0.25 : 0.4 + t * 0.5
        const transmission = isEmpty ? 0.8 : Math.max(0.05, 0.55 - t * 0.5)
        const emissiveIntensity = isEmpty ? 0.05 : 0.1 + t * 0.45

        // Color: all cyan-tinted — empty=dark teal, active=bright cyan
        const barColor = new THREE.Color().lerpColors(
          new THREE.Color(0x155e75), // darker teal (but still visible)
          CYAN,
          isEmpty ? 0.15 : Math.max(0.3, t),
        )

        const mat = new THREE.MeshPhysicalMaterial({
          color: barColor,
          emissive: CYAN.clone(),
          emissiveIntensity,
          transparent: true,
          opacity,
          transmission,
          roughness: 0.15,
          metalness: 0.0,
          thickness: 0.8,
          ior: 1.4,
          envMapIntensity: 0.5,
          side: THREE.DoubleSide,
        })

        const bar = new THREE.Mesh(barGeo, mat)
        bar.position.set(hour, 0, day)
        bar.scale.y = barHeight
        bar.castShadow = !isEmpty
        bar.receiveShadow = true

        bar.userData = {
          day,
          hour,
          count,
          intensity: t,
          baseEmissive: emissiveIntensity,
          baseScaleY: barHeight,
          baseOpacity: opacity,
        }

        scene.add(bar)
        bars.push(bar)
      }
    }

    // ── Spotlights — only on the top 2-3 busiest DAYS ──
    const maxDayTotal = Math.max(...dayTotals, 1)
    const dayRanked = dayTotals
      .map((total, day) => ({ day, total, t: total / maxDayTotal }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3) // max 3 spotlights

    for (const { day, t } of dayRanked) {
      // Only spotlight days that are at least 40% of the busiest day
      if (t < 0.4) continue

      const spotIntensity = 1.5 + t * 3
      const spotColor = new THREE.Color().lerpColors(
        new THREE.Color(0x0ea5e9), // sky-500
        new THREE.Color(0xe0f2fe), // sky-100
        t * 0.6,
      )

      const spot = new THREE.SpotLight(
        spotColor,
        spotIntensity,
        30,             // distance
        Math.PI / 5,    // angle — wide enough to cover the full row
        0.6,            // penumbra — soft edges
        1.2,            // decay
      )
      // Center the spot over the middle of the day's row (hour 11.5)
      spot.position.set(11.5, 14, day)
      spot.target.position.set(11.5, 0, day)
      spot.castShadow = true
      spot.shadow.mapSize.set(512, 512)
      scene.add(spot)
      scene.add(spot.target)
    }

    // Fallback: if no days qualify, add a subtle general overhead
    if (dayRanked.length === 0 || dayRanked[0].t < 0.4) {
      const fallback = new THREE.PointLight(0x22d3ee, 1.0, 50)
      fallback.position.set(12, 14, 3.5)
      scene.add(fallback)
    }

    // ── Day labels ──
    for (let day = 0; day < 7; day++) {
      const sprite = makeTextSprite(DAYS[day], {
        fontSize: 28,
        color: '#64748b',
      })
      sprite.position.set(-1.5, 0.1, day)
      sprite.scale.set(1.6, 0.5, 1)
      scene.add(sprite)
    }

    // ── Hour labels ──
    for (let h = 0; h < 24; h += 3) {
      const sprite = makeTextSprite(`${h}h`, {
        fontSize: 24,
        color: '#475569',
      })
      sprite.position.set(h, 0.1, 7.5)
      sprite.scale.set(1.2, 0.4, 1)
      scene.add(sprite)
    }

    // ── Listeners ──
    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)

    // ── Resize ──
    const handleResize = () => {
      if (!container) return
      const w = container.clientWidth
      camera.aspect = w / height
      camera.updateProjectionMatrix()
      renderer.setSize(w, height)
      composer.setSize(w, height)
    }
    const resizeObs = new ResizeObserver(handleResize)
    resizeObs.observe(container)

    // ── Animate ──
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()

      // Raycasting for hover
      raycasterRef.current.setFromCamera(mouseRef.current, camera)
      const intersects = raycasterRef.current.intersectObjects(bars)

      // Reset previous hover
      if (hoveredRef.current) {
        const ud = hoveredRef.current.userData
        const mat = hoveredRef.current.material as THREE.MeshPhysicalMaterial
        mat.emissiveIntensity = ud.baseEmissive
        mat.opacity = ud.baseOpacity
        hoveredRef.current.scale.y = ud.baseScaleY
        hoveredRef.current = null
      }

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh
        if (hit.userData.count > 0) {
          hoveredRef.current = hit
          const mat = hit.material as THREE.MeshPhysicalMaterial
          // Brighten on hover
          mat.emissiveIntensity = Math.min(hit.userData.baseEmissive + 0.35, 0.9)
          mat.opacity = Math.min(hit.userData.baseOpacity + 0.2, 1)
          hit.scale.y = hit.userData.baseScaleY * 1.06

          // Project 3D → screen for tooltip
          const pos = new THREE.Vector3()
          pos.copy(hit.position)
          pos.y = hit.scale.y + 0.5
          pos.project(camera)

          const rect = container.getBoundingClientRect()
          const screenX = ((pos.x + 1) / 2) * rect.width
          const screenY = ((-pos.y + 1) / 2) * rect.height

          setTooltip({
            x: screenX,
            y: screenY,
            day: DAYS[hit.userData.day],
            hour: hit.userData.hour,
            count: hit.userData.count,
            events: eventsByCell.get(`${hit.userData.day}-${hit.userData.hour}`) || [],
          })
        } else {
          setTooltip(null)
        }
      } else {
        setTooltip(null)
      }

      composer.render()
    }
    animate()

    // ── Cleanup ──
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      resizeObs.disconnect()
      controls.dispose()
      renderer.dispose()
      composer.dispose()

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (obj.material instanceof THREE.Material) obj.material.dispose()
        }
      })

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [grid, maxCount, eventsByCell, dayTotals, handleMouseMove, handleMouseLeave])

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden"
        style={{ height: 360, cursor: 'grab' }}
      />

      {/* Tooltip overlay */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -110%)',
          }}
        >
          <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-700/80 rounded-lg px-3 py-2 shadow-xl min-w-[180px] max-w-[260px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-cyan-400">
                {tooltip.day} {tooltip.hour}:00–{tooltip.hour + 1}:00
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                {tooltip.count} event{tooltip.count !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="space-y-1">
              {tooltip.events.slice(0, 4).map((ev) => (
                <div key={ev.id} className="flex items-center gap-1.5">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: EVENT_COLORS[ev.type] }}
                  />
                  <span className="text-[9px] text-slate-400 truncate">{ev.label}</span>
                </div>
              ))}
              {tooltip.events.length > 4 && (
                <span className="text-[8px] text-slate-600">
                  +{tooltip.events.length - 4} more
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-2 right-3 text-[9px] text-slate-600 pointer-events-none">
        Drag to rotate · Scroll to zoom
      </div>
    </div>
  )
}

// ── Text sprite helper ─────────────────────────────────────────────────────

function makeTextSprite(
  text: string,
  opts: { fontSize?: number; color?: string } = {},
): THREE.Sprite {
  const fontSize = opts.fontSize ?? 32
  const color = opts.color ?? '#94a3b8'

  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 48
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  const tex = new THREE.CanvasTexture(canvas)
  tex.minFilter = THREE.LinearFilter
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
  return new THREE.Sprite(mat)
}
