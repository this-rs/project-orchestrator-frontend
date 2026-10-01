import { describe, it, expect } from 'vitest'
import { computeStepRefreshKey } from '../stepRefreshKey'

const step = (id: string, status: string) => ({ id, status })

describe('computeStepRefreshKey', () => {
  it('differs when a step moves between statuses of equal length (pending -> skipped)', () => {
    expect(computeStepRefreshKey([step('a', 'pending')])).not.toBe(
      computeStepRefreshKey([step('a', 'skipped')])
    )
  })

  it('differs when two steps swap statuses', () => {
    expect(computeStepRefreshKey([step('a', 'pending'), step('b', 'skipped')])).not.toBe(
      computeStepRefreshKey([step('a', 'skipped'), step('b', 'pending')])
    )
  })

  it('is stable for identical input', () => {
    expect(computeStepRefreshKey([step('a', 'pending')])).toBe(
      computeStepRefreshKey([step('a', 'pending')])
    )
  })
})
