import { describe, expect, it } from 'vitest'
import { checkSdf, meshSdf } from './sdfScene'

/** A scene small enough to mesh in a test, with every leaf kind the mesher special-cases. */
const SCENE = {
  res: 40,
  root: {
    op: 'smooth_subtract',
    k: 0.03,
    color: 'skin_tan',
    of: [
      { op: 'smooth_union', k: 0.1, of: [
        { kind: 'sphere', r: 0.5, at: [0, 0, 1] },
        { kind: 'ellipsoid', radii: [0.4, 0.3, 0.35], at: [0, 0.1, 0.7] },
        { kind: 'capsule', a: [0, 0, 0.2], b: [0, 0, 0.9], r: 0.2 },
        { op: 'union', mirror: 'x', of: [{ kind: 'sphere', r: 0.12, at: [0.3, -0.4, 1.2], color: 'sclera' }] },
      ] },
      { kind: 'box', size: [0.3, 0.4, 0.2], at: [0, -0.5, 1], round: 0.04, color: 'mouth' },
    ],
  },
}

const checksum = (spec: ReturnType<typeof checkSdf> extends { ok: true; spec: infer S } ? S : never) => {
  const mesh = meshSdf(spec)
  let sum = 0
  let n = 0
  for (const f of mesh.faces) {
    for (const p of f.pts) {
      sum += (p[0] * 3 + p[1] * 5 + p[2] * 7) * ((n % 11) + 1)
      n++
    }
  }
  return { faces: mesh.faces.length, points: n, sum: Number(sum.toFixed(2)) }
}

describe('sculpt meshing — geometry is pinned', () => {
  it('meshes the reference scene to the same vertices', () => {
    const checked = checkSdf(SCENE)
    if (!checked.ok) throw new Error(checked.problems.join(' | '))
    // Pinned so an optimisation of the evaluator cannot move the surface unnoticed.
    expect(checksum(checked.spec)).toEqual({ faces: 7476, points: 22428, sum: 850752.99 })
  })
})
