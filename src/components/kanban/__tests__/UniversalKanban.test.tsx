import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { KanbanConfig } from '../configs/types'

const toastError = vi.fn()

vi.mock('@/hooks', () => ({
  useInfiniteScroll: () => ({ sentinelRef: { current: null } }),
  useIsMobile: () => true,
  useToast: () => ({ error: toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() }),
  useKanbanColumnData: ({ status }: { status: string }) => ({
    items: status === 'a' ? [{ id: '1', status: 'a' }] : [],
    total: 0,
    hasMore: false,
    loadingMore: false,
    loading: false,
    loadMore: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
  }),
}))
vi.mock('@/hooks/useCrudEventSync', () => ({
  useCrudEventSync: () => ({ markOptimistic: vi.fn() }),
}))

import { UniversalKanban } from '../UniversalKanban'

type Item = { id: string; status: string }

function makeConfig(onStatusChange: KanbanConfig<Item>['onStatusChange']): KanbanConfig<Item> {
  return {
    entityType: 'step',
    columns: [{ status: 'a', label: 'A', color: 'gray' }],
    fetchFn: vi.fn(),
    onStatusChange,
    renderCard: (item, _drag, ctx) => (
      <button onClick={() => void ctx?.changeStatus('not-a-column')}>move-{item.id}</button>
    ),
  }
}

describe('UniversalKanban.moveItem', () => {
  beforeEach(() => toastError.mockClear())

  it('does not leak a rejection and reports the error when the persist fails for an unloaded column', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const onStatusChange = vi.fn().mockRejectedValue(new Error('boom'))
    render(<UniversalKanban config={makeConfig(onStatusChange)} />)
    fireEvent.click(screen.getByText('move-1'))
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledWith('1', 'not-a-column'))
    await new Promise((r) => setTimeout(r, 20))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalled()
  })
})
