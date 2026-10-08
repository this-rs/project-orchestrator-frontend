import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompactionFlow } from './CompactionFlow'
import { LOOP_MS, corePulse, makeParticles, mulberry32, poseAt } from './compactionParticles'

describe('compaction particles', () => {
  it('a seed always draws the same field', () => {
    expect(makeParticles(20, 7)).toEqual(makeParticles(20, 7))
    expect(makeParticles(20, 7)).not.toEqual(makeParticles(20, 8))
    expect(mulberry32(3)()).toBe(mulberry32(3)())
  })

  it('every particle ends up at the core, smaller and fading out', () => {
    const w = 400
    const h = 72
    for (const p of makeParticles(40)) {
      // Find the start and the end of this particle's loop.
      const phase0 = p.offset % 1
      const tStart = -phase0 * LOOP_MS * p.speed
      const born = poseAt(p, tStart, w, h)
      const landed = poseAt(p, tStart + 0.999 * LOOP_MS * p.speed, w, h)
      expect(born.alpha).toBeLessThan(0.05)
      expect(landed.alpha).toBeLessThan(0.1)
      expect(landed.radius).toBeLessThan(p.size)
      expect(Math.abs(landed.x - w / 2)).toBeLessThan(w * 0.05)
      expect(Math.abs(landed.y - h / 2)).toBeLessThan(h * 0.08)
    }
  })

  it('the core pulse stays within 0..1', () => {
    for (let t = 0; t < LOOP_MS * 2; t += 100) {
      expect(corePulse(t)).toBeGreaterThanOrEqual(0.1)
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
