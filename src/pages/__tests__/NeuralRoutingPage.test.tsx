import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { installMatchMedia } from './testEnv'

const api = vi.hoisted(() => ({
  getStatus: vi.fn(),
  getConfig: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  updateConfig: vi.fn(),
}))
const toast = { success: vi.fn(), error: vi.fn() }

vi.mock('@/services/neuralRouting', () => ({ neuralRoutingApi: api }))
vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useToast: () => toast,
}))

installMatchMedia()

import { NeuralRoutingPage } from '../NeuralRoutingPage'

const status = {
  enabled: true,
  mode: 'nn' as const,
  cpu_guard_paused: false,
  metrics: {
    total_queries: 200,
    hits: 150,
    misses: 50,
    avg_latency_us: 2500,
    p99_latency_us: 9000,
    cache_size: 42,
    last_invalidated_at: null,
  },
}
const config = {
  enabled: true,
  mode: 'nn' as const,
  inference: { timeout_ms: 15, nn_fallback: true },
  collection: { enabled: false, buffer_size: 100, flush_interval_secs: 30 },
  nn: { top_k: 5, min_similarity: 0.65, max_route_age_days: 90 },
}

describe('NeuralRoutingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getStatus.mockResolvedValue(status)
    api.getConfig.mockResolvedValue({ config })
    api.enable.mockResolvedValue({ ok: true })
    api.disable.mockResolvedValue({ ok: true })
    api.updateConfig.mockResolvedValue({ ok: true })
  })

  it('shows status and metrics with their plain meaning', async () => {
    render(<NeuralRoutingPage />)
    expect(await screen.findByText('75.0%')).toBeTruthy()
    expect(screen.getByText('Enabled')).toBeTruthy()
    expect(screen.getByText('Mode NN')).toBeTruthy()
    expect(screen.getByText('200')).toBeTruthy()
    expect(screen.getByText(/150 routed by a known neighbour/)).toBeTruthy()
    expect(screen.getByText('2.5 ms')).toBeTruthy()
    expect(screen.getByText(/9.0 ms worst case/)).toBeTruthy()
    expect(screen.getByText('never cleared')).toBeTruthy()
    // collection buffer / flush facts kept
    expect(screen.getByText('buffer 100 entries')).toBeTruthy()
    expect(screen.getByText('flush every 30s')).toBeTruthy()
  })

  it('toggles routing and boolean settings with switches', async () => {
    render(<NeuralRoutingPage />)
    await screen.findByText('75.0%')
    const main = screen.getByRole('switch', { name: 'Neural routing' })
    expect(main.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(main)
    await waitFor(() => expect(api.disable).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('switch', { name: 'NN fallback' }))
    await waitFor(() => expect(api.updateConfig).toHaveBeenCalledWith({ nn_fallback: false }))
    fireEvent.click(screen.getByRole('switch', { name: 'Trajectory collection' }))
    await waitFor(() => expect(api.updateConfig).toHaveBeenCalledWith({ collection_enabled: true }))
  })

  it('saves parameters only once something changed', async () => {
    render(<NeuralRoutingPage />)
    await screen.findByText('75.0%')
    const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('NN top-K'), { target: { value: '8' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    await waitFor(() =>
      expect(api.updateConfig).toHaveBeenCalledWith({
        mode: 'nn',
        inference_timeout_ms: 15,
        nn_top_k: 8,
        nn_min_similarity: 0.65,
        nn_max_route_age_days: 90,
      }),
    )
  })

  it('explains the empty metrics state', async () => {
    api.getStatus.mockResolvedValue({ ...status, metrics: { ...status.metrics, total_queries: 0 } })
    render(<NeuralRoutingPage />)
    expect(await screen.findByText('No queries recorded')).toBeTruthy()
  })
})
