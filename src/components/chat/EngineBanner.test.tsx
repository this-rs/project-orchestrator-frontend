import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ENGINE_FEATURE_LABELS } from '@/constants/engine'
import { EngineBanner } from './EngineBanner'

describe('EngineBanner', () => {
  it('shows nothing when the engine lists no missing feature', () => {
    render(<EngineBanner degraded={[]} />)
    expect(screen.queryByTestId('engine-banner')).toBeNull()
  })

  it('lists what is missing, in plain words, and keeps an unknown id visible', () => {
    render(<EngineBanner degraded={['hooks', 'message_queue', 'brand_new_thing']} />)
    const banner = screen.getByTestId('engine-banner')
    expect(banner.getAttribute('role')).toBe('note')
    expect(banner.textContent).toMatch(/Hooks .* do not run/)
    expect(banner.textContent).toMatch(/refused, not queued/)
    expect(banner.textContent).toMatch(/brand new thing is not available/)
  })
})

describe('EngineBanner — one sentence per known feature', () => {
  it.each(Object.entries(ENGINE_FEATURE_LABELS))('%s says "%s"', (id, sentence) => {
    render(<EngineBanner degraded={[id]} />)
    expect(screen.getByTestId('engine-banner').textContent).toContain(sentence)
    expect(sentence.length).toBeGreaterThan(15)
  })

  it('names images, so a user who cannot attach one learns why', () => {
    render(<EngineBanner degraded={['images']} />)
    expect(screen.getByTestId('engine-banner').textContent).toMatch(/Images cannot be attached/)
  })
})
