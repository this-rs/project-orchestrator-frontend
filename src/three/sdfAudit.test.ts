import { describe, expect, it } from 'vitest'
import { auditAxes, landmarks, LANDMARKS, nodeAxes, relief, visibility } from './sdfAudit'

/** A carved bust: the fixture the audit was written against (small res, fast to mesh). */
const HEAD = {
  res: 44,
  root: {
    op: 'union',
    of: [
      { op: 'smooth_subtract', k: 0.012, color: 'mouth', name: 'bouche creusee', of: [
        { op: 'smooth_union', k: 0.03, color: 'skin_tan', name: 'peau', of: [
          { op: 'smooth_subtract', k: 0.02, color: 'skin_tan', name: 'orbites', of: [
            { op: 'smooth_union', k: 0.1, of: [
              { kind: 'ellipsoid', radii: [0.58, 0.62, 0.62], at: [0, 0.195, 1.719], name: 'crane', rot: [-20, 0, 0] },
              { kind: 'ellipsoid', radii: [0.48, 0.34, 0.34], at: [0, -0.034, 1.908], name: 'front', rot: [-20, 0, 0] },
              { kind: 'ellipsoid', radii: [0.52, 0.42, 0.44], at: [0, -0.06, 1.428], name: 'face', rot: [-20, 0, 0] },
              { kind: 'ellipsoid', radii: [0.4, 0.36, 0.3], at: [0, -0.19, 1.071], name: 'machoire', rot: [-20, 0, 0] },
              { kind: 'sphere', r: 0.16, at: [0, -0.472, 0.94], name: 'menton', rot: [-20, 0, 0] },
              { kind: 'capsule', a: [0, -0.334, 0.091], b: [0, -0.089, 0.822], r: 0.22, name: 'cou', rot: [-20, 0, 0] },
              { op: 'union', mirror: 'x', of: [
                { kind: 'ellipsoid', radii: [0.18, 0.16, 0.11], at: [0.385, -0.319, 1.416], name: 'pommette', rot: [-20, 0, 0] },
              ] },
            ] },
          ] },
          { kind: 'capsule', a: [0, -0.366, 1.816], b: [0, -0.589, 1.493], r: 0.07, name: 'arete nez', rot: [-20, 0, 0] },
          { kind: 'sphere', r: 0.1, at: [0, -0.701, 1.48], name: 'bout nez', rot: [-20, 0, 0] },
          { op: 'union', mirror: 'x', of: [
            { kind: 'sphere', r: 0.075, at: [0.07, -0.639, 1.416], name: 'aile', rot: [-20, 0, 0] },
          ] },
          { op: 'union', mirror: 'x', of: [
            { kind: 'ellipsoid', radii: [0.225, 0.078, 0.05], at: [0, -0.562, 1.352], color: 'lip', name: 'levre sup', rot: [-20, 0, 0] },
            { kind: 'ellipsoid', radii: [0.205, 0.088, 0.066], at: [0, -0.572, 1.276], color: 'lip', name: 'levre inf', rot: [-20, 0, 0] },
          ] },
        ] },
        { kind: 'box', size: [0.42, 0.15, 0.056], at: [0, -0.636, 1.32], round: 0.02, color: 'mouth', name: 'fente bouche', rot: [-20, 0, 0] },
      ] },
      { op: 'union', mirror: 'x', of: [
        { kind: 'sphere', r: 0.145, at: [0.265, -0.348, 1.661], color: 'sclera', name: 'globe', rot: [-20, 0, 0] },
        { kind: 'sphere', r: 0.1, at: [0.265, -0.437, 1.693], color: 'iris_brown', name: 'iris', rot: [-20, 0, 0] },
        { kind: 'sphere', r: 0.05, at: [0.265, -0.512, 1.721], color: 'pupil', name: 'pupille', rot: [-20, 0, 0] },
      ] },
      { op: 'union', k: 0.05, color: 'hair_brown', name: 'cheveux', of: [
        { kind: 'ellipsoid', radii: [0.7, 0.72, 0.7], at: [0, 0.27, 1.8], name: 'calotte', rot: [-20, 0, 0] },
      ] },
    ],
  },
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const axisNamed = (a: ReturnType<typeof auditAxes>, name: string) => a.axes.find((x) => x.name === name)

describe('sdf sculpt audit — landmarks', () => {
  it('reads the names a scene declares', () => {
    const lm = landmarks(HEAD)
    for (const name of Object.values(LANDMARKS)) expect(lm.has(name)).toBe(true)
    expect(lm.get('globe')!.at[0]).toBeCloseTo(0.265, 3)
  })

  it('reports what it cannot measure instead of guessing', () => {
    const r = auditAxes({ root: { kind: 'sphere', r: 1 } })
    expect(r.problems.join(' ')).toMatch(/missing landmarks/)
    expect(r.total).toBe(0)
  })
})

describe('sdf sculpt audit — proportions', () => {
  it('measures ten axes on a carved bust', () => {
    const r = auditAxes(HEAD)
    expect(r.problems).toEqual([])
    expect(r.total).toBe(10)
    expect(axisNamed(r, 'symmetry |x| of the nose')!.ok).toBe(true)
    expect(axisNamed(r, 'incoherent normals')!.ok).toBe(true)
    expect(axisNamed(r, 'eye line / head height')!.ok).toBe(true)
  })

  it('flags a mouth too narrow for the nose', () => {
    const narrow = clone(HEAD)
    const up = (narrow.root.of[0] as { of: { of: { of: unknown[] }[] }[] }).of[0]!
    void up
    const lips = JSON.stringify(narrow).replace('"radii":[0.225,0.078,0.05]', '"radii":[0.12,0.078,0.05]')
    const r = auditAxes(JSON.parse(lips))
    expect(axisNamed(r, 'mouth width / nose width')!.ok).toBe(false)
  })
})

describe('sdf sculpt audit — per-node', () => {
  it('catches an iris that drifted off its globe', () => {
    const drifted = clone(HEAD)
    const json = JSON.stringify(drifted).replace('"at":[0.265,-0.437,1.693]', '"at":[0.34,-0.437,1.693]')
    const r = nodeAxes(JSON.parse(json))
    const drift = r.axes.find((x) => x.name.startsWith('iris centred'))!
    expect(drift.ok).toBe(false)
    expect(drift.value).toBeGreaterThan(0.05)
  })

  it('passes a symmetric bust', () => {
    const r = nodeAxes(HEAD)
    expect(r.problems).toEqual([])
    expect(r.axes.find((x) => x.name.startsWith('lips on the midline'))!.ok).toBe(true)
  })
})

describe('sdf sculpt audit — relief and visibility', () => {
  it('writes the relief as text and puts the nose forward of the forehead', () => {
    const r = relief(HEAD, { size: 32, heights: 12 })
    if ('problems' in r) throw new Error(r.problems.join(' | '))
    expect(r.depth.split('\n').length).toBeGreaterThan(8)
    expect(r.profile).toHaveLength(13)
    const valid = r.profile.filter((p) => Number.isFinite(p.y))
    expect(valid.length).toBeGreaterThan(6)
  })

  it('counts from how many angles each feature is visible', () => {
    const v = visibility(HEAD, { minPixels: 8 })
    if ('problems' in v) throw new Error(v.problems.join(' | '))
    expect(v.total).toBe(12)
    expect(v.eye).toBeGreaterThanOrEqual(6)
    expect(v.hair).toBeGreaterThanOrEqual(8)
  })
})
