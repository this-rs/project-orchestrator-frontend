import { describe, expect, it } from 'vitest'
import { checkSdf, maxResFor, meshSdf, meshSdfWithinBudget, SDF_BUDGET, SDF_LIMITS } from './sdfScene'

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

describe('sculpt resolution — a time budget buys the finest mesh', () => {
  const scene = {
    res: 64,
    root: { op: 'smooth_union', k: 0.1, color: 'skin_tan', of: [
      { kind: 'sphere', r: 0.5, at: [0, 0, 1] },
      { kind: 'ellipsoid', radii: [0.4, 0.3, 0.35], at: [0, 0.1, 0.7] },
      { kind: 'capsule', a: [0, 0, 0.2], b: [0, 0, 0.9], r: 0.2 },
    ] },
  }

  it('never buys more detail than the scene asked for, even with a huge budget', () => {
    const checked = checkSdf(scene)
    if (!checked.ok) throw new Error(checked.problems.join(' | '))
    const built = meshSdfWithinBudget(checked.spec, 60_000)
    expect(built.res).toBe(scene.res)
    expect(built.faces.length).toBe(meshSdf(checked.spec, scene.res).faces.length)
  })

  it('degrades to a coarser mesh when the budget is small, and stays inside it', () => {
    const checked = checkSdf(scene)
    if (!checked.ok) throw new Error(checked.problems.join(' | '))
    const tiny = meshSdfWithinBudget(checked.spec, 1)
    expect(tiny.res).toBeLessThanOrEqual(scene.res)
    expect(tiny.res).toBeGreaterThanOrEqual(16)
    expect(tiny.faces.length).toBe(meshSdf(checked.spec, tiny.res).faces.length)
  })

  it('grows with the budget', () => {
    const checked = checkSdf(scene)
    if (!checked.ok) throw new Error(checked.problems.join(' | '))
    const small = meshSdfWithinBudget(checked.spec, 30)
    const large = meshSdfWithinBudget(checked.spec, 400)
    expect(large.res).toBeGreaterThanOrEqual(small.res)
    expect(large.faces.length).toBeGreaterThanOrEqual(small.faces.length)
  })
})
