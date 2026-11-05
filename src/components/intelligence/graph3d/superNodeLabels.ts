// ============================================================================
// superNodeLabels — aggregated super-node names drawn as billboard SpriteText
// ============================================================================
//
// At the aggregated tier the super-nodes are drawn as ONE THREE.Points (see
// nodePoints.ts), which cannot show a name — a point is a coloured shape, not a
// texture. This module adds the missing legibility: a billboard text sprite
// (three-spritetext's SpriteText, the same technique nodeObjects.ts uses) above
// each of the N largest super-nodes. The rest stay bare points and reveal their
// name on hover, so a 40-community graph does not become a wall of labels.
// ============================================================================

import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import type { Graph3DNode } from './useGraph3DLayout'
import { LABEL_RENDER_ORDER } from './nodePoints'
import { isGenericGroupName, membersLabel } from './labelText'

/** Maximum number of on-screen name labels at the aggregated tier. */
export const SUPER_NODE_LABEL_LIMIT = 40

/**
 * A label is read on the SCREEN, so its size is a screen size: about
 * LABEL_SCREEN_PX tall whatever the distance (sizeAttenuation off). Measured in
 * a real browser: at 5 world units the names were microscopic in a scene a few
 * thousand units wide.
 *
 * With sizeAttenuation off, three cancels the perspective divide, so a sprite of
 * height h covers h·P11·H/2 px (P11 = 1/tan(fov/2)); at the reference view
 * (fov 45°, H 900) that is h × 1 086 px.
 */
export const LABEL_SCREEN_PX = 12
const LABEL_TEXT_HEIGHT = LABEL_SCREEN_PX / (450 / Math.tan((22.5 * Math.PI) / 180))
/** Fixed vertical gap between the super-node disc and its label, world units. */
const LABEL_OFFSET_BASE = 5

// SpriteText extends Sprite extends Object3D — has .position (see nodeObjects.ts).
type SpriteTextInstance = SpriteText & THREE.Object3D

/**
 * The super-nodes whose name gets a label: the `limit` largest by `data.count`.
 * Deterministic and pure (unit-tested without instantiating SpriteText).
 */
export function selectLabeledNodes(
  nodes: Graph3DNode[],
  limit = SUPER_NODE_LABEL_LIMIT,
): Graph3DNode[] {
  return nodes
    .filter((n) => {
      const c = n.data.count as number | undefined
      return typeof c === 'number' && c > 1
    })
    .sort((a, b) => (b.data.count as number) - (a.data.count as number))
    .slice(0, Math.max(0, limit))
}

/** A label's rectangle on screen, CSS px (centre x/y, width, height). */
export interface ScreenRect { x: number; y: number; w: number; h: number }

/**
 * Which labels to show: greedy in PRIORITY order (the biggest groups first), a
 * label is kept only if its rectangle (plus `gapPx`) overlaps none already
 * kept. Seen in the browser: in a dense module the names piled up into an
 * unreadable block, on the desktop and worse on a 390 px phone. `null` = off
 * screen (behind the camera): never shown.
 */
export function declutterRects(rects: ReadonlyArray<ScreenRect | null>, gapPx = 4): boolean[] {
  const kept: ScreenRect[] = []
  return rects.map((r) => {
    if (!r) return false
    for (const k of kept) {
      if (Math.abs(r.x - k.x) * 2 < r.w + k.w + gapPx * 2 && Math.abs(r.y - k.y) * 2 < r.h + k.h + gapPx * 2) return false
    }
    kept.push(r)
    return true
  })
}

export interface SuperNodeLabels {
  /** The group holding every label sprite. Add to the scene once. */
  readonly group: THREE.Group
  /** Number of label sprites created. */
  readonly count: number
  /** Re-anchor each label above its (mutable) super-node position. */
  updatePositions: () => void
  /** Hide the labels that would overlap a bigger group's name on screen. */
  declutter: (camera: THREE.Camera, viewportWidthPx: number, viewportHeightPx: number) => void
  dispose: () => void
}

