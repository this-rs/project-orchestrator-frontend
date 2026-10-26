import { describe, expect, it } from 'vitest'
import { compileIsoScene } from '@/components/chat/viz/iso/compile'
import { checkSdf, meshSdf, ORGANIC } from './sdfScene'

const sphere = (extra: Record<string, unknown> = {}) => ({ root: { kind: 'sphere', r: 0.5, at: [0, 0, 1], ...extra }, res: 24 })

describe('sculpted scenes (sdf) — check', () => {
  it('accepts a tree of volumes and combinations', () => {
    const r = checkSdf({
      res: 24,
      root: { op: 'smooth_union', k: 0.1, color: 'skin', of: [{ kind: 'ellipsoid', radii: [0.5, 0.6, 0.7], at: [0, 0, 1] }, { op: 'union', mirror: 'x', of: [{ kind: 'sphere', r: 0.1, at: [0.3, -0.5, 1.2], color: 'sclera' }] }] },
    })
    expect(r.ok).toBe(true)
  })

  it('refuses what it does not know, and says what to use instead', () => {
    const r = checkSdf({ root: { kind: 'blob', r: 1 } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.problems.join('\n')).toMatch(/kind « blob » unknown \(sphere, ellipsoid/)
    const op = checkSdf({ root: { op: 'blend', of: [{ kind: 'sphere', r: 1 }] } })
    expect(!op.ok && op.problems.join('\n')).toMatch(/op « blend » unknown/)
  })

  it('colours are names from a closed palette, never a free hex', () => {
    const named = checkSdf(sphere({ color: 'iris_green' }))
    expect(named.ok).toBe(true)
    const hex = checkSdf(sphere({ color: '#ff00ff' }))
    expect(hex.ok).toBe(false)
    if (!hex.ok) expect(hex.problems[0]).toMatch(/not in the palette/)
  })

  it('bounds the work: resolution, volumes and sizes', () => {
    expect(checkSdf({ ...sphere(), res: 200 }).ok).toBe(false)
    expect(checkSdf({ root: { kind: 'sphere', r: 40 } }).ok).toBe(false)
    const many = { root: { op: 'union', of: Array.from({ length: 32 }, () => ({ op: 'union', of: [{ kind: 'sphere', r: 0.1 }, { kind: 'sphere', r: 0.1 }, { kind: 'sphere', r: 0.1 }, { kind: 'sphere', r: 0.1 }] })) } }
    const r = checkSdf(many)
    expect(!r.ok && r.problems.join('\n')).toMatch(/128 volumes \(at most 96\)/)
  })
})

describe('sculpted scenes (sdf) — mesh', () => {
  it('a sphere becomes a closed mesh whose triangles face outward, set on the ground', () => {
    const r = checkSdf(sphere())
    if (!r.ok) throw new Error(r.problems.join('\n'))
    const { faces } = meshSdf(r.spec)
    expect(faces.length).toBeGreaterThan(200)
    let zMin = Infinity
    let outward = 0
    for (const f of faces) {
      const [a, b, c] = f.pts as [number[], number[], number[]]
      const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
      const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
      const g = [(a[0]! + b[0]! + c[0]!) / 3, (a[1]! + b[1]! + c[1]!) / 3, (a[2]! + b[2]! + c[2]!) / 3 - 0.5]
      if (n[0]! * g[0]! + n[1]! * g[1]! + n[2]! * g[2]! > 0) outward++
      zMin = Math.min(zMin, a[2]!, b[2]!, c[2]!)
      expect(f.soft).toBe(0b111)
      expect(f.nrm).toHaveLength(3)
    }
    expect(outward).toBe(faces.length)
    expect(zMin).toBeCloseTo(0, 1)
    // Sorted back to front for the SVG painter.
    for (let i = 1; i < faces.length; i++) expect(faces[i]!.key).toBeGreaterThanOrEqual(faces[i - 1]!.key)
  })

  it('mirror "x" doubles a volume across x = 0; a carved volume lends its colour to the cut', () => {
    const r = checkSdf({
      res: 32,
      yaw: 0,
      root: { op: 'subtract', color: 'skin', of: [{ kind: 'box', size: [1.6, 0.8, 0.8], at: [0, 0, 0.4] }, { op: 'union', mirror: 'x', of: [{ kind: 'sphere', r: 0.2, at: [0.5, -0.4, 0.4], color: 'mouth' }] }] },
    })
    if (!r.ok) throw new Error(r.problems.join('\n'))
    const { faces } = meshSdf(r.spec)
    const carved = faces.filter((f) => f.col === ORGANIC.mouth)
    expect(carved.length).toBeGreaterThan(0)
    const xs = carved.map((f) => f.pts[0]![0])
    expect(Math.min(...xs)).toBeLessThan(-0.2)
    expect(Math.max(...xs)).toBeGreaterThan(0.2)
  })
})

describe('sculpted scenes in the chat (iso-scene with « sdf »)', () => {
  it('compiles to a machine the renderer can draw, fine for WebGL and coarse for the SVG', () => {
    const r = compileIsoScene({ title: 'Ball', sdf: sphere({ color: 'brass' }) })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.title).toBe('Ball')
    const fine = r.machine.build(0, 2)
    const coarse = r.machine.build(0, 1)
    expect(fine.length).toBeGreaterThan(coarse.length)
    expect(r.machine.build(0.5, 2)).toBe(fine) // meshed once, not every frame
  })

  it('refuses a field it does not know next to « sdf », and a broken tree, with the corrections', () => {
    const extra = compileIsoScene({ sdf: sphere(), stations: [] })
    expect(!extra.ok && extra.problems.join('\n')).toMatch(/unknown field « stations » next to « sdf »/)
    const broken = compileIsoScene({ sdf: { root: { kind: 'sphere' } } })
    expect(!broken.ok && broken.problems.join('\n')).toMatch(/r = undefined/)
  })
})
