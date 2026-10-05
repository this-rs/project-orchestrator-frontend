import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
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
