// ============================================================================
// 3D Node Objects — Emoji-centric design with colored ring + circular label
// ============================================================================
//
// Each entity is represented by its EMOJI as the primary visual element.
// No 3D mesh shapes — the emoji IS the node.
//
// Visual hierarchy:
//   1. Single billboard sprite combining: colored ring border + circular name
//      (+ optional subtitle on a second inner/top arc for chat_session nodes)
//   2. Emoji (center, billboard sprite) — scaled by energy
//   3. Subtle glow halo (high energy only)
//
// Everything is billboard sprites so all elements share the same orientation
// (always facing the camera). This fixes the axis alignment issue between
// the ring and the emoji/text.
//
// IMPORTANT: Canvas textures are cached by (entityType + label + subtitle + energyBucket)
// to avoid creating unique textures per node when possible.
// ============================================================================

import * as THREE from 'three'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { Graph3DNode } from './useGraph3DLayout'

// ── Sprite children cache (perf) ──────────────────────────────────────────────
// Per-effect code (heatmap, highlight, dimming, activation) used to call
// obj.traverse() per node per effect — O(nodes × sprites × effects) traversals.
// Instead, createNodeObject() records its mutable sprites in __spriteChildren
// and pre-clones their (cache-shared) materials ONCE at creation, so effects can
// iterate directly and mutate opacity/color without lazy material cloning.
//
// The invisible hitbox sprite is deliberately EXCLUDED: its texture alpha is
// ~0.01, so mutating its opacity has no visible effect — skipping it saves ~25%
// of sprite mutations per effect.

/** THREE.Group returned by createNodeObject, with cached mutable sprites */
export interface NodeGroup extends THREE.Group {
  __spriteChildren: THREE.Sprite[]
}

/**
 * Get the mutable sprites of a node object WITHOUT traversing the hierarchy.
 * Falls back to traverse-collection for objects not created by createNodeObject.
 */
export function getNodeSprites(obj: THREE.Object3D): THREE.Sprite[] {
  const cached = (obj as Partial<NodeGroup>).__spriteChildren
  if (cached) return cached
  const sprites: THREE.Sprite[] = []
  obj.traverse((child) => {
    if (child instanceof THREE.Sprite && child.material) sprites.push(child)
  })
  return sprites
}

/**
 * Give the sprite its own material clone (textures stay shared via `map`).
 * Marks `_ownsMaterial` so effect-level ensureOwnedMaterial() never re-clones.
 */
function ownMaterial(sprite: THREE.Sprite): void {
  sprite.material = (sprite.material as THREE.SpriteMaterial).clone()
  ;(sprite as unknown as { _ownsMaterial?: boolean })._ownsMaterial = true
}

// ── Dynamic LOD — quality scaling based on node count ────────────────────────
// Prevents GPU memory exhaustion on large graphs.
// Each 512px canvas = ~1MB VRAM. 1000 unique textures = ~1GB → WebGL context lost.
//
// Quality levels:
//   full    (<150 nodes): 512px canvas, subtitle, glow, progress arc
//   medium  (<400 nodes): 256px canvas, subtitle, no glow, progress arc
//   low     (<800 nodes): 256px canvas, no subtitle, no glow, no progress
//   minimal (≥800 nodes): 128px canvas, no subtitle, no glow, no progress, truncated labels

export type QualityLevel = 'full' | 'medium' | 'low' | 'minimal'

interface QualityConfig {
  canvasSize: number
  maxLabelLen: number
  showSubtitle: boolean
  showGlow: boolean
  showProgress: boolean
  showWorkingBadge: boolean
  emojiScale: number       // multiplier on emoji textHeight
  ringScale: number        // multiplier on ring sprite size
  fontSize: number         // arc text font size
  subFontSize: number      // subtitle arc font size
}

const QUALITY_CONFIGS: Record<QualityLevel, QualityConfig> = {
  full:    { canvasSize: 512, maxLabelLen: 32, showSubtitle: true,  showGlow: true,  showProgress: true,  showWorkingBadge: true,  emojiScale: 1.0,  ringScale: 1.0,  fontSize: 28, subFontSize: 22 },
  medium:  { canvasSize: 256, maxLabelLen: 24, showSubtitle: true,  showGlow: false, showProgress: true,  showWorkingBadge: true,  emojiScale: 0.9,  ringScale: 0.85, fontSize: 14, subFontSize: 11 },
  low:     { canvasSize: 256, maxLabelLen: 18, showSubtitle: false, showGlow: false, showProgress: false, showWorkingBadge: false, emojiScale: 0.8,  ringScale: 0.75, fontSize: 13, subFontSize: 10 },
  minimal: { canvasSize: 128, maxLabelLen: 12, showSubtitle: false, showGlow: false, showProgress: false, showWorkingBadge: false, emojiScale: 0.7,  ringScale: 0.65, fontSize: 9,  subFontSize: 8  },
}