/** Build a billboard name label above each of the largest super-nodes. */
export function createSuperNodeLabels(nodes: Graph3DNode[], limit = SUPER_NODE_LABEL_LIMIT): SuperNodeLabels {
  const labeled = selectLabeledNodes(nodes, limit)
  const group = new THREE.Group()
  const sprites: SpriteTextInstance[] = []
  for (const node of labeled) {
    /* Un groupe sans nom propre ne s'appelle plus « Groupe » : on lit ce qu'il CONTIENT.
       Les captures du 05/11 montraient huit étiquettes « Groupe » identiques, qui ne disaient
       rien — un nom de repli doit être une description, pas un mot générique. */
    const raw = (node.data.name as string) || node.label || node.id
    const generic = !raw || isGenericGroupName(raw)
    const count = (node.data.count as number) ?? 1
    const name = generic ? membersLabel(count, node.entityType) : raw
    const sprite = new SpriteText(name) as SpriteTextInstance
    sprite.textHeight = LABEL_TEXT_HEIGHT
    sprite.color = 'rgba(248, 250, 252, 0.94)'
    sprite.backgroundColor = 'rgba(10, 12, 18, 0.66)'
    // padding and radius are in the same (screen) units as the text height
    sprite.padding = [LABEL_TEXT_HEIGHT * 0.5, LABEL_TEXT_HEIGHT * 0.25]
    sprite.borderRadius = LABEL_TEXT_HEIGHT * 0.3
    ;(sprite.material as THREE.SpriteMaterial).sizeAttenuation = false
    sprite.renderOrder = LABEL_RENDER_ORDER
    group.add(sprite)
    sprites.push(sprite)
  }

  const updatePositions = () => {
    for (let i = 0; i < labeled.length; i++) {
      const node = labeled[i]
      const count = (node.data.count as number) ?? 1
      // Above the disc: a group of the dynamic scale is drawn at its territory
      // (its cluster radius), an older super-node by its mass (3 + 2.6·√count).
      const r = node.data.clusterRadius as number | undefined
      const offset = LABEL_OFFSET_BASE + (typeof r === 'number' && r > 0 ? r * 0.5 : (3 + 2.6 * Math.sqrt(count)) * 0.5)
      sprites[i].position.set(node.x ?? 0, (node.y ?? 0) + offset, node.z ?? 0)
    }
  }
  updatePositions()

  const dispose = () => {
    for (const sprite of sprites) {
      const mat = sprite.material as THREE.SpriteMaterial | undefined
      mat?.map?.dispose()
      mat?.dispose()
    }
  }

  const v = new THREE.Vector3()
  const declutter = (camera: THREE.Camera, width: number, height: number) => {
    if (width <= 0 || height <= 0) return
    // With sizeAttenuation off a sprite of height h covers h·P11·H/2 px.
    const p11 = (camera as THREE.PerspectiveCamera).projectionMatrix?.elements?.[5] ?? 2.414
    // Re-calibrate to the REAL camera and viewport: LABEL_TEXT_HEIGHT assumes
    // fov 45° and H 900, the library camera is 50° and phones are shorter —
    // measured 7.7 px in portrait, 4.6 px in landscape instead of 12.
    const k = (p11 * height) / 2
    const factor = LABEL_SCREEN_PX / (LABEL_TEXT_HEIGHT * k)
    for (const sp of sprites) {
      const base = (sp.userData.baseScale as THREE.Vector3 | undefined) ?? (sp.userData.baseScale = sp.scale.clone())
      sp.scale.set(base.x * factor, base.y * factor, 1)
    }
    const rects = sprites.map((sp) => {
      v.copy(sp.position).project(camera)
      if (v.z > 1 || v.z < -1) return null
      const r = { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height, w: sp.scale.x * k, h: sp.scale.y * k }
      // A name cut by the edge of the screen (« ents/chat » on a 390 px phone)
      // says nothing: it is hidden until its whole rectangle is on screen.
      if (r.x - r.w / 2 < 0 || r.x + r.w / 2 > width || r.y - r.h / 2 < 0 || r.y + r.h / 2 > height) return null
      return r
    })
    const show = declutterRects(rects)
    for (let i = 0; i < sprites.length; i++) sprites[i].visible = show[i]
  }

  return { group, count: sprites.length, updatePositions, declutter, dispose }
}
