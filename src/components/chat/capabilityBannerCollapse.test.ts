import { describe, it, expect } from 'vitest'
import { isCollapsedFor } from './capabilityBannerCollapse'

describe('isCollapsedFor', () => {
  it('never collapsed without a choice, or with nothing missing', () => {
    expect(isCollapsedFor(null, ['images'])).toBe(false)
    expect(isCollapsedFor(['images'], [])).toBe(false)
  })

  it('collapsed while every missing feature was already seen, in any order', () => {
    expect(isCollapsedFor(['nats', 'images'], ['images', 'nats'])).toBe(true)
    expect(isCollapsedFor(['nats', 'images'], ['images'])).toBe(true)
  })

  it('a feature missing for the first time expands it', () => {
    expect(isCollapsedFor(['nats', 'images'], ['images', 'hooks'])).toBe(false)
  })
})