let _currentQuality: QualityLevel = 'full'
let _currentConfig: QualityConfig = QUALITY_CONFIGS.full

// ── Deferred texture disposal ────────────────────────────────────────────────
// GOTCHA (fixed): disposing caches immediately on quality change destroyed
// textures still referenced by LIVE sprites — react-force-graph only creates
// objects for NEW nodes, so existing nodes kept sprites with dead textures
// (blank rings, missing emojis). Instead, caches are RETIRED (references moved
// aside, maps cleared) and disposed a few seconds later, after the consumer
// forced a full node-object recreation at the new quality.

let _retiredDisposables: { dispose(): void }[] = []
let _retireFlushTimer: ReturnType<typeof setTimeout> | null = null

function retireNodeCaches(): void {
  const retire = <T extends { dispose(): void }>(m: Map<string, T>) => {
    m.forEach((v) => _retiredDisposables.push(v))
    m.clear()
  }
  retire(ringLabelTextureCache)
  retire(ringLabelMaterialCache)
  retire(dotTextureCache)
  retire(dotMaterialCache)
  retire(emojiTextureCache)
  retire(emojiMaterialCache)
  retire(glowTextureCache)
  retire(glowMaterialCache)
  retire(progressTextureCache)

  if (_retireFlushTimer) clearTimeout(_retireFlushTimer)
  _retireFlushTimer = setTimeout(() => flushRetiredCaches(), 5000)
}

/** Dispose retired GPU resources (safe: replacement objects exist by now) */
export function flushRetiredCaches(): void {
  for (const d of _retiredDisposables) {
    try { d.dispose() } catch { /* already disposed */ }
  }
  _retiredDisposables = []
  if (_retireFlushTimer) { clearTimeout(_retireFlushTimer); _retireFlushTimer = null }
}

/** Call before rendering a batch of nodes to set quality based on count */
export function setNodeQuality(nodeCount: number): void {
  const prev = _currentQuality
  if (nodeCount < 100) _currentQuality = 'full'
  else if (nodeCount < 250) _currentQuality = 'medium'
  else if (nodeCount < 500) _currentQuality = 'low'
  else _currentQuality = 'minimal'
  _currentConfig = QUALITY_CONFIGS[_currentQuality]

  // Quality changed → retire caches (deferred dispose) so live sprites keep
  // valid textures until the consumer recreates every node object
  if (prev !== _currentQuality) {
    retireNodeCaches()
  }
}

/** Get current quality level (for debug/UI) */
export function getNodeQuality(): QualityLevel {
  return _currentQuality
}

// ── Entity emojis — status-aware ─────────────────────────────────────────────
// Entities with lifecycle statuses get different emojis per state.
// The default (no status or unknown status) falls back to the base emoji.

const ENTITY_EMOJIS: Record<string, string> = {
  // Code layer
  file: '📄',
  function: '⚡',
  struct: '🏗️',
  trait: '🧬',
  enum: '📋',
  // PM layer
  plan: '🎯',
  task: '📌',
  step: '👣',
  milestone: '🏁',
  release: '🚀',
  commit: '💾',
  // Knowledge layer
  note: '📝',
  decision: '⚖️',
  constraint: '🛡️',
  // Skills layer
  skill: '🧠',
  // Behavioral layer
  protocol: '🔄',
  protocol_state: '⭕',
  // Chat layer
  chat_session: '💬',
  // Feature graph
  feature_graph: '🔮',
}

