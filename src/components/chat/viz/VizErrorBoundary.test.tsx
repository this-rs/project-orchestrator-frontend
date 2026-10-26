import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VizErrorBoundary } from './VizBlockRenderer'

function Boom(): never {
  throw new Error('lamps: 3 > 2 (shader array)')
}

describe('VizErrorBoundary', () => {
  it('shows the cause of a failed render, not only that it failed', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <VizErrorBoundary fallbackText="the fallback text">
        <Boom />
      </VizErrorBoundary>,
    )
    expect(screen.getByText('Visualization failed to render')).toBeTruthy()
    expect(screen.getByTestId('viz-error').textContent).toBe('lamps: 3 > 2 (shader array)')
    expect(screen.getByText('the fallback text')).toBeTruthy()
    spy.mockRestore()
  })
})
