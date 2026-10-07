/**
 * "Actualiser" on the Claude catalog: asks the backend, re-reads a few times,
 * never throws and never blocks, even when the backend is down.
 *
 * Run with: npx vitest run src/atoms/__tests__/modelCatalogRefresh.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
const catalog = vi.fn()
vi.mock('@/services', () => ({
  chatApi: { refreshModelCatalog: () => refresh(), getModelCatalog: () => catalog() },
}))

import { refreshModelCatalog } from '../modelCatalog'

const model = { id: 'claude-haiku-5-5' } as never

describe('refreshModelCatalog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    refresh.mockReset()
    catalog.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('returns at once, then re-reads the catalog and clears the spinner', async () => {
    refresh.mockResolvedValue({ started: true, refreshing: true })
    catalog.mockResolvedValue([model])
    const set = vi.fn()
    const setRefreshing = vi.fn()
    refreshModelCatalog(set, vi.fn(), setRefreshing)
    expect(setRefreshing).toHaveBeenLastCalledWith(true)
    await vi.advanceTimersByTimeAsync(16000)
    expect(set).toHaveBeenCalledWith([model])
    expect(setRefreshing).toHaveBeenLastCalledWith(false)
  })

  it('keeps the current list when the backend is unreachable', async () => {
    refresh.mockRejectedValue(new Error('down'))
    catalog.mockRejectedValue(new Error('down'))
    const set = vi.fn()
    const setRefreshing = vi.fn()
    refreshModelCatalog(set, vi.fn(), setRefreshing)
    await vi.advanceTimersByTimeAsync(16000)
    expect(set).not.toHaveBeenCalled()
    expect(setRefreshing).toHaveBeenLastCalledWith(false)
  })
})
