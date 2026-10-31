import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import { MemoryRouter } from 'react-router-dom'
import { useEffect } from 'react'

// Regression: entering/leaving fullscreen must MOVE the graph's DOM host, never
// unmount the graph (a remount destroyed the WebGL context and the layout, so
// the graph vanished from the canvas).
const mounts = vi.fn()
const unmounts = vi.fn()

vi.mock('../graph3d/IntelligenceGraph3D', () => ({
  default: function Fake() {
    useEffect(() => {
      mounts()
      return () => unmounts()
    }, [])
    return <canvas data-testid="graph-canvas" />
  },
}))
vi.mock('../useIntelligenceGraph', () => ({
  useIntelligenceGraph: () => ({
    nodes: [], edges: [], allNodes: [{ id: 'a' }], visibleLayers: new Set(['code']),
    toggleLayer: vi.fn(), applyPreset: vi.fn(), fetchGraph: vi.fn(),
  }),
}))
vi.mock('../useGraphWebSocket', () => ({ useGraphWebSocket: () => {} }))
vi.mock('../useProtocolRunEvents', () => ({ useProtocolRunEvents: () => {} }))
vi.mock('../NodeInspector', () => ({ NodeInspector: () => null }))
vi.mock('../LayerControls', () => ({ LayerControls: () => null }))
vi.mock('../SpreadingActivation', async (orig) => ({
  ...(await orig<object>()),
  SpreadingActivation: () => null,
}))
vi.mock('../GraphLoadingProgress', () => ({ GraphLoadingProgress: () => null }))

import IntelligenceGraphPage from '../IntelligenceGraphPage'

describe('IntelligenceGraphPage fullscreen', () => {
  it('keeps the same canvas node mounted across enter/exit', async () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter><IntelligenceGraphPage projectSlug="p" /></MemoryRouter>
      </Provider>,
    )
    const canvas = await screen.findByTestId('graph-canvas')
    expect(mounts).toHaveBeenCalledTimes(1)

    const btn = screen.getAllByRole('button').find((b) => b.getAttribute('aria-pressed') !== null)!
    fireEvent.click(btn) // enter
    expect(screen.getByTestId('graph-canvas')).toBe(canvas)
    expect(canvas.closest('[data-graph-host]')!.parentElement).toBe(document.body)

    fireEvent.click(btn) // exit
    expect(screen.getByTestId('graph-canvas')).toBe(canvas)
    expect(canvas.closest('[data-graph-host]')!.parentElement).not.toBe(document.body)

    expect(mounts).toHaveBeenCalledTimes(1)
    expect(unmounts).not.toHaveBeenCalled()
  })
})
