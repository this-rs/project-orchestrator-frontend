/**
 * Tests for neuralRoutingApi service.
 *
 * Verifies API endpoint construction and type exports.
 * Run with: npx vitest run src/services/neuralRouting.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  RoutingMode,
  NeuralRoutingStatus,
  NeuralRoutingConfig,
  UpdateConfigRequest,
} from './neuralRouting'

// ---------------------------------------------------------------------------
// Mock the api module so we don't make real HTTP calls
// ---------------------------------------------------------------------------

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()

vi.mock('./api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}))

// Import after mocking
const { neuralRoutingApi } = await import('./neuralRouting')

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Type-level assertions (compile-time safety)
// ---------------------------------------------------------------------------

describe('RoutingMode type', () => {
  it('accepts valid routing modes', () => {
    const nn: RoutingMode = 'nn'
    const full: RoutingMode = 'full'
    expect(nn).toBe('nn')
    expect(full).toBe('full')
  })
})

describe('NeuralRoutingStatus type', () => {
  it('matches expected shape', () => {
    const status: NeuralRoutingStatus = {
      enabled: true,
      mode: 'full',
      cpu_guard_paused: false,
      metrics: {
        total_queries: 100,
        hits: 80,
        misses: 20,
        avg_latency_us: 1500,
        p99_latency_us: 5000,
        cache_size: 42,
        last_invalidated_at: null,
      },
    }
    expect(status.enabled).toBe(true)
    expect(status.mode).toBe('full')
    expect(status.metrics.total_queries).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// API method tests
// ---------------------------------------------------------------------------

describe('neuralRoutingApi', () => {
  it('getStatus calls GET /neural-routing/status', async () => {
    mockGet.mockResolvedValueOnce({ enabled: true })
    await neuralRoutingApi.getStatus()
    expect(mockGet).toHaveBeenCalledWith('/neural-routing/status')
  })

  it('getConfig calls GET /neural-routing/config', async () => {
    mockGet.mockResolvedValueOnce({ config: {} })
    await neuralRoutingApi.getConfig()
    expect(mockGet).toHaveBeenCalledWith('/neural-routing/config')
  })

  it('enable calls POST /neural-routing/enable', async () => {
    mockPost.mockResolvedValueOnce({ ok: true })
    await neuralRoutingApi.enable()
    expect(mockPost).toHaveBeenCalledWith('/neural-routing/enable')
  })

  it('disable calls POST /neural-routing/disable', async () => {
    mockPost.mockResolvedValueOnce({ ok: true })
    await neuralRoutingApi.disable()
    expect(mockPost).toHaveBeenCalledWith('/neural-routing/disable')
  })

  it('updateConfig calls PUT /neural-routing/config with payload', async () => {
    const config: UpdateConfigRequest = {
      enabled: true,
      mode: 'full',
      nn_top_k: 10,
      nn_min_similarity: 0.7,
    }
    mockPut.mockResolvedValueOnce({ ok: true })
    await neuralRoutingApi.updateConfig(config)
    expect(mockPut).toHaveBeenCalledWith('/neural-routing/config', config)
  })

  it('does not expose setMode (dead code removed)', () => {
    expect(neuralRoutingApi).not.toHaveProperty('setMode')
  })
})
