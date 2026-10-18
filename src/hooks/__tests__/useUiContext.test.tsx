import { renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { uiContextAtom } from '@/atoms/anchors'
import { useUiContext } from '../useUiContext'

describe('useUiContext', () => {
  it('declares the page entity while mounted, and clears only its own on unmount', () => {
    const store = createStore()
    const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>
    const page = renderHook(({ id }) => useUiContext('plan', id, 'Auth flow'), { wrapper, initialProps: { id: null as string | null } })
    expect(store.get(uiContextAtom)).toBeNull()
    page.rerender({ id: 'p1' })
    expect(store.get(uiContextAtom)).toEqual({ kind: 'plan', id: 'p1', label: 'Auth flow' })
    // Another page took over: unmounting the first one leaves it.
    store.set(uiContextAtom, { kind: 'task', id: 't1' })
    page.unmount()
    expect(store.get(uiContextAtom)).toEqual({ kind: 'task', id: 't1' })
    const second = renderHook(() => useUiContext('note', 'n1'), { wrapper })
    expect(store.get(uiContextAtom)).toEqual({ kind: 'note', id: 'n1' })
    second.unmount()
    expect(store.get(uiContextAtom)).toBeNull()
  })
})
