import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompactionFlow } from './CompactionFlow'
import { LOOP_MS, corePulse, heatColor, makeParticles, mulberry32, poseAt } from './compactionParticles'

describe('compaction particles', () => {
  const W = 400
  const H = 96

  it('a seed always draws the same field', () => {
    expect(makeParticles(20, 7)).toEqual(makeParticles(20, 7))
    expect(makeParticles(20, 7)).not.toEqual(makeParticles(20, 8))
    expect(mulberry32(3)()).toBe(mulberry32(3)())
  })

  it('a particle falls inward: it ends near the core, hot, small and invisible', () => {
    for (const p of makeParticles(60)) {
      const t0 = -(p.offset % 1) * LOOP_MS * p.speed
      const born = poseAt(p, t0, W, H)
      const landed = poseAt(p, t0 + 0.999 * LOOP_MS * p.speed, W, H)
      expect(born.alpha).toBeLessThan(0.05)
      expect(landed.alpha).toBeLessThan(0.1)
      expect(landed.heat).toBeGreaterThan(0.95)
      expect(Math.abs(landed.x - W / 2)).toBeLessThan(W * 0.03)
      expect(Math.abs(landed.y - H / 2)).toBeLessThan(H * 0.05)
      expect(landed.radius).toBeLessThan(p.size * 1.3)
    }
  })

  it('angular speed grows as the radius shrinks (the fall accelerates)', () => {
    const p = { r0: 1, theta0: 0, spin: 1, speed: 1, offset: 0, z: 0, size: 1 }
    const step = (ms: number) => {
      const a = poseAt(p, ms, W, H)
      const b = poseAt(p, ms + 20, W, H)
      return Math.hypot(b.x - a.x, (b.y - a.y) * (W / H)) / Math.max(0.05, Math.hypot(a.x - W / 2, a.y - H / 2))
    }
    expect(step(LOOP_MS * 0.8)).toBeGreaterThan(step(LOOP_MS * 0.1))
  })

  it('stays inside the field and the near side is drawn larger than the far side', () => {
    const ps = makeParticles(80)
    let nearSum = 0, nearN = 0, farSum = 0, farN = 0
    for (let t = 0; t < LOOP_MS; t += 170) {
      for (const p of ps) {
        const q = poseAt(p, t, W, H)
        expect(q.x).toBeGreaterThanOrEqual(-2)
        expect(q.x).toBeLessThanOrEqual(W + 2)
        expect(q.y).toBeGreaterThanOrEqual(-2)
        expect(q.y).toBeLessThanOrEqual(H + 2)
        if (q.depth > 0.5) { nearSum += q.radius / p.size; nearN++ }
        if (q.depth < -0.5) { farSum += q.radius / p.size; farN++ }
      }
    }
    expect(nearSum / nearN).toBeGreaterThan(farSum / farN)
  })

  it('heat runs cold indigo -> sky -> near white', () => {
    expect(heatColor(0)).toBe('99, 102, 241')
    expect(heatColor(0.6)).toBe('56, 189, 248')
    expect(heatColor(1)).toBe('236, 254, 255')
    expect(heatColor(-3)).toBe(heatColor(0))
    expect(heatColor(9)).toBe(heatColor(1))
  })

  it('the core never goes dark and never exceeds 1', () => {
    for (let t = 0; t < LOOP_MS * 2; t += 50) {
      expect(corePulse(t)).toBeGreaterThan(0.1)
      expect(corePulse(t)).toBeLessThanOrEqual(1)
    }
  })
})

describe('CompactionFlow', () => {
  it('announces the compaction as a status, even without a canvas', () => {
    render(<CompactionFlow />)
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.getByText('Compacting context')).toBeTruthy()
  })
})