/** Status-specific emoji overrides — (entityType, status) → emoji */
const STATUS_EMOJIS: Record<string, Record<string, string>> = {
  task: {
    pending:     '⏳',
    in_progress: '🔨',
    blocked:     '🚧',
    completed:   '✅',
    failed:      '❌',
  },
  step: {
    pending:     '⬜',
    in_progress: '▶️',
    completed:   '✅',
    skipped:     '⏭️',
  },
  plan: {
    draft:       '📝',
    approved:    '🎯',
    in_progress: '🔥',
    completed:   '🏆',
    cancelled:   '🚫',
  },
  milestone: {
    planned:     '📍',
    open:        '🏁',
    in_progress: '🏃',
    completed:   '🎉',
    closed:      '🔒',
  },
  release: {
    planned:     '📦',
    in_progress: '🔧',
    released:    '🚀',
    cancelled:   '🚫',
  },
  decision: {
    proposed:    '💭',
    accepted:    '⚖️',
    deprecated:  '📉',
    superseded:  '🔀',
  },
  note: {
    active:       '📝',
    needs_review: '🔍',
    stale:        '📜',
    obsolete:     '🗑️',
    archived:     '📦',
  },
}

/** Get the emoji for a node, considering its status */
function getStatusEmoji(entityType: string, status?: string): string {
  if (status) {
    const statusMap = STATUS_EMOJIS[entityType]
    if (statusMap?.[status]) return statusMap[status]
  }
  return ENTITY_EMOJIS[entityType] ?? '❓'
}

// ── Helper: draw text along a circular arc ──────────────────────────────────

function drawTextOnArc(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  fontSize: number,
  fillColor: string,
  alpha: number,
  /** Center angle of the arc (radians). PI/2 = bottom, -PI/2 = top */
  centerAngle: number,
  /** If true, characters are flipped so text reads correctly on the top arc */
  flipForTop: boolean,
) {
  ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
  ctx.fillStyle = fillColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const chars = [...text]
  const charWidths: number[] = []
  let totalWidth = 0
  for (const ch of chars) {
    const w = ctx.measureText(ch).width
    charWidths.push(w)
    totalWidth += w
  }

  const totalAngle = totalWidth / radius
  // For bottom arc: start left, go right (decreasing angle in canvas coords)
  // For top arc: start right, go left (increasing angle)
  let currentAngle: number
  if (flipForTop) {
    currentAngle = centerAngle - totalAngle / 2
  } else {
    currentAngle = centerAngle + totalAngle / 2
  }

  ctx.globalAlpha = alpha
  for (let i = 0; i < chars.length; i++) {
    const charAngle = charWidths[i] / radius

    if (flipForTop) {
      currentAngle += charAngle / 2
      ctx.save()
      ctx.translate(
        cx + radius * Math.cos(currentAngle),
        cy + radius * Math.sin(currentAngle),
      )
      ctx.rotate(currentAngle + Math.PI / 2)
      ctx.fillText(chars[i], 0, 0)
      ctx.restore()
      currentAngle += charAngle / 2
    } else {
      currentAngle -= charAngle / 2
      ctx.save()
      ctx.translate(
        cx + radius * Math.cos(currentAngle),
        cy + radius * Math.sin(currentAngle),
      )
      ctx.rotate(currentAngle - Math.PI / 2)
      ctx.fillText(chars[i], 0, 0)
      ctx.restore()
      currentAngle -= charAngle / 2
    }
  }
  ctx.globalAlpha = 1.0
}

// ── Minimal dot sprite (shared per color — O(~15) textures) ─────────────────
// For minimal quality: a simple colored circle, no label, no ring.
// Shared across all nodes of the same entity type (same color → same texture).

const dotTextureCache = new Map<string, THREE.CanvasTexture>()
const dotMaterialCache = new Map<string, THREE.SpriteMaterial>()

function createDotSprite(color: string, energy: number): THREE.Sprite {
  let texture = dotTextureCache.get(color)
  if (!texture) {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Filled circle with subtle border
    const cx = size / 2
    const cy = size / 2
    const r = size * 0.4

    // Filled dot
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.7
    ctx.fill()

    // Thin bright border
    ctx.globalAlpha = 0.9
    ctx.lineWidth = 2
    ctx.strokeStyle = color
    ctx.stroke()

    texture = new THREE.CanvasTexture(canvas)
    dotTextureCache.set(color, texture)
  }

  const opacityBucket = energy > 0.7 ? 'bright' : energy > 0.3 ? 'mid' : 'dim'
  const matKey = `dot:${color}:${opacityBucket}`
  let material = dotMaterialCache.get(matKey)
  if (!material) {
    const opacity = opacityBucket === 'bright' ? 0.9 : opacityBucket === 'mid' ? 0.65 : 0.4
    material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity,
      depthWrite: false,
    })
    dotMaterialCache.set(matKey, material)
  }

  const sprite = new THREE.Sprite(material)
  const spriteSize = (14 + energy * 4) * _currentConfig.ringScale
  sprite.scale.set(spriteSize, spriteSize, 1)
  return sprite
}

