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

/** Maximum number of on-screen name labels at the aggregated tier. */
export const SUPER_NODE_LABEL_LIMIT = 40

/** Text height of a super-node name label, world units. */
const LABEL_TEXT_HEIGHT = 5
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

export interface SuperNodeLabels {
  /** The group holding every label sprite. Add to the scene once. */
  readonly group: THREE.Group
  /** Number of label sprites created. */
  readonly count: number
  /** Re-anchor each label above its (mutable) super-node position. */
  updatePositions: () => void
  dispose: () => void
}

/** Build a billboard name label above each of the largest super-nodes. */
export function createSuperNodeLabels(nodes: Graph3DNode[], limit = SUPER_NODE_LABEL_LIMIT): SuperNodeLabels {
  const labeled = selectLabeledNodes(nodes, limit)
  const group = new THREE.Group()
  const sprites: SpriteTextInstance[] = []
  for (const node of labeled) {
    const name = (node.data.name as string) || node.label || node.id
    const sprite = new SpriteText(name) as SpriteTextInstance
    sprite.textHeight = LABEL_TEXT_HEIGHT
    sprite.color = 'rgba(248, 250, 252, 0.94)'
    sprite.backgroundColor = 'rgba(10, 12, 18, 0.66)'
    sprite.padding = [8, 4]
    sprite.borderRadius = 5
    group.add(sprite)
    sprites.push(sprite)
  }

  const updatePositions = () => {
    for (let i = 0; i < labeled.length; i++) {
      const node = labeled[i]
      const count = (node.data.count as number) ?? 1
      // Same mass formula as baseNodeSize (3 + 2.6·√count): the label clears the disc.
      const offset = LABEL_OFFSET_BASE + (3 + 2.6 * Math.sqrt(count)) * 0.5
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

  return { group, count: sprites.length, updatePositions, dispose }
}
