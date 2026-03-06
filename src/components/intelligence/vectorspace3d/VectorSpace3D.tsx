// ============================================================================
// VectorSpace3D — Three.js 3D scatter plot for UMAP embeddings
// ============================================================================
//
// Renders projection points as instanced spheres in a 3D scene with:
// - OrbitControls for rotation, pan, zoom
// - Color by entity type, size by importance, opacity by energy
// - Synapse lines between connected notes
// - Skill cluster hulls as transparent meshes
// - Raycaster-based hover/click interactions
// ============================================================================

import { useRef, useEffect, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import SpriteText from 'three-spritetext'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type {
  ProjectionPoint,
  ProjectionSynapse,
  ProjectionSkill,
} from '@/types/intelligence'

// ── Constants ──────────────────────────────────────────────────────────────────

const BG_COLOR = 0x0f172a
const WORLD_SIZE = 600 // normalize UMAP coords to this range (tighter = bigger relative points)

const POINT_COLORS: Record<string, string> = {
  note: ENTITY_COLORS.note,       // #F59E0B amber
  decision: ENTITY_COLORS.decision, // #8B5CF6 violet
  skill: ENTITY_COLORS.skill,     // #EC4899 pink
}

const IMPORTANCE_SCALE: Record<string, number> = {
  critical: 2.0,
  high: 1.6,
  medium: 1.2,
  low: 0.9,
}

const BASE_POINT_RADIUS = 5 // base sphere radius before importance scaling
const SYNAPSE_COLOR = 0x22d3ee // cyan
const SKILL_COLOR = 0xec4899   // pink
const OUTLIER_PERCENTILE = 0.02 // trim 2% outliers on each side for normalization

// ── Props ──────────────────────────────────────────────────────────────────────

interface VectorSpace3DProps {
  points: ProjectionPoint[]
  synapses: ProjectionSynapse[]
  skills: ProjectionSkill[]
  onPointHover?: (point: ProjectionPoint | null) => void
  onPointClick?: (point: ProjectionPoint | null) => void
  showSynapses: boolean
  showSkills: boolean
}

// ── Coordinate normalization ───────────────────────────────────────────────────

interface NormalizedBounds {
  scale: number
  offsetX: number
  offsetY: number
  offsetZ: number
}

/** Percentile-based normalization to ignore outliers that compress the point cloud */
function normalizeCoords(points: ProjectionPoint[]): NormalizedBounds {
  if (points.length === 0) return { scale: 1, offsetX: 0, offsetY: 0, offsetZ: 0 }

  const xs = points.map(p => p.x).sort((a, b) => a - b)
  const ys = points.map(p => p.y).sort((a, b) => a - b)
  const zs = points.map(p => p.z ?? 0).sort((a, b) => a - b)

  // Trim outliers using percentile bounds
  const lo = Math.floor(points.length * OUTLIER_PERCENTILE)
  const hi = Math.max(lo, points.length - 1 - lo)

  const minX = xs[lo], maxX = xs[hi]
  const minY = ys[lo], maxY = ys[hi]
  const minZ = zs[lo], maxZ = zs[hi]

  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const rangeZ = maxZ - minZ || 1
  const maxRange = Math.max(rangeX, rangeY, rangeZ)
  const scale = WORLD_SIZE / maxRange

  // Use midpoints as offset so that points are centered at origin
  return {
    scale,
    offsetX: (minX + maxX) / 2,
    offsetY: (minY + maxY) / 2,
    offsetZ: (minZ + maxZ) / 2,
  }
}

function toWorld(p: ProjectionPoint, bounds: NormalizedBounds): THREE.Vector3 {
  // offset is already the midpoint → subtracting it centers data at origin
  return new THREE.Vector3(
    (p.x - bounds.offsetX) * bounds.scale,
    (p.y - bounds.offsetY) * bounds.scale,
    ((p.z ?? 0) - bounds.offsetZ) * bounds.scale,
  )
}

// ── Convex Hull (gift wrapping for 3D → use ConvexGeometry) ────────────────────

function buildConvexHullGeometry(positions: THREE.Vector3[]): THREE.BufferGeometry | null {
  if (positions.length < 4) {
    // Not enough for a 3D hull — create a triangle or return null
    if (positions.length < 3) return null
    const geo = new THREE.BufferGeometry()
    const verts = new Float32Array(positions.length * 3)
    positions.forEach((p, i) => {
      verts[i * 3] = p.x
      verts[i * 3 + 1] = p.y
      verts[i * 3 + 2] = p.z
    })
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    if (positions.length === 3) {
      geo.setIndex([0, 1, 2])
    }
    return geo
  }

  // Simple convex hull via iterative expansion
  // For production, we'd use a proper library, but this works for skill clusters
  // Use Three.js ConvexGeometry approach with sorted points
  try {
    // Create a sphere-like hull by projecting to convex surface
    const center = new THREE.Vector3()
    positions.forEach(p => center.add(p))
    center.divideScalar(positions.length)

    // Sort points by angle from center and create triangulated mesh
    const geo = new THREE.BufferGeometry()
    const vertices: number[] = []
    const indices: number[] = []

    // Add center as vertex 0
    vertices.push(center.x, center.y, center.z)

    // Add all other vertices
    for (const p of positions) {
      vertices.push(p.x, p.y, p.z)
    }

    // Create fan triangles from center to pairs of nearby points
    // Sort by angle relative to an arbitrary axis
    const sorted = positions.map((p, i) => ({
      idx: i + 1,
      angle: Math.atan2(p.y - center.y, p.x - center.x),
    })).sort((a, b) => a.angle - b.angle)

    for (let i = 0; i < sorted.length; i++) {
      const next = (i + 1) % sorted.length
      indices.push(0, sorted[i].idx, sorted[next].idx)
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  } catch {
    return null
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function VectorSpace3D({
  points,
  synapses,
  skills,
  onPointHover,
  onPointClick,
  showSynapses,
  showSkills,
}: VectorSpace3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())
  const rafRef = useRef(0)
  const hoveredIdxRef = useRef<number>(-1)
  const labelSpriteRef = useRef<SpriteText | null>(null)

  // Groups for easy cleanup
  const pointsGroupRef = useRef<THREE.Group>(new THREE.Group())
  const synapsesGroupRef = useRef<THREE.Group>(new THREE.Group())
  const skillsGroupRef = useRef<THREE.Group>(new THREE.Group())
  const labelsGroupRef = useRef<THREE.Group>(new THREE.Group())

  // Keep stable refs for point lookup
  const pointMeshesRef = useRef<THREE.Mesh[]>([])
  const pointDataRef = useRef<ProjectionPoint[]>([])
  const boundsRef = useRef<NormalizedBounds>({ scale: 1, offsetX: 0, offsetY: 0, offsetZ: 0 })

  // ── Normalize bounds ───────────────────────────────────────────────────
  const bounds = useMemo(() => normalizeCoords(points), [points])
  boundsRef.current = bounds
  pointDataRef.current = points

  // ── Scene setup (once) ──────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(BG_COLOR)
    const rect = container.getBoundingClientRect()
    renderer.setSize(rect.width, rect.height)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Scene — NO fog so distant points remain visible
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(BG_COLOR)
    sceneRef.current = scene

    // Camera — will be positioned by auto-fit after points are built
    const camera = new THREE.PerspectiveCamera(55, rect.width / rect.height, 0.5, 20000)
    camera.position.set(0, 0, WORLD_SIZE * 1.2)
    cameraRef.current = camera

    // Lights — brighter for better visibility
    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5)
    dirLight.position.set(200, 400, 300)
    scene.add(dirLight)
    const backLight = new THREE.DirectionalLight(0x4488ff, 0.2)
    backLight.position.set(-200, -100, -300)
    scene.add(backLight)

    // Controls — wide zoom range for exploration
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.minDistance = 10
    controls.maxDistance = 10000
    controls.rotateSpeed = 0.6
    controls.zoomSpeed = 1.5
    controls.panSpeed = 0.8
    controlsRef.current = controls

    // Groups
    scene.add(pointsGroupRef.current)
    scene.add(synapsesGroupRef.current)
    scene.add(skillsGroupRef.current)
    scene.add(labelsGroupRef.current)

    // Axes helper (subtle, centered at origin)
    const axes = new THREE.AxesHelper(WORLD_SIZE * 0.4)
    const axesMat = axes.material as THREE.Material
    axesMat.transparent = true
    axesMat.opacity = 0.12
    axesMat.depthWrite = false
    scene.add(axes)

    // Grid helper (on XZ plane, at y=0)
    const grid = new THREE.GridHelper(WORLD_SIZE, 30, 0x1e293b, 0x1e293b)
    const gridMat = grid.material as THREE.Material
    gridMat.transparent = true
    gridMat.opacity = 0.15
    gridMat.depthWrite = false
    scene.add(grid)

    // Animation loop
    function animate() {
      rafRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setSize(width, height)
        }
      }
    })
    resizeObserver.observe(container)

    return () => {
      cancelAnimationFrame(rafRef.current)
      resizeObserver.disconnect()
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, []) // mount once

  // ── Build points + auto-fit camera ──────────────────────────────────────
  useEffect(() => {
    const group = pointsGroupRef.current

    // Clear previous
    while (group.children.length > 0) {
      const child = group.children[0]
      group.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) child.material.dispose()
      }
    }
    pointMeshesRef.current = []

    if (points.length === 0) return

    const sphereGeo = new THREE.SphereGeometry(1, 16, 12)
    const meshes: THREE.Mesh[] = []
    const allPositions: THREE.Vector3[] = []

    for (const point of points) {
      const color = POINT_COLORS[point.type] ?? '#6B7280'
      const scale = (IMPORTANCE_SCALE[point.importance] ?? 1.0) * BASE_POINT_RADIUS
      const energyAlpha = Math.max(0.5, Math.min(1, point.energy))

      const material = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color),
        emissive: new THREE.Color(color),
        emissiveIntensity: 0.2 + point.energy * 0.5,
        shininess: 80,
        transparent: true,
        opacity: energyAlpha,
      })

      const mesh = new THREE.Mesh(sphereGeo, material)
      const pos = toWorld(point, bounds)
      mesh.position.copy(pos)
      mesh.scale.setScalar(scale)
      mesh.userData = { pointIndex: meshes.length }

      group.add(mesh)
      meshes.push(mesh)
      allPositions.push(pos)

      // Glow halo for high-energy points
      if (point.energy > 0.5) {
        const glowGeo = new THREE.SphereGeometry(1, 8, 6)
        const glowMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(color),
          transparent: true,
          opacity: point.energy * 0.2,
          side: THREE.BackSide,
        })
        const glow = new THREE.Mesh(glowGeo, glowMat)
        glow.position.copy(pos)
        glow.scale.setScalar(scale * 2.5)
        group.add(glow)
      }
    }

    pointMeshesRef.current = meshes

    // ── Auto-fit camera to point cloud bounding sphere ──
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (camera && controls && allPositions.length > 0) {
      // Compute center of mass
      const center = new THREE.Vector3()
      for (const pos of allPositions) center.add(pos)
      center.divideScalar(allPositions.length)

      // Compute bounding sphere radius from center
      let maxDist = 0
      for (const pos of allPositions) {
        const d = pos.distanceTo(center)
        if (d > maxDist) maxDist = d
      }
      const radius = Math.max(maxDist, 50) // minimum radius

      // Position camera to see entire cloud with margin
      const fov = camera.fov * (Math.PI / 180)
      const cameraDistance = (radius / Math.sin(fov / 2)) * 1.3 // 30% margin

      // Place camera at a nice angle (slightly above and to the side)
      camera.position.set(
        center.x + cameraDistance * 0.5,
        center.y + cameraDistance * 0.35,
        center.z + cameraDistance * 0.8,
      )
      camera.lookAt(center)
      camera.updateProjectionMatrix()

      // Set orbit controls target to center of mass
      controls.target.copy(center)
      controls.update()
    }
  }, [points, bounds])

  // ── Build synapses ──────────────────────────────────────────────────────
  useEffect(() => {
    const group = synapsesGroupRef.current
    while (group.children.length > 0) {
      const child = group.children[0]
      group.remove(child)
      if (child instanceof THREE.LineSegments || child instanceof THREE.Line) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) child.material.dispose()
      }
    }

    if (!showSynapses || synapses.length === 0) return

    const pointMap = new Map(points.map((p, i) => [p.id, i]))
    const positions: number[] = []
    const colors: number[] = []
    const synapseColor = new THREE.Color(SYNAPSE_COLOR)

    for (const syn of synapses) {
      const srcIdx = pointMap.get(syn.source)
      const tgtIdx = pointMap.get(syn.target)
      if (srcIdx === undefined || tgtIdx === undefined) continue

      const srcPos = toWorld(points[srcIdx], bounds)
      const tgtPos = toWorld(points[tgtIdx], bounds)

      positions.push(srcPos.x, srcPos.y, srcPos.z)
      positions.push(tgtPos.x, tgtPos.y, tgtPos.z)

      const alpha = Math.max(0.1, Math.min(0.8, syn.weight))
      colors.push(synapseColor.r, synapseColor.g, synapseColor.b, alpha)
      colors.push(synapseColor.r, synapseColor.g, synapseColor.b, alpha)
    }

    if (positions.length === 0) return

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))

    const mat = new THREE.LineBasicMaterial({
      color: SYNAPSE_COLOR,
      transparent: true,
      opacity: 0.25,
      linewidth: 1,
    })

    const lines = new THREE.LineSegments(geo, mat)
    group.add(lines)
  }, [points, synapses, bounds, showSynapses])

  // ── Build skill hulls ───────────────────────────────────────────────────
  useEffect(() => {
    const group = skillsGroupRef.current
    while (group.children.length > 0) {
      const child = group.children[0]
      group.remove(child)
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose()
        if (child.material instanceof THREE.Material) child.material.dispose()
      }
    }

    if (!showSkills || skills.length === 0) return

    const pointMap = new Map(points.map(p => [p.id, p]))

    for (const skill of skills) {
      const memberPositions = skill.member_ids
        .map(id => pointMap.get(id))
        .filter((p): p is ProjectionPoint => p != null)
        .map(p => toWorld(p, bounds))

      if (memberPositions.length < 3) continue

      // Expand hull outward by 10%
      const center = new THREE.Vector3()
      memberPositions.forEach(p => center.add(p))
      center.divideScalar(memberPositions.length)

      const expanded = memberPositions.map(p => {
        const dir = p.clone().sub(center).normalize()
        return p.clone().add(dir.multiplyScalar(15))
      })

      const hullGeo = buildConvexHullGeometry(expanded)
      if (!hullGeo) continue

      // Transparent fill
      const fillMat = new THREE.MeshBasicMaterial({
        color: SKILL_COLOR,
        transparent: true,
        opacity: 0.06,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      const fillMesh = new THREE.Mesh(hullGeo, fillMat)
      group.add(fillMesh)

      // Wireframe border
      const wireMat = new THREE.MeshBasicMaterial({
        color: SKILL_COLOR,
        transparent: true,
        opacity: 0.3,
        wireframe: true,
      })
      const wireMesh = new THREE.Mesh(hullGeo.clone(), wireMat)
      group.add(wireMesh)

      // Skill label at centroid
      const label = new SpriteText(skill.name)
      label.color = '#EC4899'
      label.textHeight = 12
      label.backgroundColor = 'rgba(15, 23, 42, 0.7)'
      label.padding = [2, 1]
      label.borderRadius = 3
      label.borderWidth = 0.5
      label.borderColor = '#EC4899'
      label.position.copy(center)
      group.add(label as unknown as THREE.Object3D)
    }
  }, [points, skills, bounds, showSkills])

  // ── Raycaster hover/click ───────────────────────────────────────────────
  const handlePointerMove = useCallback((event: PointerEvent) => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    const camera = cameraRef.current
    if (!camera) return

    raycasterRef.current.setFromCamera(mouseRef.current, camera)
    const intersects = raycasterRef.current.intersectObjects(pointMeshesRef.current, false)

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh
      const idx = mesh.userData.pointIndex as number
      if (idx !== hoveredIdxRef.current) {
        hoveredIdxRef.current = idx
        container.style.cursor = 'pointer'
        onPointHover?.(pointDataRef.current[idx])

        // Update label
        updateHoverLabel(idx)
      }
    } else if (hoveredIdxRef.current !== -1) {
      hoveredIdxRef.current = -1
      container.style.cursor = 'grab'
      onPointHover?.(null)
      clearHoverLabel()
    }
  }, [onPointHover])

  const handleClick = useCallback((event: MouseEvent) => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )

    const camera = cameraRef.current
    if (!camera) return

    raycasterRef.current.setFromCamera(mouse, camera)
    const intersects = raycasterRef.current.intersectObjects(pointMeshesRef.current, false)

    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh
      const idx = mesh.userData.pointIndex as number
      onPointClick?.(pointDataRef.current[idx])
    } else {
      onPointClick?.(null)
    }
  }, [onPointClick])

  // ── Hover label management ──────────────────────────────────────────────
  const updateHoverLabel = useCallback((idx: number) => {
    clearHoverLabel()
    const point = pointDataRef.current[idx]
    if (!point) return

    const pos = toWorld(point, boundsRef.current)
    const text = point.content_preview
      ? point.content_preview.slice(0, 50) + (point.content_preview.length > 50 ? '…' : '')
      : point.type

    // Scale label size relative to camera distance for readability
    const camera = cameraRef.current
    const dist = camera ? camera.position.distanceTo(pos) : 200
    const textH = Math.max(3, Math.min(12, dist * 0.025))
    const offset = textH * 3

    const color = POINT_COLORS[point.type] ?? '#6B7280'
    const sprite = new SpriteText(text)
    sprite.color = '#e2e8f0'
    sprite.textHeight = textH
    sprite.backgroundColor = 'rgba(15, 23, 42, 0.92)'
    sprite.padding = [3, 2]
    sprite.borderRadius = 3
    sprite.borderWidth = 0.5
    sprite.borderColor = color
    sprite.position.set(pos.x, pos.y + offset, pos.z)

    labelsGroupRef.current.add(sprite as unknown as THREE.Object3D)
    labelSpriteRef.current = sprite
  }, [])

  const clearHoverLabel = useCallback(() => {
    if (labelSpriteRef.current) {
      labelsGroupRef.current.remove(labelSpriteRef.current as unknown as THREE.Object3D)
      labelSpriteRef.current = null
    }
  }, [])

  // ── Attach event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('pointermove', handlePointerMove)
    container.addEventListener('click', handleClick)
    container.style.cursor = 'grab'

    return () => {
      container.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('click', handleClick)
    }
  }, [handlePointerMove, handleClick])

  // ── Cleanup labels on unmount ───────────────────────────────────────────
  useEffect(() => {
    return () => clearHoverLabel()
  }, [clearHoverLabel])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ background: '#0f172a' }}
    />
  )
}
