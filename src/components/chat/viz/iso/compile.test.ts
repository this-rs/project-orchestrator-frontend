import { describe, expect, it } from 'vitest'
import { assemble } from '@/vendor/three-iso/buildIn'
import { compileIsoScene, toSceneSpec, MAX_DATA_CHARS, ISO_VOCABULARY } from './compile'

const RELEASE = {
  title: 'Release',
  layout: 'arch',
  stations: [
    { mech: 'dependency-graph', tone: 'violet', label: 'Plan' },
    { mech: 'parallel-lanes', tone: 'sky', label: 'Build', after: [0] },
    { mech: 'stair-procedure', tone: 'green', label: 'Test', after: [1] },
  ],
  build: { mode: 'sequential' },
}

const SERVER = {
  kind: 'group',
  name: 'accès',
  children: [
    { kind: 'group', name: 'serveur', at: [0.5, 0.3, 0], sockets: { sommet: [0, 0, 1.5] }, children: [
      { kind: 'use', ref: 'server' },
      { kind: 'use', ref: 'chip', attach: 'sommet' },
    ] },
    { kind: 'use', ref: 'screen', at: [-0.8, -0.5, 0] },
    { kind: 'use', ref: 'agent', at: [-0.2, -0.2, 2.2], motion: { kind: 'orbit', period: 2 } },
  ],
}

describe('compileIsoScene — a scene the model wrote', () => {
  it('builds a checked scene of library mechanisms, with its legend in free text', () => {
    const r = compileIsoScene(RELEASE)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.title).toBe('Release')
    expect(r.legend.map((l) => l.label)).toEqual(['Plan', 'Build', 'Test'])
    expect(r.machine.build(r.machine.t0, 2).length).toBeGreaterThan(0)
    // The build-in plan follows the declared dependencies (sequential).
    expect(r.machine.buildPlan).toBeDefined()
  })

  it('is built layer by layer: more of the machine stands as the build-in advances', () => {
    const r = compileIsoScene(RELEASE)
    if (!r.ok) throw new Error(r.problems.join('\n'))
    const faces = r.machine.build(r.machine.t0, 2)
    const at = (p: number) => assemble(r.machine, faces, p).filter((f) => !(f as { wire?: number }).wire).length
    expect(at(0)).toBe(0)
    expect(at(0.5)).toBeLessThan(at(0.95))
    expect(assemble(r.machine, faces, 1)).toHaveLength(faces.length)
  })

  it('shows one object (a construction tree) alone, bare or under « ast »', () => {
    expect(compileIsoScene(SERVER).ok).toBe(true)
    const r = compileIsoScene({ title: 'Server', tone: 'sky', ast: SERVER })
    expect(r.ok).toBe(true)
    expect(toSceneSpec({ ast: SERVER }).spec?.layout).toBe('solo')
  })

  it('accepts the same scene twice (a conversation replayed) — one id per distinct scene', () => {
    expect(compileIsoScene(RELEASE).ok).toBe(true)
    expect(compileIsoScene(structuredClone(RELEASE)).ok).toBe(true)
    const a = toSceneSpec(RELEASE).spec!.id
    const b = toSceneSpec({ ...RELEASE, layout: 'wings' }).spec!.id
    expect(a).not.toBe(b)
  })

  it('picks a layout and tones when the model leaves them out', () => {
    const { spec } = toSceneSpec({ stations: [{ mech: 'drawers' }, { mech: 'consent-gate' }] })
    expect(spec?.layout).toBe('compact')
    expect(spec?.stations.map((s) => s.tone)).toEqual(['green', 'indigo'])
  })

  it('frames a chat scene without a central hole by default, keeps an explicit layout', () => {
    const stations = Array.from({ length: 6 }, () => ({ mech: 'drawers' }))
    const r = compileIsoScene({ stations })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.machine.anchor).toBeUndefined()
    const arch = compileIsoScene({ layout: 'arch', stations })
    expect(arch.ok).toBe(true)
    if (arch.ok) expect(arch.machine.anchor).toBeDefined()
    expect(ISO_VOCABULARY.layouts).toContain('compact')
  })
})

describe('compileIsoScene — refusals: a list of corrections, never a throw', () => {
  const refused = (data: unknown) => {
    const r = compileIsoScene(data)
    expect(r.ok).toBe(false)
    return r.ok ? [] : r.problems
  }

  it('names an unknown mechanism, object, tone or layout', () => {
    expect(refused({ stations: [{ mech: 'teleporter' }, { mech: 'drawers' }, { mech: 'drawers' }] }).join()).toMatch(/teleporter/)
    expect(refused({ ast: { kind: 'use', ref: 'spaceship' } }).join()).toMatch(/spaceship/)
    expect(refused({ stations: [{ mech: 'drawers', tone: '#ff00ff' }] }).join()).toMatch(/#ff00ff/)
    expect(refused({ layout: 'spiral', stations: [{ mech: 'drawers' }] }).join()).toMatch(/spiral/)
  })

  it('names unknown fields and wrong shapes', () => {
    expect(refused({ stations: [{ mech: 'drawers', script: 'alert(1)' }] }).join()).toMatch(/script/)
    expect(refused({ code: 'x', stations: [] }).join()).toMatch(/code/)
    expect(refused({ stations: 'drawers' }).join()).toMatch(/array/)
    expect(refused({}).join()).toMatch(/nothing to build/)
    expect(refused([1, 2]).join()).toMatch(/object/)
    expect(refused(null).join()).toMatch(/object/)
  })

  it('refuses too many stations for the layout, and a dependency cycle', () => {
    expect(refused({ layout: 'solo', stations: [{ mech: 'drawers' }, { mech: 'drawers' }] }).length).toBeGreaterThan(0)
    expect(refused({ layout: 'arch', stations: [{ mech: 'drawers', after: [2] }, { mech: 'drawers', after: [0] }, { mech: 'drawers', after: [1] }] }).join()).toMatch(/cycle/)
  })

  it('refuses a tree over the engine limits', () => {
    const many = { kind: 'group', children: Array.from({ length: 200 }, () => ({ kind: 'sphere', r: 0.1 })) }
    expect(refused(many).join()).toMatch(/160/)
  })

  it('refuses an oversized scene before the engine sees it', () => {
    const big = { title: 'x'.repeat(MAX_DATA_CHARS + 1), ast: SERVER }
    expect(refused(big).join()).toMatch(/at most/)
  })

  it('survives shapes the engine checks do not foresee', () => {
    const odd: unknown[] = [
      { kind: 'group', children: 'abc' },
      { kind: 'group', children: [null] },
      { kind: 'sphere', r: 0.3, motion: [null] },
      { kind: 'slab', size: 'big' },
      { kind: 'group', sockets: 5, children: [{ kind: 'use', ref: 'flag', attach: 'x' }] },
      { stations: [null, 1, 'a'] },
      { stations: [{ mech: 'drawers', after: 'first' }] },
      { stations: [{ ast: [] }] },
      { stations: [{ mech: 'drawers', label: 42 }] },
      { build: { mode: 'chaos' }, stations: [{ mech: 'drawers' }] },
    ]
    for (const d of odd) expect(() => compileIsoScene(d)).not.toThrow()
    for (const d of odd) expect(compileIsoScene(d).ok).toBe(false)
  })

  it('exposes the vocabulary a model can use', () => {
    expect(ISO_VOCABULARY.mechanisms).toContain('dependency-graph')
    expect(ISO_VOCABULARY.objects()).toContain('agent')
    expect(ISO_VOCABULARY.layouts).toContain('solo')
  })
})
