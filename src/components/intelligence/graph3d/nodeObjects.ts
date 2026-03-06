// ============================================================================
// 3D Node Objects — Custom Three.js shapes per entity type
// ============================================================================
//
// Each entity type gets a distinctive 3D shape + billboard label.
// High-energy nodes (notes, skills) get a glow halo.
// ============================================================================

import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { Graph3DNode } from './useGraph3DLayout'

// SpriteText extends Sprite extends Object3D — has .position
type SpriteTextInstance = SpriteText & THREE.Object3D

// ── Shape factories ───────────────────────────────────────────────────────────

const SHAPE_GEOMETRIES: Record<string, () => THREE.BufferGeometry> = {
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
}

// ── Glow halo for high-energy nodes ───────────────────────────────────────────

function createGlowSprite(color: string, energy: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!

  // Radial gradient glow
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, `${color}88`)
  gradient.addColorStop(0.4, `${color}44`)
  gradient.addColorStop(1, `${color}00`)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)

  const texture = new THREE.CanvasTexture(canvas)
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: Math.min(energy, 1.0),
    depthWrite: false,
  })

  const sprite = new THREE.Sprite(material)
  // Scale based on energy
  const size = 20 + energy * 15
  sprite.scale.set(size, size, 1)
  return sprite
}

// ── Billboard label ───────────────────────────────────────────────────────────

function createLabel(text: string, color: string): SpriteText {
  // Truncate long labels
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

  // 1. Main shape
  const geometryFactory = SHAPE_GEOMETRIES[entityType] ?? SHAPE_GEOMETRIES.file
  const geometry = geometryFactory()
  const material = new THREE.MeshPhongMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.15 + energy * 0.3, // brighter with energy
    shininess: 60,
    transparent: true,
    opacity: 0.9,
  })
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
