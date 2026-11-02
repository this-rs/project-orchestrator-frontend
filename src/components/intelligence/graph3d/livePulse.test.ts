import { describe, it, expect } from 'vitest'
import {
  PULSE_MS,
  PulseClock,
  breathEnvelope,
  buildPulseIndex,
  pulseEnvelope,
  pulsedLinkStyle,
  pulsedNodeStyle,
  resolvePulseTarget,
} from './livePulse'
import type { Graph3DNode } from './useGraph3DLayout'
import type { NodeStyle } from './nodePoints'

const mk = (id: string): Graph3DNode => ({ id, label: id, entityType: 'note', layer: 'knowledge', x: 0, y: 0, z: 0, data: {} })

describe('pulseEnvelope', () => {
  it('is 0 at both ends and bounded in [0, 1]', () => {
    expect(pulseEnvelope(0)).toBe(0)
    expect(pulseEnvelope(1)).toBe(0)
    expect(pulseEnvelope(1.5)).toBe(0)
    expect(pulseEnvelope(-0.2)).toBe(0)
    expect(pulseEnvelope(Number.NaN)).toBe(0)
    for (let i = 0; i <= 200; i++) {
      const v = pulseEnvelope(i / 200)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('reaches 1 (normalised peak) and throbs twice (two local maxima)', () => {
    let max = 0
    const samples: number[] = []
    for (let i = 0; i <= 400; i++) {
      const v = pulseEnvelope(i / 400)
      samples.push(v)
      max = Math.max(max, v)
    }
    expect(max).toBeCloseTo(1, 2)
    let peaks = 0
    for (let i = 1; i < samples.length - 1; i++) {
      if (samples[i] > samples[i - 1] && samples[i] >= samples[i + 1] && samples[i] > 0.05) peaks++
    }
    expect(peaks).toBe(2)
  })

  it('fades: the second beat is weaker than the first', () => {
    expect(pulseEnvelope(0.73)).toBeLessThan(pulseEnvelope(0.23))
  })
})

describe('breathEnvelope', () => {
  it('stays in [0, 1] and is periodic', () => {
    for (let t = 0; t < 5000; t += 37) {
      const v = breathEnvelope(t, 1600)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(breathEnvelope(100, 1600)).toBeCloseTo(breathEnvelope(1700, 1600), 6)
  })
})

describe('PulseClock', () => {
  it('one pulse at a time per id: a re-trigger while pulsing is ignored', () => {
    const c = new PulseClock(2000)
    expect(c.trigger('a', 0)).toBe(true)
    expect(c.trigger('a', 500)).toBe(false)
    expect(c.size).toBe(1)
    // Not restarted: at t=1000 the pulse is halfway, not at 25 %.
    const { active } = c.tick(1000)
    expect(active).toEqual([{ id: 'a', act: pulseEnvelope(0.5) }])
  })

  it('ends exactly at the duration and reports the id once', () => {
    const c = new PulseClock(PULSE_MS)
    c.trigger('a', 10)
    expect(c.tick(10 + PULSE_MS - 1).ended).toEqual([])
    const end = c.tick(10 + PULSE_MS)
    expect(end.ended).toEqual(['a'])
    expect(end.active).toEqual([])
    expect(c.size).toBe(0)
    expect(c.tick(10 + PULSE_MS + 1).ended).toEqual([])
  })

  it('may pulse again after it ended', () => {
    const c = new PulseClock(100)
    c.trigger('a', 0)
    c.tick(100)
    expect(c.trigger('a', 100)).toBe(true)
  })

  it('tracks several ids independently and clear() returns them', () => {
    const c = new PulseClock(100)
    c.trigger('a', 0)
    c.trigger('b', 50)
    const t = c.tick(100)
    expect(t.ended).toEqual(['a'])
    expect(t.active.map((x) => x.id)).toEqual(['b'])
    expect(c.clear()).toEqual(['b'])
    expect(c.size).toBe(0)
  })
})

describe('buildPulseIndex / resolvePulseTarget', () => {
  const uuid = '0d9b2b8e-5c7e-4a2e-9f1a-2a6b3c4d5e6f'
  const nodes = [mk(uuid), mk('src/a.rs'), mk('src/a.rs:foo'), mk(`note:${uuid.replace('0d9b', '1111')}`)]
  const index = buildPulseIndex(nodes)

  it('resolves the exact backend id (uuid, path, path:symbol)', () => {
    expect(resolvePulseTarget(uuid, index)?.id).toBe(uuid)
    expect(resolvePulseTarget('src/a.rs', index)?.id).toBe('src/a.rs')
    expect(resolvePulseTarget('src/a.rs:foo', index)?.id).toBe('src/a.rs:foo')
  })

  it('resolves a prefixed node id by its uuid suffix, but not a symbol suffix', () => {
    const prefixed = uuid.replace('0d9b', '1111')
    expect(resolvePulseTarget(prefixed, index)?.id).toBe(`note:${prefixed}`)
    expect(resolvePulseTarget('foo', index)).toBeNull()
  })

  it('resolves a prefixed EVENT id against a raw node id', () => {
    expect(resolvePulseTarget(`note:${uuid}`, index)?.id).toBe(uuid)
  })

  it('returns null for an id that is not on screen', () => {
    expect(resolvePulseTarget('nowhere', index)).toBeNull()
  })
})

describe('pulsedNodeStyle / pulsedLinkStyle', () => {
  const base: NodeStyle = { r: 0.2, g: 0.4, b: 0.6, alpha: 0.3, size: 4, shape: 2, act: 0 }

  it('is exactly the base at act 0 (the rest state is not a special case)', () => {
    expect(pulsedNodeStyle(base, 0)).toBe(base)
    const l = { r: 0.1, g: 0.2, b: 0.3, a: 0.2 }
    expect(pulsedLinkStyle(l, 0)).toBe(l)
  })

  it('keeps colour and shape, lifts act / size / alpha with act', () => {
    const s = pulsedNodeStyle(base, 1)
    expect([s.r, s.g, s.b, s.shape]).toEqual([0.2, 0.4, 0.6, 2])
    expect(s.act).toBeCloseTo(0.95)
    expect(s.size).toBeCloseTo(4 * 1.45)
    expect(s.alpha).toBe(1)
    const half = pulsedNodeStyle(base, 0.5)
    expect(half.act).toBeLessThan(s.act)
    expect(half.size).toBeLessThan(s.size)
  })

  it('never lowers a base that is already higher', () => {
    const lit: NodeStyle = { ...base, act: 0.99, alpha: 1 }
    const s = pulsedNodeStyle(lit, 0.2)
    expect(s.act).toBe(0.99)
    expect(s.alpha).toBe(1)
  })

  it('whitens and brightens a link, clamped to 1', () => {
    const l = { r: 0.1, g: 0.2, b: 0.3, a: 0.05 }
    const s = pulsedLinkStyle(l, 1)
    expect(s.r).toBeGreaterThan(l.r)
    expect(s.g).toBeGreaterThan(l.g)
    expect(s.b).toBeGreaterThan(l.b)
    expect(s.a).toBeLessThanOrEqual(1)
    expect(s.a).toBeGreaterThan(l.a)
  })
})
