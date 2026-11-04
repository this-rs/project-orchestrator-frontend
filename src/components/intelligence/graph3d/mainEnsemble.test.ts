import { describe, it, expect } from 'vitest'
import { mainEnsembleOf, type EnsembleView } from './mainEnsemble'

const view = (z: number): EnsembleView => ({ position: [0, 0, z], forward: [0, 0, -1], up: [0, 1, 0], fovDeg: 45, aspect: 16 / 9 })
/** `n` nodes of community `c` in a ball of radius `r` around (x, y, 0). */
const ball = (c: number, x: number, y: number, n: number, r = 20) =>
  Array.from({ length: n }, (_, i) => ({
    x: x + Math.cos(i * 1.7) * r * ((i % 7) / 7), y: y + Math.sin(i * 2.3) * r * ((i % 5) / 5), z: Math.cos(i) * r * 0.5, communityId: c,
  }))

describe('mainEnsembleOf — the ensemble in front of the camera', () => {
  it('a community at the centre of the screen is the main one, even beside bigger ones at the edge', () => {
    const nodes = [...ball(1, 0, 0, 60), ...ball(2, 140, 0, 120), ...ball(3, -140, 40, 120)]
    // zoomed onto it: the two bigger ones sit at the edge of the view
    expect(mainEnsembleOf(nodes, view(200))).toBe(1)
    // further back they share the screen with it: none dominates
    expect(mainEnsembleOf(nodes, view(300))).toBeNull()
  })

  it('an overview where communities share the screen has no main ensemble', () => {
    const nodes = [0, 1, 2, 3, 4, 5].flatMap((c) => ball(c, (c - 2.5) * 60, (c % 2) * 40 - 20, 50))
    expect(mainEnsembleOf(nodes, view(900))).toBeNull()
  })

  it('what is behind the camera or off screen does not count', () => {
    const nodes = [...ball(1, 0, 0, 20), ...ball(2, 0, 0, 500).map((n) => ({ ...n, z: n.z + 1000 })), ...ball(3, 5000, 0, 500)]
    expect(mainEnsembleOf(nodes, view(300))).toBe(1)
  })

  it('no forward or up: no answer rather than a guess', () => {
    expect(mainEnsembleOf(ball(1, 0, 0, 10), { position: [0, 0, 300], fovDeg: 45 })).toBeNull()
    expect(mainEnsembleOf([], view(300))).toBeNull()
  })
})
