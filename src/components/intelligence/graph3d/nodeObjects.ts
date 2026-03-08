// ============================================================================
// 3D Node Objects — Custom Three.js shapes per entity type
// ============================================================================
//
// Each entity type gets a distinctive 3D shape + billboard label.
// High-energy nodes (notes, skills) get a glow halo.
//
// IMPORTANT: Geometries and materials are cached/shared to avoid creating
// hundreds of unique WebGL shader programs which exhausts the GL context
// and causes VALIDATE_STATUS false errors + render loops.
// ============================================================================

import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { Graph3DNode } from './useGraph3DLayout'

// SpriteText extends Sprite extends Object3D — has .position
type SpriteTextInstance = SpriteText & THREE.Object3D

// ── Cached geometries (one per entity type) ────────────────────────────────────

const geometryCache = new Map<string, THREE.BufferGeometry>()

const SHAPE_FACTORIES: Record<string, () => THREE.BufferGeometry> = {
  // Code layer
  file: () => new THREE.SphereGeometry(5, 16, 12),
  function: () => new THREE.IcosahedronGeometry(3.5, 0),
  struct: () => new THREE.BoxGeometry(7, 7, 7),
  trait: () => new THREE.OctahedronGeometry(4, 0),
  enum: () => new THREE.ConeGeometry(3, 6, 6),
  // PM layer
  plan: () => new THREE.CylinderGeometry(5, 5, 3, 8),
  task: () => new THREE.BoxGeometry(6, 6, 6),
  step: () => new THREE.SphereGeometry(2, 8, 6),
  milestone: () => new THREE.DodecahedronGeometry(4, 0),
  release: () => new THREE.TorusGeometry(3.5, 1, 8, 12),
  commit: () => new THREE.SphereGeometry(2.5, 8, 6),
  // Knowledge layer
  note: () => new THREE.OctahedronGeometry(4.5, 0),
  decision: () => new THREE.TetrahedronGeometry(5, 0),
  constraint: () => new THREE.CylinderGeometry(2, 4, 6, 6),
  // Skills layer
  skill: () => new THREE.TorusGeometry(5, 2, 12, 16),
  // Behavioral layer
  protocol: () => new THREE.CylinderGeometry(4, 4, 8, 6),        // hexagonal prism — FSM
  protocol_state: () => new THREE.SphereGeometry(3.5, 12, 8),     // smooth sphere — state
  // Chat layer
  chat_session: () => new THREE.CapsuleGeometry(3, 4, 8, 12),     // capsule — chat bubble
  // Feature graph (code overlay)
  feature_graph: () => new THREE.DodecahedronGeometry(5, 0),      // dodecahedron — cluster
}

function getGeometry(entityType: string): THREE.BufferGeometry {
  let geo = geometryCache.get(entityType)
  if (!geo) {
    const factory = SHAPE_FACTORIES[entityType] ?? SHAPE_FACTORIES.file
    geo = factory()
    geometryCache.set(entityType, geo)
  }
  return geo
}

// ── Cached materials (one per entity type) ──────────────────────────────────────
// Using MeshLambertMaterial instead of MeshPhongMaterial — it's lighter on
// shader programs and doesn't require specular/shininess uniforms that can
// cause VALIDATE_STATUS errors on some GPU drivers.

const materialCache = new Map<string, THREE.MeshLambertMaterial>()

function getMaterial(entityType: string, color: string, energy: number): THREE.MeshLambertMaterial {
  // Cache key includes entity type only — energy variation handled via emissiveIntensity clone
  // For perf, we bucket energy into 3 levels to limit material variants
  const energyBucket = energy > 0.7 ? 'high' : energy > 0.3 ? 'mid' : 'low'
  const cacheKey = `${entityType}:${energyBucket}`

  let mat = materialCache.get(cacheKey)
  if (!mat) {
    const emissiveIntensity = energyBucket === 'high' ? 0.36 : energyBucket === 'mid' ? 0.24 : 0.15
    mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity,
      transparent: true,
      opacity: 0.9,
    })
    materialCache.set(cacheKey, mat)
  }
  return mat
}

// ── Glow halo for high-energy nodes ───────────────────────────────────────────
// Cached glow textures per color to avoid creating canvas+texture per node

const glowTextureCache = new Map<string, THREE.CanvasTexture>()
const glowMaterialCache = new Map<string, THREE.SpriteMaterial>()

function createGlowSprite(color: string, energy: number): THREE.Sprite {
  // Cache texture by color
  let texture = glowTextureCache.get(color)
  if (!texture) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, `${color}88`)
    gradient.addColorStop(0.4, `${color}44`)
    gradient.addColorStop(1, `${color}00`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)

    texture = new THREE.CanvasTexture(canvas)
    glowTextureCache.set(color, texture)
  }

  // Cache material by color (opacity varies but we bucket it)
  const opacityBucket = Math.round(Math.min(energy, 1.0) * 4) / 4 // 0, 0.25, 0.5, 0.75, 1.0
  const matKey = `${color}:${opacityBucket}`
  let material = glowMaterialCache.get(matKey)
  if (!material) {
    material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opacityBucket,
      depthWrite: false,
    })
    glowMaterialCache.set(matKey, material)
  }

  const sprite = new THREE.Sprite(material)
  const size = 20 + energy * 15
  sprite.scale.set(size, size, 1)
  return sprite
}

// ── Billboard label ───────────────────────────────────────────────────────────
// Labels are unique per node so they can't be cached, but SpriteText is lightweight

function createLabel(text: string, color: string): SpriteText {
  const maxLen = 24
  const displayText = text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text

  const sprite = new SpriteText(displayText) as SpriteTextInstance
  sprite.color = '#e2e8f0'
  sprite.textHeight = 3
  sprite.backgroundColor = 'rgba(15, 23, 42, 0.75)'
  sprite.padding = [1.5, 1]
  sprite.borderRadius = 2
  sprite.borderWidth = 0.3
  sprite.borderColor = color
  sprite.position.y = -10 // below the shape

  return sprite
}

// ── Main factory ──────────────────────────────────────────────────────────────

export function createNodeObject(node: Graph3DNode): THREE.Object3D {
  const group = new THREE.Group()

  const entityType = node.entityType
  const color = ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
  const energy = (node.data.energy as number) ?? 0

  // 1. Main shape (shared geometry + shared material)
  const geometry = getGeometry(entityType)
  const material = getMaterial(entityType, color, energy)
  const mesh = new THREE.Mesh(geometry, material)
  group.add(mesh)

  // 2. Glow halo for high-energy nodes (energy > 0.5)
  if (energy > 0.5) {
    const glow = createGlowSprite(color, energy)
    group.add(glow)
  }

  // 3. Billboard label
  const label = createLabel(node.label, color)
  group.add(label)

  return group
}

// ── Cleanup (call on unmount) ──────────────────────────────────────────────────

export function disposeNodeCaches(): void {
  geometryCache.forEach((geo) => geo.dispose())
  geometryCache.clear()
  materialCache.forEach((mat) => mat.dispose())
  materialCache.clear()
  glowTextureCache.forEach((tex) => tex.dispose())
  glowTextureCache.clear()
  glowMaterialCache.forEach((mat) => mat.dispose())
  glowMaterialCache.clear()
}
