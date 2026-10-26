import { describe, expect, it } from 'vitest'
import { checkSdf, maxResFor, SDF_BUDGET, SDF_LIMITS } from './sdfScene'

const globes = (n: number) => ({
  op: 'union',
  of: Array.from({ length: n }, (_, i) => ({ kind: 'sphere', r: 0.1, at: [0, 0.12 * i, 1] })),
})

describe('sculpt resolution — what the chat can afford', () => {
  it('caps res from the number of volumes, from the measured cost', () => {
    expect(maxResFor(26)).toBe(128)
    expect(maxResFor(96)).toBe(72)
    expect(maxResFor(10_000)).toBe(SDF_LIMITS.res[0])
    expect(SDF_BUDGET).toBe(500_000)
  })

  it('lets a light scene go to the new ceiling', () => {
    const r = checkSdf({ res: 128, root: { kind: 'sphere', r: 1, at: [0, 0, 0] } })
    expect(r.ok).toBe(true)
  })

  it('refuses a busy scene at high res and says which res fits', () => {
    const r = checkSdf({ res: 128, root: globes(32) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.join(' ')).toMatch(/too much for 32 volumes: the mesh budget allows 125/)
  })

  it('still refuses what is outside the absolute range', () => {
    expect(checkSdf({ res: 200, root: { kind: 'sphere', r: 1, at: [0, 0, 0] } }).ok).toBe(false)
    expect(checkSdf({ res: 8, root: { kind: 'sphere', r: 1, at: [0, 0, 0] } }).ok).toBe(false)
  })
})
