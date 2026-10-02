import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { getEventBus } from '@/services'
import type { CrudEvent } from '@/types'
import { useCrudEventSync } from '../useCrudEventSync'

type Item = { id: string; status: string }
type Cols = { addItem: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> }

function makeCols() {
  const mk = () => ({ addItem: vi.fn(), removeItem: vi.fn() })
  return { todo: mk(), done: mk() } as never
}

function emit(event: Partial<CrudEvent>) {
  const bus = getEventBus() as unknown as { listeners: Set<(e: CrudEvent) => void> }
  for (const l of bus.listeners) {
    l({
      entity_type: 'task',
      payload: {},
      timestamp: '',
      entity_id: 't1',
      action: 'updated',
      ...event,
    } as CrudEvent)
  }
}

describe('useCrudEventSync optimistic echo', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('skips the echo of the optimistic update', () => {
    const cols = makeCols() as Record<string, Cols>
    const { result } = renderHook(() => useCrudEventSync<Item>('task', cols as never))
    act(() => {
      result.current.markOptimistic('t1', 'done')
      emit({ action: 'updated', payload: { id: 't1', status: 'done' } })
      vi.advanceTimersByTime(400)
    })
    expect(cols.done.addItem).not.toHaveBeenCalled()
  })

  it('still applies a later deleted event for an optimistically moved item', () => {
    const cols = makeCols() as Record<string, Cols>
    const { result } = renderHook(() => useCrudEventSync<Item>('task', cols as never))
    act(() => {
      result.current.markOptimistic('t1', 'done')
      emit({ action: 'deleted' })
      vi.advanceTimersByTime(400)
    })
    expect(cols.todo.removeItem).toHaveBeenCalledWith('t1')
    expect(cols.done.removeItem).toHaveBeenCalledWith('t1')
  })
})