// ── Ring + circular label (single canvas billboard sprite) ────────────────────
// Combines the colored ring border AND the name in an arc into one texture.
// Supports an optional subtitle drawn on a second arc (top half).

const ringLabelTextureCache = new Map<string, THREE.CanvasTexture>()
const ringLabelMaterialCache = new Map<string, THREE.SpriteMaterial>()

/** Progress info for entities with steps/children */
interface NodeProgress {
  completed: number
  total: number
}

function createRingLabelSprite(
  text: string,
  color: string,
  energy: number,
  subtitle?: string,
  /** When true, the solid ring circle is NOT drawn \u2014 the progress overlay
   *  sprite renders the track + fill arc in its place (original behavior:
   *  progress nodes replace the ring with a track). */
  hasProgressOverlay = false,
): THREE.Sprite {
  const q = _currentConfig
  const maxLen = q.maxLabelLen
  const maxSubLen = Math.max(8, maxLen - 4)
  const displayText = text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text
  const displaySub = (q.showSubtitle && subtitle)
    ? (subtitle.length > maxSubLen ? subtitle.slice(0, maxSubLen - 1) + '\u2026' : subtitle)
    : undefined
  // Energy bucket (3 bounded variants) \u2014 kept in the key because it drives the
  // DRAWN ring width/alpha. Progress arc + working badge are NOT part of this
  // texture anymore (see createProgressOverlaySprite) \u2014 they used to fan the
  // cache by progressBucket(21) \u00d7 working(2) per label.
  const opacityBucket = energy > 0.7 ? 'bright' : energy > 0.3 ? 'mid' : 'dim'
  const cacheKey = `${_currentQuality}:${displayText}:${displaySub ?? ''}:${color}:${opacityBucket}:${hasProgressOverlay ? 'p' : ''}`

  let texture = ringLabelTextureCache.get(cacheKey)
  if (!texture) {
    const size = q.canvasSize
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    const cx = size / 2
    const cy = size / 2
    const scale = size / 512 // proportional scaling for different canvas sizes
    const ringRadius = size * 0.36
    const ringWidth = (opacityBucket === 'bright' ? 6 : opacityBucket === 'mid' ? 5 : 3) * scale
    const ringAlpha = opacityBucket === 'bright' ? 0.9 : opacityBucket === 'mid' ? 0.65 : 0.4

    // ── Draw ring border (skipped when the progress overlay replaces it) ──
    if (!hasProgressOverlay) {
      ctx.beginPath()
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.globalAlpha = ringAlpha
      ctx.lineWidth = ringWidth
      ctx.stroke()
      ctx.globalAlpha = 1.0
    }

    // ── Subtle filled disc behind the ring for depth ──
    ctx.beginPath()
    ctx.arc(cx, cy, ringRadius - ringWidth, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.06
    ctx.fill()
    ctx.globalAlpha = 1.0

    // ── Primary text: bottom arc (just outside the ring) ──
    const textRadius = ringRadius + 18 * scale
    drawTextOnArc(
      ctx, displayText, cx, cy, textRadius,
      q.fontSize, '#e2e8f0', 0.85,
      Math.PI / 2,  // bottom center
      false,         // normal orientation
    )

    // ── Subtitle: top arc (just outside the ring, reads left-to-right) ──
    if (displaySub) {
      const subRadius = ringRadius + 16 * scale
      drawTextOnArc(
        ctx, displaySub, cx, cy, subRadius,
        q.subFontSize, '#94a3b8', 0.6,
        -Math.PI / 2,  // top center
        true,           // flipped for top readability
      )
    }

    texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    ringLabelTextureCache.set(cacheKey, texture)
  }

  let material = ringLabelMaterialCache.get(cacheKey)
  if (!material) {
    material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    })
    ringLabelMaterialCache.set(cacheKey, material)
  }

  const sprite = new THREE.Sprite(material)
  // Scale proportional to ring — energy gives a subtle breathing effect
  const spriteSize = (22 + energy * 4) * _currentConfig.ringScale
  sprite.scale.set(spriteSize, spriteSize, 1)
  return sprite
}

