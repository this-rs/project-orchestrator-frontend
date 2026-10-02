import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider, createStore } from 'jotai'
import type { ReactNode } from 'react'
import { skillRefreshAtom } from '@/atoms'
import type { CrudEvent } from '@/types'

let handler: ((e: CrudEvent) => void) | null = null
vi.mock('../useEventBus', () => ({
  useEventBus: (cb: (e: CrudEvent) => void) => {
    handler = cb
  },
}))

import { useCrudEventRefresh } from '../useCrudEventRefresh'

describe('useCrudEventRefresh', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('bumps skillRefreshAtom on a skill CRUD event', () => {
    const store = createStore()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )
    renderHook(() => useCrudEventRefresh(), { wrapper })
    act(() => {
      handler!({
        entity_type: 'skill',
        action: 'updated',
        entity_id: 's1',
        payload: {},
        timestamp: '',
      })
      vi.advanceTimersByTime(600)
    })
    expect(store.get(skillRefreshAtom)).toBe(1)
  })
})
