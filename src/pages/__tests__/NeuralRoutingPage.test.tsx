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
    cache_hits: 40,
    hit_rate: 0.75,
    cache_hit_rate: 0.2,
    avg_similarity: 0.88,
    avg_reward: 0.5,
  },
}
const config = {
  enabled: true,
  mode: 'nn' as const,
  inference: { timeout_ms: 15, nn_fallback: true },
  collection: { enabled: false, buffer_size: 100, stale_session_timeout_secs: 60 },
  nn: { top_k: 5, min_similarity: 0.65, max_route_age_days: 90, cache_capacity: 1000, cache_ttl_secs: 300 },
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
    expect(screen.getByText(/150 routed by a known neighbour, 50 without a match/)).toBeTruthy()
    expect(screen.getByText('20.0%')).toBeTruthy()
    expect(screen.getByText(/40 answered from memory/)).toBeTruthy()
    expect(screen.getByText('88.0%')).toBeTruthy()
    expect(screen.getByText('buffer 100 entries')).toBeTruthy()
    expect(screen.getByText('idle sessions closed after 60s')).toBeTruthy()
  })

  it('does not crash when the backend omits a metric', async () => {
    // Guards the regression where the page read fields the backend never sends
    // (cache_size, avg_latency_us…) and threw as soon as one query was recorded.
    api.getStatus.mockResolvedValue({ ...status, metrics: { total_queries: 5, hits: 2 } })
    render(<NeuralRoutingPage />)
    expect(await screen.findByText('Queries')).toBeTruthy()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
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

  it('shows a page-level error with retry when the first load fails', async () => {
    api.getStatus.mockRejectedValueOnce(new Error('backend down'))
    render(<NeuralRoutingPage />)
    expect(await screen.findByText('backend down')).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Neural routing' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('75.0%')).toBeTruthy()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('explains the empty metrics state', async () => {
    api.getStatus.mockResolvedValue({ ...status, metrics: { ...status.metrics, total_queries: 0 } })
    render(<NeuralRoutingPage />)
    expect(await screen.findByText('No queries recorded')).toBeTruthy()
  })
})
