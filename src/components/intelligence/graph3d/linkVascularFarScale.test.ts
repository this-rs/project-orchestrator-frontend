import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  CORE_FLOOR_MAX_SCALE, PRESENCE_MAX_GAIN, coreFloorScale, createVascularLinks, presenceGain, restingPresenceGain,
} from './linkVascularRenderer'
import { synthGraph } from './linkVascularFixture'

// Asked on 04/11/2026: « que les liens soient visibles même à une échelle
// éloignée afin de se rendre compte des plus grosses connexions, avec réaction
// en multi-échelle ». Far away every core sat on the same 0.6 px floor and the
// same style alpha: a trunk of five hundred relations read like one thread.
describe('links seen from afar: the big connections stand out', () => {
  it('the screen floor of a core grows like the radius law, ∛n, capped', () => {
    expect(coreFloorScale(1)).toBe(1)
    expect(coreFloorScale(0n)).toBe(1)
    expect(coreFloorScale(8n)).toBeCloseTo(2, 9)
    expect(coreFloorScale(64)).toBeCloseTo(4, 9)
    expect(coreFloorScale(1_000_000n)).toBe(CORE_FLOOR_MAX_SCALE)
    const xs = [1, 2, 10, 100, 1000].map(coreFloorScale)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1])
  })

  it('the presence of a conduit grows with its relations, 1 + log10(n) / 3, capped', () => {
    expect(presenceGain(1n)).toBe(1)
    expect(presenceGain(10)).toBeCloseTo(4 / 3, 9)
    expect(presenceGain(100n)).toBeCloseTo(5 / 3, 9)
    expect(presenceGain(1000n)).toBeCloseTo(PRESENCE_MAX_GAIN, 9)
    expect(presenceGain(1e9)).toBe(PRESENCE_MAX_GAIN)
    expect(presenceGain(Number.NaN)).toBe(1)
  })

  it('a heavier conduit gets a wider floor in the geometry it uploads', () => {
    const { nodes, links } = synthGraph(400, [0, 0, 0], 3)
    const r = createVascularLinks(nodes, links)!
    const mesh = (r.object as THREE.Group).children[0] as THREE.Mesh
    const floor = mesh.geometry.getAttribute('aFloor') as THREE.BufferAttribute
    expect(floor).toBeDefined()
    const values = Array.from(floor.array as Float32Array)
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1)
    // a 1 200-link graph across 6 communities has trunks well above one relation
    expect(Math.max(...values)).toBeGreaterThan(2)
    expect((mesh.material as THREE.ShaderMaterial).vertexShader).toMatch(/uPxFloor \* aFloor/)
    r.dispose?.()
  })
})

describe('restingPresenceGain — the gain never wakes a dimmed link', () => {
  it('none under a dimmed style, all of it at rest, monotone in between', () => {
    expect(restingPresenceGain(1000n, 0.02)).toBe(1)
    expect(restingPresenceGain(1000n, 0.12)).toBeCloseTo(PRESENCE_MAX_GAIN, 9)
    expect(restingPresenceGain(1n, 0.5)).toBe(1)
    let prev = 0
    for (let a = 0; a <= 1; a += 0.01) {
      const g = restingPresenceGain(500n, a)
      expect(g).toBeGreaterThanOrEqual(prev)
      prev = g
    }
  })
})