// ── Progress overlay sprite (track + fill arc + working badge) ───────────────
// Extracted from the ring/label canvas so progress changes swap a SMALL shared
// texture instead of re-baking a full ring/label canvas per progressBucket.
// Cache bounded by (color × 21 progress buckets × working flag) — only entities
// with progress (task/plan/milestone) hit this, so ~126 small 256px textures max.

const progressTextureCache = new Map<string, THREE.CanvasTexture>()

function createProgressOverlaySprite(
  color: string,
  energy: number,
  progress: NodeProgress | undefined,
  isWorking: boolean,
): THREE.Sprite | null {
  const ratio = progress && progress.total > 0 ? progress.completed / progress.total : -1
  const bucket = ratio >= 0 ? Math.round(Math.min(1, ratio) * 20) / 20 : -1 // 5% steps
  if (bucket < 0 && !isWorking) return null

  const cacheKey = `${color}:${bucket}:${isWorking ? 'w' : ''}`
  let texture = progressTextureCache.get(cacheKey)
  if (!texture) {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    const cx = size / 2
    const cy = size / 2
    const scale = size / 512
    const ringRadius = size * 0.36
    const progressArcWidth = 10 * scale // ringWidth(6) + 4, full-quality proportions
    const startAngle = -Math.PI / 2 // 12 o'clock

    if (bucket >= 0) {
      // Background track — full circle, dim
      ctx.beginPath()
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.15
      ctx.lineWidth = progressArcWidth
      ctx.stroke()
      ctx.globalAlpha = 1.0

      // Progress fill — partial arc, bright
      if (bucket > 0) {
        const endAngle = startAngle + Math.PI * 2 * bucket
        const progressColor = bucket >= 1.0
          ? '#22c55e' // green-500 — fully complete
          : isWorking
            ? '#818cf8' // indigo-400 — in progress
            : color      // default entity color
        ctx.beginPath()
        ctx.arc(cx, cy, ringRadius, startAngle, endAngle)
        ctx.strokeStyle = progressColor
        ctx.globalAlpha = 0.9
        ctx.lineWidth = progressArcWidth
        ctx.lineCap = 'round'
        ctx.stroke()
        ctx.lineCap = 'butt'
        ctx.globalAlpha = 1.0
      }
    }

    // ── Working indicator badge (top-right of ring) ──
    if (isWorking) {
      const badgeAngle = -Math.PI / 4 // 1:30 position
      const bx = cx + ringRadius * Math.cos(badgeAngle)
      const by = cy + ringRadius * Math.sin(badgeAngle)
      const badgeR = 14 * scale

      // Pulsing dot background
      ctx.beginPath()
      ctx.arc(bx, by, badgeR + 4, 0, Math.PI * 2)
      ctx.fillStyle = '#818cf8'
      ctx.globalAlpha = 0.25
      ctx.fill()
      ctx.globalAlpha = 1.0

      // Solid dot
      ctx.beginPath()
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2)
      ctx.fillStyle = '#818cf8'
      ctx.globalAlpha = 0.9
      ctx.fill()
      ctx.globalAlpha = 1.0

      // Gear icon ⚙ inside the badge
      ctx.font = `${badgeR * 1.4}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.95
      ctx.fillText('⚙', bx, by + 1)
      ctx.globalAlpha = 1.0
    }

    texture = new THREE.CanvasTexture(canvas)
    progressTextureCache.set(cacheKey, texture)
  }

  // Fresh material per sprite (texture shared) — already owned, no clone needed
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  ;(sprite as unknown as { _ownsMaterial?: boolean })._ownsMaterial = true
  // Same world size as the ring sprite so radii align exactly
  const spriteSize = (22 + energy * 4) * _currentConfig.ringScale
  sprite.scale.set(spriteSize, spriteSize, 1)
  return sprite
}

// ── Glow halo (subtle, energy-based) ─────────────────────────────────────────

const glowTextureCache = new Map<string, THREE.CanvasTexture>()
const glowMaterialCache = new Map<string, THREE.SpriteMaterial>()

function createGlowSprite(color: string, energy: number): THREE.Sprite {
  let texture = glowTextureCache.get(color)
  if (!texture) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, `${color}55`)
    gradient.addColorStop(0.3, `${color}33`)
    gradient.addColorStop(0.7, `${color}11`)
    gradient.addColorStop(1, `${color}00`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)

    texture = new THREE.CanvasTexture(canvas)
    glowTextureCache.set(color, texture)
  }

  const opacityBucket = Math.round(Math.min(energy, 1.0) * 4) / 4
  const matKey = `${color}:${opacityBucket}`
  let material = glowMaterialCache.get(matKey)
  if (!material) {
    material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opacityBucket * 0.6,
      depthWrite: false,
    })
    glowMaterialCache.set(matKey, material)
  }

  const sprite = new THREE.Sprite(material)
  const size = 28 + energy * 14
  sprite.scale.set(size, size, 1)
  return sprite
}

// ── Central emoji sprite ─────────────────────────────────────────────────────
// In full/medium mode: use SpriteText (rich, per-node texture — acceptable at low counts)
// In low/minimal mode: use shared canvas texture per (emoji, energyBucket) combo
// This limits total emoji textures to ~40 max instead of N.

const emojiTextureCache = new Map<string, THREE.CanvasTexture>()
const emojiMaterialCache = new Map<string, THREE.SpriteMaterial>()

/**
 * Shared-canvas emoji sprite — the ONLY emoji rendering path for ALL quality
 * levels (previously full/medium used per-node SpriteText, which both fanned
 * textures O(N) and could intermittently fail to render the glyph).
 * Hi-res 128px canvas at full/medium, 64px at low/minimal. Textures shared
 * per (emoji, energyBucket, resolution) — O(~80) textures max.
 */
function createSharedEmojiSprite(entityType: string, energy: number, status?: string): THREE.Sprite {
  const emoji = getStatusEmoji(entityType, status)
  const energyBucket = energy > 0.7 ? 'hi' : energy > 0.3 ? 'mid' : 'lo'
  const hiRes = _currentQuality === 'full' || _currentQuality === 'medium'
  const size = hiRes ? 128 : 64
  const cacheKey = `${emoji}:${energyBucket}:${size}`

  let texture = emojiTextureCache.get(cacheKey)
  if (!texture) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    // Explicit emoji font stack — 'serif' alone can miss the color-emoji
    // fallback on some platforms, leaving the glyph blank
    ctx.font = `${size * 0.7}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, size / 2, size / 2)

    texture = new THREE.CanvasTexture(canvas)
    emojiTextureCache.set(cacheKey, texture)
  }

  let material = emojiMaterialCache.get(cacheKey)
  if (!material) {
    material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    })
    emojiMaterialCache.set(cacheKey, material)
  }

  const sprite = new THREE.Sprite(material)
  const spriteSize = (8 + energy * 4) * _currentConfig.emojiScale
  sprite.scale.set(spriteSize, spriteSize, 1)
  return sprite
}

function createEmojiSprite(entityType: string, energy: number, status?: string): THREE.Sprite {
  // Single rendering path for every quality level — emojis MUST always show
  return createSharedEmojiSprite(entityType, energy, status)
}

// ── Invisible hitbox sprite (enlarges clickable area) ─────────────────────────
// react-force-graph-3d raycasts against the node's Three.js objects.
// Sprites can be hard to click because their visual area is small.
// We add a larger invisible sprite to expand the hit target.

let hitboxTexture: THREE.CanvasTexture | null = null
let hitboxMaterial: THREE.SpriteMaterial | null = null

function createHitboxSprite(): THREE.Sprite {
  if (!hitboxTexture) {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 4
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(255, 255, 255, 0.01)' // nearly invisible but raycastable
    ctx.fillRect(0, 0, 4, 4)
    hitboxTexture = new THREE.CanvasTexture(canvas)
  }
  if (!hitboxMaterial) {
    hitboxMaterial = new THREE.SpriteMaterial({
      map: hitboxTexture,
      transparent: true,
      opacity: 0.01,
      depthWrite: false,
    })
  }
  const sprite = new THREE.Sprite(hitboxMaterial)
  sprite.scale.set(26, 26, 1) // larger than the visible ring (~22)
  return sprite
}

// ── Subtitle builders per entity type ────────────────────────────────────────

function getNodeSubtitle(node: Graph3DNode): string | undefined {
  const data = node.data
  const entityType = node.entityType

  // ── Milestone: show plan + task descendance ──
  if (entityType === 'milestone') {
    const parts: string[] = []
    const pc = data.plan_count as number | undefined
    const tc = data.task_count as number | undefined
    if (pc) parts.push(`${pc} plans`)
    if (tc) parts.push(`${tc} tasks`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Plan: show task descendance with completion ──
  if (entityType === 'plan') {
    const parts: string[] = []
    const tc = data.task_count as number | undefined
    const ctc = data.completed_task_count as number | undefined
    if (tc) parts.push(`${ctc ?? 0}/${tc} tasks`)
    const fc = data.file_count as number | undefined
    if (fc) parts.push(`${fc} files`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Task: show step progress + linked entities ──
  if (entityType === 'task') {
    const parts: string[] = []
    const sc = data.step_count as number | undefined
    const csc = data.completed_step_count as number | undefined
    if (sc) parts.push(`${csc ?? 0}/${sc} steps`)
    // Descendance counts — compact format
    const counts: string[] = []
    const nc = data.note_count as number | undefined
    const dc = data.decision_count as number | undefined
    const fc = data.affected_file_count as number | undefined
    const cc = data.commit_count as number | undefined
    if (fc) counts.push(`${fc}📄`)
    if (cc) counts.push(`${cc}💾`)
    if (nc) counts.push(`${nc}📝`)
    if (dc) counts.push(`${dc}⚖️`)
    if (counts.length > 0) parts.push(counts.join(' '))
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Step: show verification hint ──
  if (entityType === 'step') {
    const v = data.verification as string | undefined
    if (v) {
      const short = v.length > 30 ? v.slice(0, 29) + '…' : v
      return short
    }
    return undefined
  }

  // ── File: parent directory + symbol counts ──
  if (entityType === 'file') {
    const parts: string[] = []
    const path = data.path as string | undefined
    if (path) {
      const segs = path.split('/')
      if (segs.length > 2) {
        parts.push(segs.slice(-3, -1).join('/'))
      }
    }
    const fnc = data.function_count as number | undefined
    const sc = data.struct_count as number | undefined
    if (fnc) parts.push(`${fnc}⚡`)
    if (sc) parts.push(`${sc}🏗️`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Decision: chosen option as subtitle ──
  if (entityType === 'decision') {
    const co = data.chosen_option as string | undefined
    if (co) {
      const short = co.length > 28 ? co.slice(0, 27) + '…' : co
      return short
    }
    return undefined
  }

  // ── Note: importance + type ──
  if (entityType === 'note') {
    const parts: string[] = []
    const nt = data.note_type as string | undefined
    const imp = data.importance as string | undefined
    if (nt) parts.push(nt)
    if (imp) parts.push(imp)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Commit: short sha + file count ──
  if (entityType === 'commit') {
    const parts: string[] = []
    const sha = data.sha as string | undefined
    if (sha) parts.push(sha.slice(0, 7))
    const fc = data.file_count as number | undefined
    if (fc) parts.push(`${fc} files`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Chat session: model + msg count ──
  if (entityType === 'chat_session') {
    const parts: string[] = []
    if (data.model) parts.push(String(data.model))
    if (data.messageCount) parts.push(`${data.messageCount} msgs`)
    if (data.totalCostUsd && Number(data.totalCostUsd) > 0) {
      parts.push(`$${Number(data.totalCostUsd).toFixed(3)}`)
    }
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Feature graph: entity count ──
  if (entityType === 'feature_graph') {
    const count = data.entity_count
    if (count) return `${count} entities`
    return undefined
  }

  // ── Constraint: severity ──
  if (entityType === 'constraint') {
    const sev = data.severity as string | undefined
    return sev ?? undefined
  }

  // ── Skill: energy + cohesion ──
  if (entityType === 'skill') {
    const parts: string[] = []
    const e = data.energy as number | undefined
    const c = data.cohesion as number | undefined
    if (e !== undefined) parts.push(`⚡${(e * 100).toFixed(0)}%`)
    if (c !== undefined) parts.push(`🔗${(c * 100).toFixed(0)}%`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Protocol: state count ──
  if (entityType === 'protocol') {
    const sc = data.state_count as number | undefined
    if (sc) return `${sc} states`
    return undefined
  }

  return undefined
}

// ── Main factory ──────────────────────────────────────────────────────────────

/** Extract progress info from node data for entities with steps/children */
function getNodeProgress(node: Graph3DNode): NodeProgress | undefined {
  const data = node.data
  const entityType = node.entityType

  if (entityType === 'task') {
    const total = (data.step_count as number) ?? 0
    const completed = (data.completed_step_count as number) ?? 0
    if (total > 0) return { completed, total }
  }

  if (entityType === 'plan') {
    const total = (data.task_count as number) ?? 0
    const completed = (data.completed_task_count as number) ?? 0
    if (total > 0) return { completed, total }
  }

  if (entityType === 'milestone') {
    const total = (data.task_count as number) ?? 0
    const completed = (data.completed_task_count as number) ?? 0
    if (total > 0) return { completed, total }
  }

  return undefined
}

export function createNodeObject(node: Graph3DNode): THREE.Object3D {
  const group = new THREE.Group() as NodeGroup
  const spriteChildren: THREE.Sprite[] = []
  group.__spriteChildren = spriteChildren
  const q = _currentConfig

  const entityType = node.entityType
  const color = ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
  const energy = (node.data.energy as number) ?? 0
  const status = node.data.status as string | undefined

  // 0. Invisible hitbox — ensures the node is easy to click/hover.
  //    NOT added to __spriteChildren: mutating it is invisible (texture alpha ~0.01).
  const hitbox = createHitboxSprite()
  group.add(hitbox)

  // ── MINIMAL mode: dot + shared emoji only (~55 GPU textures max) ──
  if (_currentQuality === 'minimal') {
    const dot = createDotSprite(color, energy)
    ownMaterial(dot)
    group.add(dot)
    spriteChildren.push(dot)

    // Shared emoji sprite — O(~40) textures total, not O(N)
    const emojiSprite = createEmojiSprite(entityType, energy, status) as THREE.Sprite
    ownMaterial(emojiSprite)
    group.add(emojiSprite)
    spriteChildren.push(emojiSprite)

    return group
  }

  // ── LOW mode: ring + label + shared emoji (~55 GPU textures for emojis) ──
  // ── FULL/MEDIUM mode: ring + label + SpriteText emoji (N textures, OK at low counts) ──
  const subtitle = q.showSubtitle ? getNodeSubtitle(node) : undefined
  const progress = q.showProgress ? getNodeProgress(node) : undefined

  // 1. Glow halo (behind everything) — only for high quality + energy > 0.4
  if (q.showGlow && energy > 0.4) {
    const glow = createGlowSprite(color, energy)
    ownMaterial(glow)
    group.add(glow)
    spriteChildren.push(glow)
  }

  // 2. Ring + circular label (+ separate progress/working overlay sprite)
  const isWorking = q.showWorkingBadge && status === 'in_progress'
  const hasProgress = !!(progress && progress.total > 0)
  const ringLabel = createRingLabelSprite(node.label, color, energy, subtitle, hasProgress)
  ownMaterial(ringLabel)
  group.add(ringLabel)
  spriteChildren.push(ringLabel)

  // 2b. Progress arc / working badge overlay — small shared texture, swapped
  //     cheaply when progress changes (ring/label texture stays stable)
  const progressOverlay = createProgressOverlaySprite(color, energy, hasProgress ? progress : undefined, isWorking)
  if (progressOverlay) {
    group.add(progressOverlay)
    spriteChildren.push(progressOverlay)
  }

  // 3. Central emoji — THE primary visual element (on top), status-aware.
  //    Single shared-canvas path for all qualities (emoji must ALWAYS render).
  const emojiSprite = createEmojiSprite(entityType, energy, status)
  ownMaterial(emojiSprite)
  group.add(emojiSprite)
  spriteChildren.push(emojiSprite)

  return group
}

// ── Cleanup (call on unmount) ──────────────────────────────────────────────────

export function disposeNodeCaches(): void {
  ringLabelTextureCache.forEach((tex) => tex.dispose())
  ringLabelTextureCache.clear()
  ringLabelMaterialCache.forEach((mat) => mat.dispose())
  ringLabelMaterialCache.clear()
  dotTextureCache.forEach((tex) => tex.dispose())
  dotTextureCache.clear()
  dotMaterialCache.forEach((mat) => mat.dispose())
  dotMaterialCache.clear()
  emojiTextureCache.forEach((tex) => tex.dispose())
  emojiTextureCache.clear()
  emojiMaterialCache.forEach((mat) => mat.dispose())
  emojiMaterialCache.clear()
  glowTextureCache.forEach((tex) => tex.dispose())
  glowTextureCache.clear()
  glowMaterialCache.forEach((mat) => mat.dispose())
  glowMaterialCache.clear()
  progressTextureCache.forEach((tex) => tex.dispose())
  progressTextureCache.clear()
  if (hitboxTexture) { hitboxTexture.dispose(); hitboxTexture = null }
  if (hitboxMaterial) { hitboxMaterial.dispose(); hitboxMaterial = null }
  // Also flush any resources retired by a quality change
  flushRetiredCaches()
}
